import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://scraper:scraper@localhost:5432/media_scraper';

const client = postgres(connectionString, {
  max: config.databaseMaxPoolSize,
  idle_timeout: 30,
});
export const db = drizzle(client, { schema });
