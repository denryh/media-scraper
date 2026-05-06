import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').notNull().default('pending'),
  totalUrls: integer('total_urls').notNull(),
  completed: integer('completed').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const scrapeJobs = pgTable(
  'scrape_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    sourceUrl: text('source_url').notNull(),
    status: text('status').notNull().default('pending'),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('scrape_jobs_batch_id_idx').on(table.batchId),
    index('scrape_jobs_status_idx').on(table.status),
  ],
);

export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => scrapeJobs.id),
    sourceUrl: text('source_url').notNull(),
    mediaUrl: text('media_url').notNull(),
    type: text('type').notNull(),
    title: text('title'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('media_type_idx').on(table.type),
    index('media_job_id_idx').on(table.jobId),
  ],
);

export type Batch = typeof batches.$inferSelect;
export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type MediaItem = typeof media.$inferSelect;
