// Sample docker stats + /api/queue-stats during the load test, then report
// peaks. CPU% and Mem% from `docker stats` are relative to the limits set in
// docker-compose.yml, so peaks map directly onto knobs:
//
//   backend cpu_percent at ~100%       → bump backend.cpus, or lower
//                                         WORKER_CONCURRENCY (CPU contention)
//   backend mem_percent at ~100%       → bump backend.mem_limit, or lower
//                                         WORKER_CONCURRENCY (more in-flight
//                                         jobs => more memory)
//   postgres cpu/mem high              → bump postgres limits, raise
//                                         DATABASE_POOL_SIZE, batch DB writes
//   redis cpu/mem high                 → bump redis limits
//   queue_waiting growing unbounded    → API outpacing worker; raise
//                                         WORKER_CONCURRENCY or WORKER_RATE_LIMIT
//   all idle but drain slow            → raise WORKER_CONCURRENCY/RATE_LIMIT
//
// Usage (from repo root, alongside `k6 run`):
//   bun run --filter backend test:load:capture &
//   k6 run backend/tests/load/scrape.load.js
//
// Args:
//   DURATION_S       total sampling seconds (default 180)
//   INTERVAL_MS      sample interval (default 1000)
//   BACKEND_URL      default http://localhost:3001
//   OUT              CSV output path (default /tmp/scrape-load-stats.csv)

import { $ } from 'bun';
import { resolve } from 'node:path';

process.chdir(resolve(import.meta.dir, '../../..'));

const DURATION_S = Number(process.env.DURATION_S) || 180;
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 1000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const OUT = process.env.OUT || '/tmp/scrape-load-stats.csv';

// Pass as an interpolated string constant: Bun's shell auto-quotes ${X},
// which preserves the {{ }} template syntax. Writing the format inline
// (unquoted) lets Bun's brace-expansion / escaping rules mangle it, and
// docker then prints `{{.Name}},{{.CPUPerc}},{{.MemPerc}}` literally per
// container — which is the bug we just hit.
const STATS_FORMAT = '{{.Name}},{{.CPUPerc}},{{.MemPerc}}';

const cidsRaw = await $`docker compose ps -q backend postgres redis`.text();
const cids = cidsRaw.trim().split('\n').filter(Boolean);
if (cids.length === 0) {
  console.error('no compose containers running for backend/postgres/redis');
  process.exit(1);
}

interface Sample {
  ts: number;
  name: string;
  metric: string;
  value: number;
}
const samples: Sample[] = [];
const start = Date.now();

console.log(
  `sampling ${cids.length} containers + /api/queue-stats every ${INTERVAL_MS}ms for ${DURATION_S}s`,
);
console.log(`container ids: ${cids.join(' ')}`);
console.log(`docker stats format: ${STATS_FORMAT}`);

let loggedFirstStats = false;
let loggedFirstQueue = false;
let dockerFailures = 0;
let queueFailures = 0;

while (Date.now() - start < DURATION_S * 1000) {
  const ts = Math.floor(Date.now() / 1000);

  // docker stats: CPUPerc, MemPerc both relative to compose mem_limit/cpus.
  try {
    const stats =
      await $`docker stats --no-stream --format ${STATS_FORMAT} ${cids}`.text();
    if (!loggedFirstStats) {
      console.log('--- first docker stats raw output ---');
      console.log(stats);
      console.log('--- end ---');
      loggedFirstStats = true;
    }
    for (const line of stats.trim().split('\n')) {
      const [name, cpu, mem] = line.split(',');
      if (!name || !cpu || !mem) {
        console.error(`unparseable docker stats line: ${JSON.stringify(line)}`);
        continue;
      }
      const cpuNum = Number(cpu.replace('%', ''));
      const memNum = Number(mem.replace('%', ''));
      if (Number.isNaN(cpuNum) || Number.isNaN(memNum)) {
        console.error(
          `bad numeric values in docker stats line: ${JSON.stringify(line)}`,
        );
        continue;
      }
      samples.push({ ts, name, metric: 'cpu_percent', value: cpuNum });
      samples.push({ ts, name, metric: 'mem_percent', value: memNum });
    }
  } catch (err) {
    dockerFailures++;
    console.error('docker stats sample failed:', err);
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/queue-stats`);
    if (!res.ok) {
      queueFailures++;
      console.error(`queue-stats HTTP ${res.status} ${res.statusText}`);
    } else {
      const qs = (await res.json()) as {
        queue: Record<string, number>;
        memory: { rss: number; heapUsed: number };
      };
      if (!loggedFirstQueue) {
        console.log('first queue-stats response:', JSON.stringify(qs));
        loggedFirstQueue = true;
      }
      samples.push({
        ts,
        name: 'queue',
        metric: 'waiting',
        value: qs.queue.waiting ?? 0,
      });
      samples.push({
        ts,
        name: 'queue',
        metric: 'active',
        value: qs.queue.active ?? 0,
      });
      samples.push({
        ts,
        name: 'queue',
        metric: 'delayed',
        value: qs.queue.delayed ?? 0,
      });
      samples.push({
        ts,
        name: 'backend_proc',
        metric: 'rss_mb',
        value: qs.memory.rss / 1024 / 1024,
      });
      samples.push({
        ts,
        name: 'backend_proc',
        metric: 'heap_mb',
        value: qs.memory.heapUsed / 1024 / 1024,
      });
    }
  } catch (err) {
    queueFailures++;
    console.error('queue-stats fetch failed:', err);
  }

  await Bun.sleep(INTERVAL_MS);
}

const csv = [
  'ts,name,metric,value',
  ...samples.map((s) => `${s.ts},${s.name},${s.metric},${s.value}`),
].join('\n');
await Bun.write(OUT, csv);

const peaks = new Map<string, number>();
for (const s of samples) {
  const key = `${s.name}:${s.metric}`;
  peaks.set(key, Math.max(peaks.get(key) ?? -Infinity, s.value));
}

console.log(`\nwrote ${samples.length} samples to ${OUT}`);
if (dockerFailures > 0 || queueFailures > 0) {
  console.log(
    `failures: docker=${dockerFailures} queue=${queueFailures} (out of ~${Math.floor((DURATION_S * 1000) / INTERVAL_MS)} ticks)`,
  );
}
console.log('\n=== peaks ===');
for (const [k, v] of [...peaks.entries()].sort()) {
  console.log(k.padEnd(36), v.toFixed(2));
}
