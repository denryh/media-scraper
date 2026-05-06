# Media Scraper - Task Tracker

## All Steps Complete

- [x] **Step 1**: Scaffold project structure and initialize packages
- [x] **Step 2**: Set up Docker Compose with PostgreSQL and Redis
- [x] **Step 3**: Set up Drizzle schema, config, and migrations
- [x] **Step 4**: Build scraping pipeline (queue, worker, service)
- [x] **Step 5**: Build API routes (scrape + media endpoints)
- [x] **Step 6**: Build React frontend
- [x] **Step 7**: Dockerize backend and frontend
- [x] **Step 8**: Write k6 load test

## Load Test Results

- 5000 requests in 2.3s across 100 VUs
- p95 latency: 76.44ms (threshold: <2000ms)
- Failure rate: 0.00% (threshold: <1%)
- Throughput: 2167 req/s
- All thresholds passed

## Quick Reference

```bash
# Start everything
docker compose up -d

# Run locally (dev)
docker compose up postgres redis -d
cd backend && DATABASE_URL="postgresql://scraper:scraper@localhost:5432/media_scraper" REDIS_URL="redis://localhost:6379" bun run dev
cd frontend && bun run dev

# Run integration test
cd backend && DATABASE_URL="..." REDIS_URL="..." bun run test:integration

# Run load test (requires k6 + docker stack running)
k6 run backend/tests/load/scrape.load.js

# Stop
docker compose down -v
```

## Reference

- Architecture: see `ARCHITECTURE.md`
- Stack: Bun + Hono + Drizzle + BullMQ + PostgreSQL + Redis + React + Vite + Tailwind
- Constraint: 5000 concurrent scraping requests on 1 CPU / 1GB RAM
