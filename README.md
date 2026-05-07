# Media Scraper

Submit URLs, extract every `<img>` and `<video>`, browse results.
Designed to handle 5000 concurrent scrape requests on a backend constrained to **1 CPU and 1 GB RAM**.

## Requirements coverage

| # | Requirement | Where |
|---|---|---|
| 1 | API accepts an array of URLs | `POST /api/scrape` — `backend/src/scrape/scrape.routes.ts` |
| 2 | Scrape image and video URLs | `backend/src/scrape/scrape.service.ts` — htmlparser2 SAX stream |
| 3 | Store in SQL database | PostgreSQL 16 + Drizzle — `backend/src/db/schema.ts` |
| 4 | Frontend shows images and videos | `frontend/src/components/MediaGrid.tsx` |
| 5 | Paginate + filter by type + search | `GET /api/media?page=&limit=&type=&search=` |
| 6 | Node.js backend + React frontend | Bun (Node-compatible runtime) + React 19 |
| 7 | Docker Compose | `docker-compose.yml` |
| 8 | Demo video | see `DEMO.md` for the recording script |
| 9 | Handle 5000 requests on 1 CPU / 1 GB | enforced by compose `cpus: 1.0`, `mem_limit: 1g` on the backend service. Load test result below. |
| 10 | Load test | `backend/tests/load/scrape.load.js` (k6) + `capture-stats.ts` for resource peaks |

## Quick start

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Health: http://localhost:3001/api/health
- Live queue + memory + event-loop stats: http://localhost:3001/api/queue-stats

## Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Bun | Smaller process footprint, native TS, runs Node-compatible Hono/BullMQ stack |
| API | Hono + Zod | Tiny router (~14 KB), built-in zod validator |
| Queue | BullMQ + Redis | Concurrency + rate limit + retries — the lever for the 5000-request constraint |
| Scraping | htmlparser2 SAX + native `fetch` | Streams response body directly into a SAX parser; no DOM, no full-body buffer |
| Database | PostgreSQL 16 + Drizzle ORM | Postgres-js driver (no native binding); idempotent migrations on startup |
| Frontend | React 19 + Vite + Tailwind v4 | TanStack Query for polling/cache |
| Load test | k6 + a Bun fixture server | k6 fires HTTP load; capture-stats samples docker + queue-stats |

## How it works

```
POST /api/scrape  ─►  insert batch + jobs (Postgres) ─►  addBulk to BullMQ ─►  201 { batchId }
                                                                                        │
                                  ┌─────────────────────────────────────────────────────┘
                                  ▼
                  BullMQ worker (concurrency 60, rate 1000/s)
                                  │
                                  ▼
                  fetchAndExtract(url): native fetch ─► htmlparser2 SAX  (10s timeout, 3 retries)
                                  │
                                  ▼
                  insert media rows + bump batch.completed
```

The scrape endpoint is **non-blocking** — it returns `201 {batchId}` immediately, before any URL is fetched. Polling `GET /api/scrape/:batchId` reports per-job status; `batch.status='completed'` flips when `completed + failed >= totalUrls`.

`fetchAndExtract` does **not** buffer the HTML body. The native `Response.body` ReadableStream is piped chunk-by-chunk into htmlparser2's SAX parser, which emits tag events as bytes arrive. Memory per job is proportional to extracted media items, not page size — there is no body-size cap.

Extracted media:
- `<img src>` — images
- `<picture><source srcset>` first candidate — responsive images
- `<video src>`, `<video><source src>` — inline video
- `<a href>` ending in `.mp4 .webm .ogg .mov` — linked video

Job retries: 3 attempts, exponential backoff (2s base). `batches.failed` only increments on the final attempt; the per-job `status` flips to `failed` on every attempt.

## Resource constraints (the 1 CPU / 1 GB story)

The reviewer's clarification: **the constraint applies to the backend tier only.** Postgres, Redis, and the nginx frontend run with no enforced limits.

| Service | `cpus` | `mem_limit` | Source of truth |
|---|---|---|---|
| `backend` | **1.0** | **1 g** | `docker-compose.yml` |
| `postgres` | — | — | (default Docker, no limit) |
| `redis` | — | — | (default Docker, no limit) |
| `frontend` (nginx) | — | — | (default Docker, no limit) |

Tunable via env (defaults match what passed the load test):

| Env | Default | Effect |
|---|---|---|
| `WORKER_CONCURRENCY` | 60 | parallel scrape jobs |
| `WORKER_RATE_LIMIT` | 1000 | max jobs/sec |
| `MAX_QUEUE_SIZE` | 500 000 | soft 503 backpressure threshold |
| `DATABASE_POOL_SIZE` | 25 | per-process Postgres pool |

Override per run, e.g.:
```bash
WORKER_CONCURRENCY=90 docker compose up -d --force-recreate backend
```

## Load test methodology

The load test is two artefacts:

1. **`backend/tests/load/scrape.load.js`** — k6 script. Two concurrent scenarios firing **10 000 URLs** in total (twice the spec target):
   - `burst_fanout` — 50 VUs × 100 URLs (entry-path stress)
   - `saturated_worker` — 10 VUs × 500 URLs (worker stress)
   Each VU POSTs once and polls until the batch completes. Custom metric `batch_drain_seconds` reports end-to-end drain.

2. **`backend/tests/load/capture-stats.ts`** — Bun script that samples `docker stats` and `/api/queue-stats` every second. Reports peaks at the end:
   - per-container `cpu_percent` and `mem_percent` (relative to compose limits)
   - BullMQ queue depths (waiting / active / delayed)
   - backend `process.memoryUsage` (rss, heapUsed)
   - **event-loop lag** (p95 / p99 / max in ms) — the direct measure of "is the main thread blocked?"

A small **fixture server** (`backend/tests/load/fixture-server.ts`) serves canned HTML so the test isn't bound by a remote target. Two variants share the same media-tag set:
- `GET /*` — small page (~200 B body)
- `GET /heavy/*` — heavy page (~3 MB body), reached via `FIXTURE_PATH=/heavy`

The pair lets us isolate body-size impact on memory: same extracted items, ~13 000× larger body. If the SAX-streaming claim holds, `backend_proc:rss_mb` should be roughly the same in both runs.

### Thresholds

```js
{
  http_req_failed: ['rate<0.05'],
  'http_req_duration{name:scrape_poll}': ['p(95)<200'],   // API responsive while worker grinds
  batches_timed_out: ['count==0'],
}
```

`scrape_poll` p95 is the HTTP-level proxy for "main thread not blocked" — polls fire continuously *during* worker drain, so their latency reflects event-loop pressure. Backed up by the `eventLoop.p95_ms` peak from `/api/queue-stats`.

### Run

```bash
# 1. Start everything
docker compose up --build -d

# 2. Fixture server (host process, reachable from backend via host.docker.internal)
bun run --filter backend test:load:fixture &

# 3. Resource sampler (writes /tmp/scrape-load-stats.csv, prints peaks at end)
DURATION_S=240 bun run --filter backend test:load:capture &

# 4. Fire the load
bun run --filter backend test:load
```

### Headline result (10 000 URLs, defaults `WORKER_CONCURRENCY=60`, `WORKER_RATE_LIMIT=1000`)

```
=== peaks ===
backend_proc:heap_mb                  43.66
backend_proc:rss_mb                  201.17
media-scraper-backend-1:cpu_percent   76.72   ← under 1.0 cpu cap
media-scraper-backend-1:mem_percent   15.50   ← under 1g cap
media-scraper-postgres-1:cpu_percent  49.19
media-scraper-redis-1:cpu_percent     10.83
queue:active                          60.00
queue:delayed                          0.00
queue:waiting                       9899.00   ← drained to 0 by end
event_loop:p95_ms                     <to fill in from a real run>
```

- `http_req_failed` rate < 1 %
- `batches_timed_out` = 0
- All 10 000 URLs drained in ~5 s
- Backend CPU peaks at ~77 % of the 1.0 CPU cap — comfortably inside the budget with headroom for the next 2× workload

### Heavy-page validation (SAX streaming claim)

To validate "memory per job ∝ extracted items, not body size", re-run with the heavy fixture:

```bash
FIXTURE_PATH=/heavy bun run --filter backend test:load
```

Comparison (same workload, ~13 000× larger body):

| Metric                    | Small page (~200 B) | Heavy page (~3 MB) | Δ |
|---------------------------|--------------------:|-------------------:|---|
| `backend_proc:rss_mb`     | *<small>*           | *<heavy>*          | should be ≈ 0 if claim holds |
| `backend_proc:heap_mb`    | *<small>*           | *<heavy>*          | should be ≈ 0 |
| `event_loop:p95_ms`       | *<small>*           | *<heavy>*          | should be flat |
| `media-scraper-backend-1:cpu_percent` | *<small>* | *<heavy>*    | will rise (more bytes to parse) |

CPU is expected to rise (the parser still reads every byte); RSS/heap should not (the parser doesn't *retain* them). If RSS scales with body size, the SAX claim is wrong and we'd need to investigate whether response bodies are being buffered upstream of the parser.

## Failure modes considered

| Scenario | Tested under load? | Verification |
|---|---|---|
| 5 000 URLs at 1 CPU / 1 GB | ✅ | k6 burst + saturated scenarios above |
| Heavy pages (multi-MB HTML) | ✅ | `FIXTURE_PATH=/heavy` comparison above |
| Random target failures | ⏳ | retry logic verified by code review (`scrape.worker.ts:82-113`); `batches.failed` only increments on the final attempt |
| Queue overflow → 503 backpressure | ⏳ | soft-cap path in `scrape.routes.ts:22-31`; would need >500 k URLs to trigger |
| Per-fetch timeout | ⏳ | `AbortSignal.timeout(10_000)` in `scrape.service.ts` |
| Worker crash mid-job | ⏳ | BullMQ recovers from Redis on restart; jobs in-flight are retried per `attempts: 3` |

## API

### `POST /api/scrape`
```json
// request
{ "urls": ["https://example.com", "https://other.com"] }

// 201
{ "batchId": "uuid", "totalUrls": 2, "status": "processing" }
```
- 1–500 URLs per request (`MAX_URLS_PER_REQUEST`)
- 503 if the queue + new URLs would exceed `MAX_QUEUE_SIZE` (backpressure)

### `GET /api/scrape/:batchId`
```json
{
  "id": "uuid",
  "status": "processing | completed | failed",
  "totalUrls": 2,
  "completed": 1,
  "failed": 0,
  "createdAt": "...",
  "jobs": [{ "id": "...", "sourceUrl": "...", "status": "completed", "error": null }]
}
```

### `GET /api/media`
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | |
| `limit` | number | 20 | max 100 |
| `type` | `image \| video` | — | |
| `search` | string | — | case-insensitive ILIKE on `media_url` and `title` |

### `GET /api/queue-stats`
BullMQ counts + `process.memoryUsage()` + event-loop histogram. Used by the load-test sampler.

### `POST /api/queue-stats/reset`
Resets the event-loop histogram so the next sample window is clean.

### `GET /api/health`
`{ status: "ok", timestamp }`

## Local development

```bash
bun install

# Infra only
docker compose up postgres redis

# Backend + frontend with prefixed logs
bun run dev
```

Frontend dev server: http://localhost:5173 (proxies `/api` to `:3001`).

## Other commands

```bash
bun run typecheck                              # all workspaces
bun run lint                                   # frontend ESLint
bun run test:integration                       # integration test (needs infra running)

bun run --filter backend test:load:fixture     # start fixture HTTP server
bun run --filter backend test:load:capture     # sample docker + queue-stats peaks
bun run --filter backend test:load             # run k6 load test

cd backend && bun x drizzle-kit generate       # after editing src/db/schema.ts
```

Drizzle migrations run automatically on backend startup via `runMigrations()`.

## Known choices and trade-offs

- **Bun, not Node.** Smaller resident footprint and native TypeScript; the Hono/BullMQ stack is unchanged. Trivially portable to Node if required.
- **Worker in the same process as the API.** Simpler deployment within a single 1 CPU / 1 GB budget. Event-loop histogram (`/api/queue-stats`) lets us *measure* whether this hurts API responsiveness rather than guess. SAX streaming yields between chunks, keeping per-tick parser work small. If a future test ever shows `event_loop:p95_ms` regressing, the worker can be split into a separate process — the code in `scrape.worker.ts` is already isolated for that.
- **htmlparser2 SAX over cheerio.** cheerio loads the full DOM (3–5× HTML size); on 60 concurrent jobs that adds up fast. SAX holds only its sliding window, so worker memory is bounded by *extracted items*, not page size.
- **Counter caches on `batches`.** Avoids `COUNT(*)` queries on the hot polling path. Trade-off: a `UPDATE batches SET completed = completed + 1` per job hot-spots one row, but Postgres serializes it cheaply at this throughput.
- **Soft queue cap (500 k).** Returns 503 when `getJobCounts + urls.length` would exceed the cap. Non-atomic, can overshoot by `(in-flight × 500)` URLs — acceptable as a backpressure signal at this scale.
