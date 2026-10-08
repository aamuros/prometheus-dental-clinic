import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Create inside a request using c.env; never read secrets from browser code.
export function createDatabase(env: Pick<WorkerBindings, 'DATABASE_URL'>) {
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required');
  }

  return drizzle(neon(env.DATABASE_URL), { schema });
}
