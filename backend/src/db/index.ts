import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://scraper:scraper@localhost:5432/media_scraper';

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
