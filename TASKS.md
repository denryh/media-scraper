# Media Scraper - Task Tracker

## Tasks

- [x] **Step 1**: Scaffold project structure and initialize packages
  - Created `backend/` with Bun, installed: hono, @hono/zod-validator, zod, bullmq, ioredis, cheerio, drizzle-orm, postgres, pino, drizzle-kit
  - Created `frontend/` with Vite + React 19 + TypeScript + Tailwind CSS
  - Directory structure: `src/{routes,services,workers,queues,db,lib}` (backend), `src/{components,hooks,api}` (frontend)

- [x] **Step 2**: Set up Docker Compose with PostgreSQL and Redis
  - Create `docker-compose.yml` with 4 services (backend, frontend, postgres, redis)
  - Memory limits: backend 400MB, postgres 256MB, redis 192MB, frontend ~40MB
  - Healthchecks for postgres (`pg_isready`) and redis (`redis-cli ping`)
  - Create `.env.example`

- [ ] **Step 3**: Set up Drizzle schema, config, and migrations
  - Create `backend/src/db/schema.ts` — batches, scrape_jobs, media tables
  - Create `backend/drizzle.config.ts`
  - Create `backend/src/db/index.ts` — Drizzle client + postgres connection singleton

- [ ] **Step 4**: Build scraping pipeline (queue, worker, service)
  - `backend/src/services/scraper.service.ts` — cheerio-based media extraction (img, video, source, a[href])
  - `backend/src/queues/scrape.queue.ts` — BullMQ queue instance
  - `backend/src/workers/scrape.worker.ts` — BullMQ worker (concurrency: 10, rate: 50/sec)
  - `backend/src/lib/redis.ts` — ioredis connection singleton
  - `backend/src/config.ts` — environment variables

- [ ] **Step 5**: Build API routes (scrape + media endpoints)
  - `POST /api/scrape` — accept `{ urls: string[] }`, create batch, enqueue jobs, return batchId
  - `GET /api/scrape/:batchId` — poll batch status + per-job progress
  - `GET /api/media` — paginated media list with type/search filtering
  - `backend/src/index.ts` — Hono app entry point with Bun.serve()
  - Route files: `backend/src/routes/scrape.routes.ts`, `backend/src/routes/media.routes.ts`

- [ ] **Step 6**: Build React frontend
  - `ScrapeForm.tsx` — textarea for URLs + submit button
  - `BatchStatus.tsx` — polls batch status, shows progress bar
  - `MediaGrid.tsx` + `MediaCard.tsx` — CSS grid gallery with lazy loading
  - `FilterBar.tsx` — type dropdown (All/Image/Video) + search input
  - `Pagination.tsx` — page navigation
  - Hooks: `useMedia.ts`, `useScrapeStatus.ts`
  - API client: `src/api/client.ts`

- [ ] **Step 7**: Dockerize backend and frontend
  - `backend/Dockerfile` — `oven/bun:alpine`
  - `frontend/Dockerfile` — multi-stage: Bun build stage → nginx:alpine serve stage
  - `nginx/default.conf` — reverse proxy config

- [ ] **Step 8**: Write k6 load test
  - `backend/tests/load/scrape.load.js`
  - `shared-iterations` executor: 100 VUs, 5000 iterations
  - Target: `POST /api/scrape` with 1 URL per request
  - Thresholds: p95 < 2s, failure rate < 1%

## Reference

- Architecture: see `ARCHITECTURE.md`
- Stack: Bun + Hono + Drizzle + BullMQ + PostgreSQL + Redis + React + Vite + Tailwind
- Constraint: 5000 concurrent scraping requests on 1 CPU / 1GB RAM
