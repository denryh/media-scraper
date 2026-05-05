import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const port = Number(process.env.PORT) || 3001;

export default {
  port,
  fetch: app.fetch,
};

console.log(`Backend running on http://localhost:${port}`);
