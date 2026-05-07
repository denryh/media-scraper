# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted.

```bash
# Install all workspace dependencies
bun install

# Dev (both frontend and backend, with log prefixes)
bun run dev

# Type-check all workspaces
bun run typecheck

# Lint (frontend only — no linter configured for backend)
bun run lint

# Integration test (requires postgres + redis running)
bun run test:integration

# Load test — fires two concurrent scenarios (50×100 + 10×500 = 10k URLs).
# Requires k6 installed (brew install k6), backend running, and the fixture
# server running on the host (the backend in compose reaches it via
# host.docker.internal). Optional: capture-stats samples docker stats +
# /api/queue-stats and prints peaks (CPU%/Mem% relative to compose limits):
#   bun run --filter backend test:load:fixture &
#   bun run --filter backend test:load:capture &
#   k6 run backend/tests/load/scrape.load.js
# Override FIXTURE_URL=http://localhost:9099 when backend runs via `bun run dev`.

# Generate a new DB migration after schema changes
cd backend && bun x drizzle-kit generate

# Apply migrations manually (also runs automatically on backend start)
cd backend && bun x drizzle-kit migrate
```

### Workspace-scoped commands

```bash
bun run --filter backend typecheck
bun run --filter frontend build
```

### Docker

```bash
# Start all services (postgres, redis, backend, frontend)
docker compose up --build

# Start only infra (for local backend/frontend dev)
docker compose up postgres redis
```

Local dev default URLs: backend `http://localhost:3001`, frontend `http://localhost:5173`, postgres `localhost:5432`, redis `localhost:6379`.

## Architecture

### Monorepo layout

Three Bun workspaces: `backend`, `frontend`, `packages/types`.

- **`packages/types`** — shared Zod schemas + inferred TypeScript types for all API shapes (`ScrapeRequestSchema`, `BatchStatusSchema`, `MediaQuerySchema`, etc.). Exported directly as `.ts` — no build step. Both backend and frontend import from `@media-scraper/types`.
- **`backend`** — Hono API + BullMQ worker running in the same process (saves RAM on the 1GB constraint).
- **`frontend`** — React + Vite + Tailwind. Multi-stage Docker build: Bun builds to `dist/`, nginx serves static files and proxies `/api/` to the backend.

### Request flow

```
POST /api/scrape
  → scrape.routes.ts validates + inserts batch/jobs into postgres
  → addBulk() enqueues all jobs into Redis (BullMQ)
  → returns {batchId} immediately (async — jobs not yet processed)

BullMQ worker (concurrency: 60, rate: 1000/s)
  → fetchAndExtract(url) — fetchStream() + extractFromStream(), 10s timeout
  → inserts media rows
  → updates batch counters (completed/failed)
  → batch.status = 'completed' when completed + failed >= totalUrls
```

`fetchAndExtract` streams the response body directly into an `htmlparser2` SAX parser — no full HTML buffer, no DOM tree. Memory per job is proportional to extracted results, not page size, so no body size cap is needed.

The API can accept thousands of requests; the queue drains them at a controlled rate.

### Batch failure counting

`worker.on('failed')` fires on **every attempt**, not just the final one. The `batches.failed` counter is only incremented when `job.attemptsMade >= job.opts.attempts` (final attempt). The job `status` is set to `'failed'` on every failed attempt. See `scrape.worker.ts`.

### Key config (`backend/src/config.ts`)

| Key                    | Default | Env var               |
| ---------------------- | ------- | --------------------- |
| `workerConcurrency`    | 60      | `WORKER_CONCURRENCY`  |
| `workerRateLimit`      | 1000/s  | `WORKER_RATE_LIMIT`   |
| `maxQueueSize`         | 500,000 | `MAX_QUEUE_SIZE`      |
| `databaseMaxPoolSize`  | 25      | `DATABASE_POOL_SIZE`  |
| `jobRetries`           | 3       | —                     |
| `fetchTimeout`         | 10s     | —                     |
| `maxUrlsPerRequest`    | 500     | —                     |

`docker-compose.yml` plumbs the four env vars above into the backend service so they can be overridden per run, e.g. `WORKER_CONCURRENCY=90 docker compose up -d --force-recreate backend`.

### Docker

Each service has its own Dockerfile (`backend/Dockerfile`, `frontend/Dockerfile`). Both use `context: .` (repo root) in `docker-compose.yml` so the full monorepo is available during build. All workspace `package.json` manifests must be copied before `bun install` so Bun can resolve `workspace:*` references — adding a new workspace requires adding its `package.json` COPY line to both Dockerfiles.

`docker-compose.yml` caps **backend only** at 1GB / 1.0 CPU per the spec ("1 CPU + 1 GB applies to the backend tier"). Postgres, Redis, and the nginx frontend are uncapped and use whatever the host has.

### Observability

`GET /api/queue-stats` returns:
- BullMQ job counts (`waiting`, `active`, `delayed`, `completed`, `failed`, `paused`)
- `process.memoryUsage()` (`rss`, `heapTotal`, `heapUsed`, `external`)
- `eventLoop` histogram in ms (`p50_ms`, `p95_ms`, `p99_ms`, `max_ms`, `mean_ms`) — the direct measure of "is the main thread blocked?", independent of HTTP/DB latency. Sourced from `perf_hooks.monitorEventLoopDelay({ resolution: 10 })`.

`POST /api/queue-stats/reset` zeroes the event-loop histogram so the next sample window is clean — `capture-stats.ts` calls this at startup before each run.

### Logging

Backend uses pino with `@hono/structured-logger` middleware. Every HTTP request gets a child logger with `requestId` bound to all log lines for that request. Worker logs use the root logger directly.

In dev (`bun run dev`), stdout is piped through `pino-pretty`. In production (`NODE_ENV=production`), plain JSON.

### DB migrations

Drizzle migrations live in `backend/drizzle/migrations/`. They run automatically on every backend startup via `runMigrations()` in `backend/src/db/migrate.ts` — no manual migration step needed in Docker.

When changing `backend/src/db/schema.ts`, run `drizzle-kit generate` to create a new migration file, then commit it.
