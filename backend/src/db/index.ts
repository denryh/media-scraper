import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://scraper:scraper@localhost:5432/media_scraper';

const poolSize = Number(process.env.DATABASE_POOL_SIZE) || 50;
const client = postgres(connectionString, { max: poolSize, idle_timeout: 30 });
export const db = drizzle(client, { schema });
