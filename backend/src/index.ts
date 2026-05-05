import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config';
import { scrapeRoutes } from './scrape/scrape.routes';
import { mediaRoutes } from './media/media.routes';
import { startWorker } from './scrape/scrape.worker';

const app = new Hono();

app.use('*', cors());

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.route('/api/scrape', scrapeRoutes);
app.route('/api/media', mediaRoutes);

// Start BullMQ worker in-process
startWorker();

export default {
  port: config.port,
  fetch: app.fetch,
};

console.log(`Backend running on http://localhost:${config.port}`);
