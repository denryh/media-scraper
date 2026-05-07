import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { structuredLogger } from '@hono/structured-logger';
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

await runMigrations();

const app = new Hono<AppEnv>();

app.use('*', cors());
app.use('*', requestId());
app.use('*', structuredLogger({
  createLogger: (c) => logger.child({ requestId: c.get('requestId') }),
}));

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
    timestamp: new Date().toISOString(),
  });
});

app.route('/api/scrape', scrapeRoutes);
app.route('/api/media', mediaRoutes);

startWorker();

logger.info({ port: config.port }, 'backend started');

export default {
  port: config.port,
  fetch: app.fetch,
};
