# Demo recording script

Target length: **5–7 minutes**. Record at 1080p, talk into the mic — no music. The reviewer is looking for the spec checklist + the load test evidence.

## Pre-flight checklist

Do this before hitting record so the demo is clean:

```bash
# Clean slate
docker compose down -v
docker compose up --build -d

# Sanity
curl -s http://localhost:3001/api/health
open http://localhost:3000

# Pre-warm fixture so first scrape is instant
bun run --filter backend test:load:fixture &
FIX_PID=$!
curl -s http://host.docker.internal:9099 > /dev/null

# Reset event-loop histogram so the load-test number is clean
curl -X POST http://localhost:3001/api/queue-stats/reset
```

Have these tabs ready:
1. Terminal (zoomed in, large font)
2. Frontend at http://localhost:3000
3. `README.md` open at the **Requirements coverage** table
4. The case-study spec text (to point at)

## Recording outline

### 1. Spec + claim (≈ 30 s)

**Show**: spec text on screen.

**Say**: "Spec asks for an API that scrapes images and videos from URLs, stores them in SQL, with a paginated/filtered React frontend, all dockerized — and the backend has to handle five thousand concurrent scrape requests on one CPU and one gigabyte of RAM. I'll walk through the system, then prove the constraint with a load test."

### 2. End-to-end happy path (≈ 1 min)

**Show**: terminal + frontend.

```bash
curl -X POST http://localhost:3001/api/scrape \
  -H 'content-type: application/json' \
  -d '{"urls":["https://en.wikipedia.org/wiki/Apollo_11","https://www.bbc.com/news"]}'
```

**Say**: "POST returns immediately with a `batchId` — the request is non-blocking. A BullMQ worker picks up the URLs from a Redis queue."

**Show**: refresh frontend, grid populates with images and videos.

### 3. Pagination + filter + search (≈ 1 min)

**Show**, in this order:
- **Pagination** — page through results, show URL/state updating
- **Type filter** — flip between `image` / `video`, show counts changing
- **Search** — type a substring, results narrow

**Say**: "All four list-view requirements wired into a single `GET /api/media` query — page, limit, type, search."

### 4. Resource constraint setup (≈ 30 s)

**Show**: `docker-compose.yml` snippet —

```yaml
backend:
  cpus: 1.0
  mem_limit: 1g
```

**Say**: "Compose enforces the constraint at the container layer — backend gets exactly one CPU and one gigabyte. Postgres and Redis are uncapped per the reviewer's clarification that the limit is for the backend tier only."

### 5. Load test — live (≈ 2 min)

This is the headline. Three commands in three terminals, narrated as the metrics roll in.

**Terminal A — sampler**:
```bash
DURATION_S=180 bun run --filter backend test:load:capture
```
**Say**: "This script samples docker stats and `/api/queue-stats` every second. CPU and memory percentages are relative to the compose limits, so I can read saturation directly. It also resets the event-loop histogram before sampling."

**Terminal B — k6**:
```bash
bun run --filter backend test:load
```
**Say**: "k6 fires two scenarios concurrently — fifty users × one hundred URLs and ten users × five hundred URLs — ten thousand URLs total, twice the spec target. Each user polls until its batch completes."

**While running, narrate the live signals**:
- `queue:waiting` rises into the thousands as POSTs land
- `queue:active` saturates at sixty (the worker concurrency)
- backend `cpu_percent` rises to ~77 %
- the test summary shows `batch_drain_seconds` p95

### 6. Read the evidence (≈ 1 min)

**Show**: the terminal-A peak table at the end of the run.

**Say** while pointing at each row:
- "All ten thousand URLs handled — `http_req_failed` under one percent."
- "Drain time around five seconds for ten thousand URLs."
- "Backend CPU peaked at seventy-seven percent of the one-CPU cap. Memory at sixteen percent of one gigabyte. Comfortably inside the budget."
- "Event-loop p95 stayed below — read the actual number from the table — milliseconds. The main thread wasn't blocked while the worker drained the queue, because htmlparser2 SAX yields between chunks rather than holding the loop for full pages."
- "k6 threshold for `scrape_poll` p95 under two hundred milliseconds **passed**. That's the HTTP-level proof that the API stays responsive while the worker is grinding."

### 6b. Heavy-page validation (≈ 45 s, optional but recommended)

**Show**: re-run, this time hitting the 3 MB fixture variant.

```bash
# Reset the histogram, then fire the heavy run
curl -X POST http://localhost:3001/api/queue-stats/reset
DURATION_S=120 bun run --filter backend test:load:capture
# in another terminal:
FIXTURE_PATH=/heavy bun run --filter backend test:load
```

**Say**: "Same load, same media tag count, but every fetched page is now thirteen thousand times larger — three megabytes instead of two hundred bytes. The architectural claim is that memory per job is proportional to *extracted items*, not page size, because htmlparser2 streams the body through SAX without buffering. If the claim is wrong, RSS would scale with body size."

**Show**: peak table for heavy run; point at `backend_proc:rss_mb` next to the small-run number.

**Say**: "RSS is essentially flat — the SAX claim holds. CPU rose, as expected: the parser still reads every byte even if it doesn't retain them."

### 7. Architecture highlights (≈ 1 min, optional)

Pick **two**, no more. Suggested combos:

- **Streaming scraper.** Open `backend/src/scrape/scrape.service.ts`, point at `extractFromStream`. Say: "We never buffer the HTML body. The native fetch ReadableStream pipes directly into htmlparser2, so memory per job is proportional to the items we extract, not page size."
- **Queue backpressure.** Open `backend/src/scrape/scrape.routes.ts`, point at the `getJobCounts` check. Say: "If the queue would exceed five hundred thousand jobs, the API returns 503 instead of accepting the request — protects Redis from OOM under sustained overload."

### 8. Wrap (≈ 15 s)

**Say**: "All ten requirements covered — see the table at the top of the README. Code in the repo, commands in the README, this video documents the load test. Thanks for watching."

## Tips

- **Cut the dead air.** Edit out `docker compose up --build` startup time; jump straight to the running stack.
- **Preview the headline number.** If you can, do a dry run first and write the actual `event_loop:p95_ms` number into the README table — talking from real data is stronger than placeholders.
- **Don't read the README.** Look at the camera (or screen) and explain.
- **Resolution matters.** Make sure terminal text is readable at 1080p — at least 16 pt.
- **One take is fine.** A scrappy 6-min real demo beats a polished 12-min one.

## Recovery cheats

If something breaks mid-record:

| Symptom | Fix |
|---|---|
| Frontend shows 502 | `docker compose restart frontend backend` |
| Postgres healthcheck failing | `docker compose down -v && docker compose up -d` (wipes data, fresh schema) |
| Fixture not reachable | Fixture must run on host (not inside compose). Check `bun run --filter backend test:load:fixture` is alive on `:9099`. |
| `host.docker.internal` not resolving (Linux only) | Add `extra_hosts: ["host.docker.internal:host-gateway"]` to `backend` service. |
| Capture script reports `{{.Name}}` literally in CSV | Bun shell mangling braces — already fixed in `capture-stats.ts`; pull latest. |
| k6 thresholds fail unexpectedly | Almost always `host.docker.internal` not resolving inside the backend container — see above. |
