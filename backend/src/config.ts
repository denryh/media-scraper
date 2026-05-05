export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://scraper:scraper@localhost:5432/media_scraper',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY) || 10,
  workerRateLimit: Number(process.env.WORKER_RATE_LIMIT) || 50,
  fetchTimeout: 10_000,
  maxBodySize: 2 * 1024 * 1024, // 2MB
  maxUrlsPerRequest: 500,
};
