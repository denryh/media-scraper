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

# Load test (requires k6 installed and backend running)
k6 run backend/tests/load/scrape.load.js

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

BullMQ worker (concurrency: 10, rate: 50/s)
  → fetchAndExtract(url) — fetch + cheerio, 10s timeout, 2MB cap
  → inserts media rows
  → updates batch counters (completed/failed)
  → batch.status = 'completed' when completed + failed >= totalUrls
```

The worker intentionally limits to 10 concurrent outbound fetches to stay within 1GB RAM. The API can accept thousands of requests; the queue drains them at a controlled rate.

### Batch failure counting

`worker.on('failed')` fires on **every attempt**, not just the final one. The `batches.failed` counter is only incremented when `job.attemptsMade >= job.opts.attempts` (final attempt). The job `status` is set to `'failed'` on every failed attempt. See `scrape.worker.ts`.

### Key config (`backend/src/config.ts`)

| Key | Default | Env var |
|-----|---------|---------|
| `workerConcurrency` | 10 | `WORKER_CONCURRENCY` |
| `workerRateLimit` | 50/s | `WORKER_RATE_LIMIT` |
| `jobRetries` | 3 | — |
| `fetchTimeout` | 10s | — |
| `maxUrlsPerRequest` | 500 | — |

### Logging

Backend uses pino with `@hono/structured-logger` middleware. Every HTTP request gets a child logger with `requestId` bound to all log lines for that request. Worker logs use the root logger directly.

In dev (`bun run dev`), stdout is piped through `pino-pretty`. In production (`NODE_ENV=production`), plain JSON.

### DB migrations

Drizzle migrations live in `backend/drizzle/migrations/`. They run automatically on every backend startup via `runMigrations()` in `backend/src/db/migrate.ts` — no manual migration step needed in Docker.

When changing `backend/src/db/schema.ts`, run `drizzle-kit generate` to create a new migration file, then commit it.
