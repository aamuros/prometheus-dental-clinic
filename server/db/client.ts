import type { ServerEnv } from '../env.js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// Create inside a request using c.env; never read secrets from browser code.
export function createDatabase(env: Pick<ServerEnv, 'DATABASE_URL'>) {
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required');
  }

  return drizzle(neon(env.DATABASE_URL), { schema });
}
