# Media Scraper - Architecture

## Context

Full-stack media scraper: Bun backend accepts URLs, scrapes images/videos, stores in PostgreSQL, React frontend displays results. Must handle 5000 concurrent scraping requests on 1 CPU / 1GB RAM.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Bun | Lower memory (~30-40MB vs Node's ~50-80MB), built-in `fetch`, runs `.ts` natively |
| API | Hono + TypeScript | ~14KB, 3-5x faster routing than Express, built-in validation with `@hono/zod-validator` |
| Queue | BullMQ + Redis | Concurrency control, retries, backpressure — critical for 5000-request constraint |
| Scraping | htmlparser2 + built-in `fetch` | SAX streaming parser — never buffers the full HTML or builds a DOM tree; memory use is proportional to extracted results, not page size |
| Database | PostgreSQL 16 | Better write concurrency than SQLite; full-text search via ILIKE |
| ORM | Drizzle | Zero binary overhead (Prisma's query engine adds ~50-80MB RAM). Pure JS/TS, SQL-like API |
| DB Driver | postgres (via `drizzle-orm/postgres-js`) | Lightweight, no native bindings needed |
| Frontend | React + Vite + Tailwind | Fast to build, required by spec |
| Load Test | k6 | JS-scriptable, simulates 5000 VUs easily |
| Containers | Docker Compose | Required by spec |

---

## Project Structure

```
media-scraper/
├── Dockerfile                        # Single root Dockerfile with named stages (backend / frontend)
├── docker-compose.yml
├── .dockerignore
├── package.json                      # Bun workspace root (backend, frontend, packages/*)
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── drizzle/
│   │   └── migrations/
│   ├── src/
│   │   ├── index.ts                  # Hono app + BullMQ worker bootstrap
│   │   ├── config.ts                 # Env vars
│   │   ├── scrape/
│   │   │   ├── scrape.routes.ts      # POST /api/scrape, GET /api/scrape/:batchId
│   │   │   ├── scrape.service.ts     # fetchStream → extractFromStream → fetchAndExtract
│   │   │   ├── scrape.queue.ts       # BullMQ queue instance
│   │   │   └── scrape.worker.ts      # BullMQ worker (concurrency: 10)
│   │   ├── media/
│   │   │   ├── media.routes.ts       # GET /api/media (paginated, filtered)
│   │   │   └── media.service.ts      # DB queries for media
│   │   ├── db/
│   │   │   ├── schema.ts             # Drizzle table definitions
│   │   │   └── index.ts              # Drizzle client + postgres connection
│   │   └── lib/
│   │       └── redis.ts
│   └── tests/
│       ├── integration.ts
│       └── load/
│           └── scrape.load.js        # k6 script
├── frontend/
│   ├── package.json
│   ├── nginx.conf
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
└── packages/
    └── types/                        # Shared Zod schemas + inferred TS types
        └── src/
            ├── scrape.ts
            └── media.ts
```

Feature-based structure: each domain (`scrape/`, `media/`) groups its routes, services, queue, and worker. Shared infrastructure (`db/`, `lib/`) stays separate. Types shared between backend and frontend live in `packages/types` and are imported as `@media-scraper/types`.

Single backend process runs both Hono API and BullMQ worker in-process (saves container overhead on 1GB RAM).

---

## Database Schema (Drizzle)

**3 tables:** `batches` → `scrape_jobs` → `media`

```typescript
export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').notNull().default('pending'),  // pending | processing | completed | failed
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
  status: text('status').notNull().default('pending'),
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
  sourceUrl: text('source_url').notNull(),
  mediaUrl: text('media_url').notNull(),
  type: text('type').notNull(),          // "image" | "video"
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('media_type_idx').on(table.type),
  index('media_job_id_idx').on(table.jobId),
]);
```

- **Batch**: groups a single API request. Counter caches (`completed`, `failed`) avoid expensive COUNT queries.
- **ScrapeJob**: one per URL. Status: pending → processing → completed/failed.
- **Media**: one per discovered image/video.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/scrape` | Accept `{ urls: string[] }`, create batch, enqueue jobs. Returns `{ batchId, status }`. Max 500 URLs. |
| `GET` | `/api/scrape/:batchId` | Poll batch status + per-job progress |
| `GET` | `/api/media` | Paginated media list. Query params: `page`, `limit`, `type` (image/video), `search` |

The scrape endpoint is **async** — it enqueues and returns immediately.

---

## Scraping Pipeline

```
POST /api/scrape → DB insert → BullMQ enqueue → return 201
                                    ↓
                            Redis Queue ("scrape")
                                    ↓
                        Worker (concurrency: 10, rate: 50/sec)
                                    ↓
                    fetchStream(url) → ReadableStream
                                    ↓
                    extractFromStream() — SAX events, no full DOM
                    (<img>, <video>, <source>, video <a> links)
                                    ↓
                    Batch INSERT media rows → update job/batch status
```

### scrape.service.ts flow

Three functions with a single responsibility each:

- **`fetchStream(url)`** — HTTP only: makes the request with browser-like headers, validates the response, returns `response.body` as a `ReadableStream`.
- **`extractFromStream(stream, baseUrl)`** — parsing only: pumps stream chunks into an `htmlparser2` SAX parser, collects `MediaItem` results via tag callbacks, returns them when the stream ends. Uses `Promise.withResolvers()` to bridge the callback-based parser API with async/await without nesting a Promise constructor around an async IIFE.
- **`fetchAndExtract(url)`** — composes the two: `return extractFromStream(await fetchStream(url), url)`.

### Why SAX streaming over cheerio

cheerio's `load(html)` requires the full HTML string in memory, then builds a complete DOM tree (~3–5× the raw HTML size). With 10 concurrent workers, a large page (1MB HTML → ~5MB DOM × 10) could spike to 50MB+ just for parse buffers.

The SAX parser emits events as bytes arrive — it holds only its internal sliding window (a few KB) at a time. Worker memory use is now proportional to the number of media items found, not the page size. No body size cap is needed.

### Memory safety

- Worker concurrency: 10
- Fetch timeout: 10s per URL (`AbortSignal.timeout`)
- BullMQ rate limiter: 50 jobs/sec
- 3 retries with exponential backoff
- Graceful shutdown on SIGTERM

---

## Docker

Single root `Dockerfile` with named stages — both services share a `base` stage and are selected via `--target`:

```yaml
# docker-compose.yml
backend:
  build: { context: ., dockerfile: Dockerfile, target: backend }
frontend:
  build: { context: ., dockerfile: Dockerfile, target: frontend }
```

All workspace `package.json` manifests are copied into `base` before `bun install` so Bun can resolve `workspace:*` references across the monorepo. Only the source files needed per service are copied after.

**Resource constraints:**

The 1 CPU / 1 GB memory constraint applies to the **backend container only**. PostgreSQL, Redis, and the nginx frontend have no enforced limits and are free to use available host resources.

| Service | CPU limit | Memory limit |
|---------|-----------|--------------|
| Backend | 1.0 | 1 GB |
| PostgreSQL | — | — |
| Redis | — | — |
| Frontend (nginx) | — | — |

---

## Load Test (k6)

- `shared-iterations` executor: 100 VUs, 5000 total iterations
- Each iteration: `POST /api/scrape` with 1 URL
- Thresholds: p95 response < 2s, failure rate < 1%

---

## Verification

1. `docker compose up --build` — all 4 services start healthy
2. `curl -X POST localhost:3001/api/scrape -H 'Content-Type: application/json' -d '{"urls":["https://example.com"]}'` — returns 201 with batchId
3. Poll `GET localhost:3001/api/scrape/:batchId` until `status: completed`
4. `curl 'localhost:3001/api/media?type=image&page=1&limit=10'` — returns paginated results
5. Open `localhost:3000` — frontend renders, scraping works end-to-end
6. Run k6 load test — 5000 requests complete, thresholds pass
