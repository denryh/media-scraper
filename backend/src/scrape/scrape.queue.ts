import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { config } from '../config';

export interface ScrapeJobData {
  jobId: string;
  batchId: string;
  url: string;
}

export const scrapeQueue = new Queue<ScrapeJobData>('scrape', {
  connection: redis,
  defaultJobOptions: {
    attempts: config.jobRetries,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
