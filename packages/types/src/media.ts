import { z } from 'zod';

export const MediaItemSchema = z.object({
  id: z.string(),
  mediaUrl: z.string(),
  type: z.enum(['image', 'video']),
  title: z.string().nullable(),
  sourceUrl: z.string(),
  createdAt: z.string(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const MediaResponseSchema = z.object({
  data: z.array(MediaItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export type MediaResponse = z.infer<typeof MediaResponseSchema>;

export const MediaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['image', 'video']).optional(),
  search: z.string().optional(),
});
export type MediaQuery = z.infer<typeof MediaQuerySchema>;
