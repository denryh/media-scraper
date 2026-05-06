import { Worker } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { config } from '../config';
import { db } from '../db';
import { batches, scrapeJobs, media } from '../db/schema';
import { fetchAndExtract } from './scrape.service';
import type { ScrapeJobData } from './scrape.queue';

async function processScrapeJob(job: { data: ScrapeJobData }) {
  const { jobId, batchId, url } = job.data;

  // Mark job as processing
  await db
    .update(scrapeJobs)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(scrapeJobs.id, jobId));

  try {
    const items = await fetchAndExtract(url);

    // Insert media rows
    if (items.length > 0) {
      await db.insert(media).values(
        items.map((item) => ({
          jobId,
          sourceUrl: url,
          mediaUrl: item.mediaUrl,
          type: item.type,
          title: item.title,
        })),
      );
    }

    // Mark job completed
    await db
      .update(scrapeJobs)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(scrapeJobs.id, jobId));

    // Increment batch completed counter
    await db
      .update(batches)
      .set({ completed: sql`${batches.completed} + 1`, updatedAt: new Date() })
      .where(eq(batches.id, batchId));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Mark job failed (every attempt) — batch counter updated only on final failure via worker.on('failed')
    await db
      .update(scrapeJobs)
      .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
      .where(eq(scrapeJobs.id, jobId));

    throw err; // Let BullMQ handle retries
  }

  // Check if batch is done (success path — failure path handled in worker.on('failed'))
  const [batch] = await db
    .select()
    .from(batches)
    .where(eq(batches.id, batchId));
  if (batch && batch.completed + batch.failed >= batch.totalUrls) {
    await db
      .update(batches)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(batches.id, batchId));
  }
}

export function startWorker() {
  const worker = new Worker<ScrapeJobData>('scrape', processScrapeJob, {
    connection: redis,
    concurrency: config.workerConcurrency,
    limiter: {
      max: config.workerRateLimit,
      duration: 1000,
    },
  });

  // fires on every failed attempt — only act on the final one
  worker.on('failed', async (job, err) => {
    if (!job) return;

    const isLastAttempt =
      job.attemptsMade >= (job.opts.attempts ?? config.jobRetries);

    logger.error(
      { jobId: job.id, attempt: job.attemptsMade, url: job.data.url, err: err.message },
      isLastAttempt ? 'job failed permanently' : 'job failed, will retry',
    );

    if (!isLastAttempt) return;

    const { batchId } = job.data;

    await db
      .update(batches)
      .set({ failed: sql`${batches.failed} + 1`, updatedAt: new Date() })
      .where(eq(batches.id, batchId));

    const [batch] = await db
      .select()
      .from(batches)
      .where(eq(batches.id, batchId));
    if (batch && batch.completed + batch.failed >= batch.totalUrls) {
      await db
        .update(batches)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(batches.id, batchId));
    }
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, url: job.data.url }, 'job completed');
  });

  logger.info(
    { concurrency: config.workerConcurrency, rateLimit: config.workerRateLimit },
    'scrape worker started',
  );

  return worker;
}
