import type { ServerEnv } from '../../server/env.js';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { app as application } from '../../server/app';
import { createDatabase } from '../../server/db/client';

// Test-only entry point. The application's entry point never imports this file.
const app = new Hono<{ Bindings: ServerEnv }>();
app.get('/api/__verify/database', async (c) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(c.env.DATABASE_URL),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  // Refuse all SQL until the harness confirms the actual Hono binding matches
  // the selected development credentials. Never return the URL or fingerprint.
  if (fingerprint !== c.req.header('X-Expected-Database-Fingerprint')) {
    return c.json({ error: 'Database binding mismatch' }, 400);
  }

  const db = createDatabase(c.env);
  const result = await db.execute(sql`SELECT 1 AS value`);
  const batch = await db.batch([
    db.execute<{ value: number; transaction: string }>(
      sql`SELECT 1 AS value, txid_current()::text AS transaction`,
    ),
    db.execute<{ value: number; transaction: string }>(
      sql`SELECT 2 AS value, txid_current()::text AS transaction`,
    ),
  ]);

  let failedBatchRejected = false;
  try {
    await db.batch([db.execute(sql`SELECT 1`), db.execute(sql`SELECT 1 / 0`)]);
  } catch {
    failedBatchRejected = true;
  }

  let interactiveTransactionsUnsupported = false;
  try {
    await db.transaction(async (transaction) =>
      transaction.execute(sql`SELECT 1`),
    );
  } catch (error) {
    interactiveTransactionsUnsupported =
      error instanceof Error &&
      error.message === 'No transactions support in neon-http driver';
  }

  const recovered = await db.execute(sql`SELECT 1 AS value`);
  return c.json({
    credentialsMatch: true,
    selectOne: result.rows[0]?.value === 1,
    batchValues: [batch[0].rows[0]?.value, batch[1].rows[0]?.value],
    batchSharesTransaction:
      typeof batch[0].rows[0]?.transaction === 'string' &&
      batch[0].rows[0]?.transaction === batch[1].rows[0]?.transaction,
    failedBatchRejected,
    recoveredAfterFailure: recovered.rows[0]?.value === 1,
    interactiveTransactionsUnsupported,
  });
});

app.all('*', (c) => application.fetch(c.req.raw, c.env));
export default { fetch: app.fetch };
