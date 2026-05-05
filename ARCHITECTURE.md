# Media Scraper - Architecture Plan

## Context

Build a full-stack media scraper: Bun backend accepts URLs, scrapes images/videos, stores in SQL, React frontend displays results. Must handle 5000 concurrent scraping requests on 1 CPU / 1GB RAM.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Bun | Lower memory (~30-40MB vs Node's ~50-80MB), built-in `fetch` (no undici needed), runs `.ts` natively (no tsx/ts-node) |
| API | Hono + TypeScript | ~14KB, 3-5x faster routing than Express, Bun-native adapter via `Bun.serve()`, built-in validation with `@hono/zod-validator` |
| Queue | BullMQ + Redis | Concurrency control, retries, backpressure — critical for 5000-request constraint |
| Scraping | cheerio + built-in `fetch` | cheerio ~3MB vs puppeteer's ~300MB; Bun's native fetch replaces undici |
| Database | PostgreSQL 16 | Better write concurrency than SQLite; full-text search via ILIKE |
| ORM | Drizzle | Zero binary overhead (Prisma's query engine adds ~50-80MB RAM). Pure JS/TS, SQL-like API, direct PostgreSQL driver |
| DB Driver | postgres (via `drizzle-orm/postgres-js`) | Lightweight, no native bindings needed |
| Frontend | React 18 + Vite + Tailwind | Required by spec, fast to build |
| Load Test | k6 | JS-scriptable, simulates 5000 VUs easily |
| Containers | Docker Compose | Required by spec |

---

## Project Structure

```
media-scraper/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── drizzle/
│   │   └── migrations/
│   ├── src/
│   │   ├── index.ts                  # Hono app + BullMQ worker bootstrap
│   │   ├── config.ts                 # Env vars
│   │   ├── scrape/                   # Scraping feature module
│   │   │   ├── scrape.routes.ts      # POST /api/scrape, GET /api/scrape/:batchId
│   │   │   ├── scrape.service.ts     # HTML fetch + cheerio extraction
│   │   │   ├── scrape.queue.ts       # BullMQ queue instance
│   │   │   └── scrape.worker.ts      # BullMQ worker (concurrency: 10)
│   │   ├── media/                    # Media feature module
│   │   │   ├── media.routes.ts       # GET /api/media (paginated, filtered)
│   │   │   └── media.service.ts      # DB queries for media
│   │   ├── db/
│   │   │   ├── schema.ts             # Drizzle table definitions
│   │   │   └── index.ts              # Drizzle client + postgres connection
│   │   └── lib/
│   │       └── redis.ts
│   └── tests/
│       ├── integration.ts            # Pipeline integration test
│       └── load/
│           └── scrape.load.js        # k6 script
├── frontend/
│   ├── Dockerfile                    # Multi-stage: Bun build → nginx serve
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── ScrapeForm.tsx
│       │   ├── BatchStatus.tsx
│       │   ├── MediaGrid.tsx
│       │   ├── MediaCard.tsx
│       │   ├── FilterBar.tsx
│       │   └── Pagination.tsx
│       └── hooks/
│           ├── useMedia.ts
│           └── useScrapeStatus.ts
└── nginx/
    └── default.conf
```

Feature-based structure: each domain (`scrape/`, `media/`) groups its routes, services, queue, and worker together. Shared infrastructure (`db/`, `lib/`) stays separate.

Single backend process runs both Hono API and BullMQ worker in-process (saves container overhead on 1GB RAM).

---

## Database Schema (Drizzle)

**3 tables:** `batches` → `scrape_jobs` → `media`

```typescript
// src/db/schema.ts
import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').notNull().default('pending'),     // pending | processing | completed | failed
  totalUrls: integer('total_urls').notNull(),
  completed: integer('completed').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const scrapeJobs = pgTable('scrape_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  sourceUrl: text('source_url').notNull(),
  status: text('status').notNull().default('pending'),     // pending | processing | completed | failed
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('scrape_jobs_batch_id_idx').on(table.batchId),
  index('scrape_jobs_status_idx').on(table.status),
]);

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => scrapeJobs.id),
  sourceUrl: text('source_url').notNull(),                 // Page it was scraped from
  mediaUrl: text('media_url').notNull(),                   // Actual image/video URL
  type: text('type').notNull(),                            // "image" | "video"
  title: text('title'),                                    // alt text or title attribute
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('media_type_idx').on(table.type),
  index('media_job_id_idx').on(table.jobId),
]);
```

- **Batch**: groups a single API request. Counter caches (`completed`, `failed`) avoid expensive COUNT queries.
- **ScrapeJob**: one per URL. Status: pending → processing → completed/failed.
- **Media**: one per discovered image/video.
- Indexes on `type`, `batchId`, `status` for query performance.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/scrape` | Accept `{ urls: string[] }`, create batch, enqueue jobs. Returns `{ batchId, status }`. Max 500 URLs per request. |
| `GET` | `/api/scrape/:batchId` | Poll batch status + per-job progress |
| `GET` | `/api/media` | Paginated media list. Query params: `page`, `limit`, `type` (image/video), `search` (ILIKE on mediaUrl + title) |

The scrape endpoint is **async** — it enqueues and returns immediately (fast response even under 5000 requests).

Validation via `@hono/zod-validator` on the scrape endpoint:
```typescript
const scrapeSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(500),
});
```

---

## Scraping Pipeline (the hard part)

```
POST /api/scrape → DB insert → BullMQ enqueue → return 201
                                    ↓
                            Redis Queue ("scrape")
                                    ↓
                        Worker (concurrency: 10, rate: 50/sec)
                                    ↓
                    fetch(url) → cheerio.load(html)
                                    ↓
                    Extract <img>, <video>, <source>, video <a> links
                                    ↓
                    Batch INSERT media rows → update job/batch status
```

**Memory safety:**
- Worker concurrency: 10 (each fetch+parse ~2-5MB = ~50MB max)
- Response body limit: 2MB (abort larger responses)
- Fetch timeout: 10s per URL (via `AbortSignal.timeout(10_000)`)
- BullMQ rate limiter: 50 jobs/sec
- 3 retries with exponential backoff
- Graceful shutdown on SIGTERM

**Memory budget (1GB total) — improved with Bun + Drizzle:**
- Backend (Bun + Hono + Drizzle + BullMQ worker): ~300-400MB
- PostgreSQL: ~256MB
- Redis: ~192MB (maxmemory 128mb + overhead)
- Frontend (nginx): ~40MB
- **~200MB more headroom** than the Node + Express + Prisma stack

---

## Frontend

- **ScrapeForm**: textarea for URLs + submit → `POST /api/scrape`
- **BatchStatus**: polls `GET /api/scrape/:batchId` every 2s, shows progress bar
- **MediaGrid**: CSS grid of MediaCards with lazy loading
- **FilterBar**: type dropdown (All/Image/Video) + search input
- **Pagination**: page navigation
- State: plain `useState` + `useEffect` — no Redux needed

---

## Docker Compose

4 services:
1. **backend** (`oven/bun:alpine`) — 400MB limit, depends on postgres + redis
2. **frontend** (nginx alpine serving Vite build) — ~40MB
3. **postgres:16-alpine** — 256MB limit, healthcheck via `pg_isready`
4. **redis:7-alpine** — 192MB limit, `--maxmemory 128mb --maxmemory-policy allkeys-lru`

---

## Load Test (k6)

- `shared-iterations` executor: 100 VUs, 5000 total iterations
- Each iteration: `POST /api/scrape` with 1 URL
- Thresholds: p95 response < 2s, failure rate < 1%
- Validates the API can accept and enqueue 5000 requests without crashing

---

## Implementation Order

1. **Foundation**: project scaffold, docker-compose with PG + Redis, Drizzle schema + migration, config/singletons
2. **Scraping pipeline**: `scraper.service.ts` (cheerio extraction), BullMQ queue + worker, `POST /api/scrape`, `GET /api/scrape/:batchId`
3. **Media API**: `GET /api/media` with pagination/filtering
4. **Frontend**: ScrapeForm → BatchStatus → MediaGrid + FilterBar + Pagination
5. **Docker**: backend + frontend Dockerfiles, finalize compose with resource limits
6. **Load test**: k6 script, run and tune worker concurrency
7. **Polish**: logging (pino), graceful shutdown

---

## Verification

1. `docker compose up` — all 4 services start healthy
2. `curl -X POST localhost:3001/api/scrape -H 'Content-Type: application/json' -d '{"urls":["https://example.com"]}'` — returns 201 with batchId
3. Poll batch status until completed, verify media rows created
4. `curl 'localhost:3001/api/media?type=image&page=1&limit=10'` — returns paginated results
5. Open `localhost:3000` — frontend renders, scraping works end-to-end
6. Run k6 load test — 5000 requests complete, thresholds pass
