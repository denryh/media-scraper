export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://scraper:scraper@localhost:5432/media_scraper',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY) || 30,
  workerRateLimit: Number(process.env.WORKER_RATE_LIMIT) || 500,
  fetchTimeout: 10_000,
  maxUrlsPerRequest: 500,
  maxQueueSize: Number(process.env.MAX_QUEUE_SIZE) || 500_000,
  jobRetries: 3,
};
