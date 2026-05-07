import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { structuredLogger } from '@hono/structured-logger';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Logger } from 'pino';
import { config } from './config';
import { logger } from './lib/logger';
import { scrapeRoutes } from './scrape/scrape.routes';
import { mediaRoutes } from './media/media.routes';
import { scrapeQueue } from './scrape/scrape.queue';
import { startWorker } from './scrape/scrape.worker';
import { runMigrations } from './db/migrate';

type AppEnv = {
  Variables: {
    logger: Logger;
  };
};

// Sampling histogram: gap between when a timer should fire and when it does.
// Direct measure of "is the main thread blocked?" — independent of HTTP/DB
// latency. resolution: 10ms is fine-grained enough to catch parser bursts.
const eventLoopHist = monitorEventLoopDelay({ resolution: 10 });
eventLoopHist.enable();

await runMigrations();

const app = new Hono<AppEnv>();

app.use('*', cors());
app.use('*', requestId());
app.use(
  '*',
  structuredLogger({
    createLogger: (c) => logger.child({ requestId: c.get('requestId') }),
  }),
);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/queue-stats', async (c) => {
  const counts = await scrapeQueue.getJobCounts(
    'waiting',
    'active',
    'delayed',
    'completed',
    'failed',
    'paused',
  );
  const mem = process.memoryUsage();
  return c.json({
    queue: counts,
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
    eventLoop: {
      p50_ms: eventLoopHist.percentile(50) / 1e6,
      p95_ms: eventLoopHist.percentile(95) / 1e6,
      p99_ms: eventLoopHist.percentile(99) / 1e6,
      max_ms: eventLoopHist.max / 1e6,
      mean_ms: eventLoopHist.mean / 1e6,
    },
    timestamp: new Date().toISOString(),
  });
});

// Reset the event loop histogram — call before a load test for a clean read.
app.post('/api/queue-stats/reset', (c) => {
  eventLoopHist.reset();
  return c.json({ reset: true, timestamp: new Date().toISOString() });
});

app.route('/api/scrape', scrapeRoutes);
app.route('/api/media', mediaRoutes);

startWorker();

logger.info({ port: config.port }, 'backend started');

export default {
  port: config.port,
  fetch: app.fetch,
};
