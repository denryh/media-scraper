import { Queue } from 'bullmq';
import { redis } from '../lib/redis';

export interface ScrapeJobData {
  jobId: string;
  batchId: string;
  url: string;
}

export const scrapeQueue = new Queue<ScrapeJobData>('scrape', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
