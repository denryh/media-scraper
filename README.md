# Media Scraper

Submit URLs, extract every image and video, browse results. Built to handle high request volumes on constrained hardware.

## Quick start

```bash
# Start everything (postgres, redis, backend, frontend)
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/api/health

## Local development

Requires: Bun, Docker (for postgres + redis)

```bash
bun install

# Start infra only
docker compose up postgres redis

# Start both frontend and backend with prefixed logs
bun run dev
```

Frontend dev server runs at http://localhost:5173 and proxies `/api` to the backend at `:3001`.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| API | Hono + Zod validation |
| Queue | BullMQ + Redis |
| Scraping | cheerio + native fetch |
| Database | PostgreSQL 16 + Drizzle ORM |
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| State | TanStack Query v5 |

## How it works

Submitting URLs is non-blocking: the API creates a batch record and enqueues jobs immediately, returning a `batchId` before any scraping begins. A BullMQ worker (concurrency: 10, rate: 50/s) processes the queue and updates the batch counters as jobs complete or fail. The frontend polls the batch status and refreshes the media grid when done.

Each URL is fetched with a 10s timeout and a 2MB body cap. Extracted media types:

- `<img src>` — images
- `<picture><source srcset>` — responsive images (first candidate)
- `<video src>`, `<video><source src>` — inline video
- `<a href="*.mp4|webm|ogg|mov">` — linked video files

Jobs retry up to 3 times with exponential backoff (2s base). The batch `failed` counter only increments on the final attempt.

## API

### `POST /api/scrape`

Submit URLs for scraping.

```json
// Request
{ "urls": ["https://example.com", "https://other.com"] }

// Response 201
{ "batchId": "uuid", "totalUrls": 2, "status": "processing" }
```

### `GET /api/scrape/:batchId`

Poll batch progress.

```json
{
  "id": "uuid",
  "status": "processing | completed | failed",
  "totalUrls": 2,
  "completed": 1,
  "failed": 0,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "jobs": [{ "id": "uuid", "sourceUrl": "...", "status": "completed", "error": null }]
}
```

### `GET /api/media`

Paginated media list with optional filtering.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `type` | `image\|video` | — | Filter by media type |
| `search` | string | — | Search media URL or title (case-insensitive) |

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend port |
| `DATABASE_URL` | `postgresql://scraper:scraper@localhost:5432/media_scraper` | Postgres connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `WORKER_CONCURRENCY` | `10` | Parallel scrape jobs |
| `WORKER_RATE_LIMIT` | `50` | Max jobs per second |
| `LOG_LEVEL` | `info` | Pino log level |

## Other commands

```bash
bun run typecheck          # type-check all workspaces
bun run lint               # ESLint (frontend)
bun run test:integration   # integration test (needs infra running)
k6 run backend/tests/load/scrape.load.js  # load test (needs k6 + backend running)

# After changing backend/src/db/schema.ts:
cd backend && bun x drizzle-kit generate  # generate migration
```
