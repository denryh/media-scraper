import { z } from 'zod';

export const MAX_URLS_PER_REQUEST = 500;

export const ScrapeRequestSchema = z.object({
  urls: z.array(z.url()).min(1).max(MAX_URLS_PER_REQUEST),
});
export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;

export const BatchResponseSchema = z.object({
  batchId: z.string(),
  totalUrls: z.number().int(),
  status: z.string(),
});
export type BatchResponse = z.infer<typeof BatchResponseSchema>;

export const BatchStatusSchema = z.object({
  id: z.string(),
  status: z.string(),
  totalUrls: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  createdAt: z.string(),
  jobs: z.array(
    z.object({
      id: z.string(),
      sourceUrl: z.string(),
      status: z.string(),
      error: z.string().nullable(),
    }),
  ),
});
export type BatchStatus = z.infer<typeof BatchStatusSchema>;
