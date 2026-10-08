import { defineConfig } from 'drizzle-kit';

// Node loads ignored env files through the db:* scripts. Generation is offline.
const databaseUrl = process.env.DATABASE_URL_UNPOOLED;

export default defineConfig({
  dialect: 'postgresql',
  schema: './worker/db/schema.ts',
  out: './drizzle',
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
