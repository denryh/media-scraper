import { Hono } from 'hono';
import { eq, ilike, or, sql, count } from 'drizzle-orm';
import { MediaQuerySchema } from '@media-scraper/types';
import { db } from '../db';
import { media } from '../db/schema';

export const mediaRoutes = new Hono();

// GET /api/media — paginated media list with filtering
mediaRoutes.get('/', async (c) => {
  const parsed = MediaQuerySchema.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, 400);
  }

  const { page, limit, type, search } = parsed.data;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [];
  if (type) {
    conditions.push(eq(media.type, type));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(media.mediaUrl, pattern),
        ilike(media.title, pattern),
      )!,
    );
  }

  const where = conditions.length > 0
    ? conditions.length === 1
      ? conditions[0]
      : sql`${conditions[0]} AND ${conditions[1]}`
    : undefined;

  // Run data + count queries in parallel
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(media)
      .where(where)
      .orderBy(media.createdAt)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(media)
      .where(where),
  ]);

  const total = totalRow?.total ?? 0;

  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      mediaUrl: row.mediaUrl,
      type: row.type,
      title: row.title,
      sourceUrl: row.sourceUrl,
      createdAt: row.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
