import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index';

export async function runMigrations() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  console.log('Migrations complete');
}
