// k6 load test: validate the backend can absorb 5000 scrape URLs across N
// concurrent requests under the documented resource envelope.
//
// Two scenarios run simultaneously to stress the system with mixed traffic
// shapes — combined: 60 concurrent POSTs and 10,000 URLs in flight:
//   - burst_fanout       — 50 VUs × 100 URLs (entry-path stress)
//   - saturated_worker   — 10 VUs × 500 URLs (worker stress)
//
// Each VU POSTs once, then polls /api/scrape/:batchId until completion. The
// custom batch_drain_seconds metric reports end-to-end drain time.
//
// Prerequisites:
//   - Backend running (docker compose up --build, or bun run dev)
//   - Fixture server running on the host:
//       bun run backend/tests/load/fixture-server.ts
//   - k6 installed (brew install k6)
//
// Run:
//   k6 run backend/tests/load/scrape.load.js
//
// Override defaults:
//   k6 run -e BACKEND_URL=http://localhost:3001 \
//          -e FIXTURE_URL=http://host.docker.internal:9099 \
//          backend/tests/load/scrape.load.js
//
// FIXTURE_URL is the URL the *backend* uses to reach the fixture. When the
// backend runs in docker compose, that's host.docker.internal:9099 (the
// default). When the backend runs via `bun run dev`, override with
// http://localhost:9099.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BACKEND_URL = __ENV.BACKEND_URL || 'http://localhost:3001';
const FIXTURE_URL = __ENV.FIXTURE_URL || 'http://host.docker.internal:9099';
const POLL_INTERVAL_MS = Number(__ENV.POLL_INTERVAL_MS) || 1000;
const POLL_TIMEOUT_MS = Number(__ENV.POLL_TIMEOUT_MS) || 5 * 60 * 1000;

const batchDrainSeconds = new Trend('batch_drain_seconds', true);
const urlsEnqueued = new Counter('urls_enqueued');
const batchesCompleted = new Counter('batches_completed');
const batchesTimedOut = new Counter('batches_timed_out');

export const options = {
  scenarios: {
    burst_fanout: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 1,
      maxDuration: '2m',
      exec: 'burstFanout',
      tags: { scenario: 'burst_fanout' },
    },
    saturated_worker: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 1,
      maxDuration: '2m',
      exec: 'saturatedWorker',
      tags: { scenario: 'saturated_worker' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:scrape_post}': ['p(95)<3000'],
    batches_timed_out: ['count==0'],
  },
};

function buildUrls(count) {
  const urls = new Array(count);
  for (let i = 0; i < count; i++) {
    urls[i] = `${FIXTURE_URL}/page-${__VU}-${__ITER}-${i}`;
  }
  return urls;
}

function submitAndWait(urls) {
  const postRes = http.post(
    `${BACKEND_URL}/api/scrape`,
    JSON.stringify({ urls }),
    {
      headers: { 'content-type': 'application/json' },
      tags: { name: 'scrape_post' },
    },
  );

  const enqueued = check(postRes, {
    'POST /api/scrape == 201': (r) => r.status === 201,
  });
  if (!enqueued) return;
  urlsEnqueued.add(urls.length);

  const { batchId } = postRes.json();
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = http.get(`${BACKEND_URL}/api/scrape/${batchId}`, {
      tags: { name: 'scrape_poll' },
    });
    if (res.status === 200) {
      const body = res.json();
      if (body.status === 'completed' || body.status === 'failed') {
        batchDrainSeconds.add((Date.now() - start) / 1000);
        batchesCompleted.add(1);
        return;
      }
    }
    sleep(POLL_INTERVAL_MS / 1000);
  }

  batchesTimedOut.add(1);
}

export function burstFanout() {
  submitAndWait(buildUrls(100));
}

export function saturatedWorker() {
  submitAndWait(buildUrls(500));
}
