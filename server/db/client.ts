import type { ServerEnv } from '../env.js';
import { ConfigurationError } from '../configuration-error.js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// Create inside a request using c.env; never read secrets from browser code.
export function createDatabase(env: Pick<ServerEnv, 'DATABASE_URL'>) {
  if (!env.DATABASE_URL?.trim()) {
    throw new ConfigurationError('DATABASE_URL', 'missing');
  }

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new ConfigurationError('DATABASE_URL', 'invalid');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname)
    throw new ConfigurationError('DATABASE_URL', 'invalid');

  return drizzle(neon(env.DATABASE_URL), { schema });
}
