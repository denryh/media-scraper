import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index';
import { logger } from '../lib/logger';

export async function runMigrations() {
  logger.info('running migrations');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  logger.info('migrations complete');
}
