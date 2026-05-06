import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { ScrapeRequestSchema } from '@media-scraper/types';
import { db } from '../db';
import { batches, scrapeJobs } from '../db/schema';
import { scrapeQueue } from './scrape.queue';


export const scrapeRoutes = new Hono();

// POST /api/scrape — accept URLs, create batch, enqueue jobs
scrapeRoutes.post('/', zValidator('json', ScrapeRequestSchema), async (c) => {
  const { urls } = c.req.valid('json');

  // Create batch
  const [batch] = await db
    .insert(batches)
    .values({ totalUrls: urls.length, status: 'processing' })
    .returning();

  if (!batch) {
    return c.json({ error: 'Failed to create batch' }, 500);
  }

  // Create scrape jobs
  const jobs = await db
    .insert(scrapeJobs)
    .values(urls.map((url) => ({ batchId: batch.id, sourceUrl: url })))
    .returning();

  // Enqueue all jobs
  await scrapeQueue.addBulk(
    jobs.map((job) => ({
      name: 'scrape',
      data: { jobId: job.id, batchId: batch.id, url: job.sourceUrl },
    })),
  );

  return c.json(
    { batchId: batch.id, totalUrls: urls.length, status: batch.status },
    201,
  );
});

// GET /api/scrape/:batchId — poll batch status
scrapeRoutes.get('/:batchId', async (c) => {
  const batchId = c.req.param('batchId');

  const [batch] = await db
    .select()
    .from(batches)
    .where(eq(batches.id, batchId));

  if (!batch) {
    return c.json({ error: 'Batch not found' }, 404);
  }

  const jobs = await db
    .select({
      id: scrapeJobs.id,
      sourceUrl: scrapeJobs.sourceUrl,
      status: scrapeJobs.status,
      error: scrapeJobs.error,
    })
    .from(scrapeJobs)
    .where(eq(scrapeJobs.batchId, batchId));

  return c.json({
    id: batch.id,
    status: batch.status,
    totalUrls: batch.totalUrls,
    completed: batch.completed,
    failed: batch.failed,
    createdAt: batch.createdAt,
    jobs,
  });
});
