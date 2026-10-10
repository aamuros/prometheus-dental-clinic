import type { ServerEnv } from '../../server/env.js';
import { Hono } from 'hono';
import { and, eq, inArray, like } from 'drizzle-orm';
import { app } from '../../server/app';
import { createAuth } from '../../server/features/auth/auth';
import { createDatabase } from '../../server/db/client';
import { account, rateLimit, session, user } from '../../server/db/schema';

// Local verification only. The production entry point never imports this file.
const verifier = new Hono<{ Bindings: ServerEnv }>();
verifier.use('*', async (c, next) => {
  await next();
  c.header('X-Auth-Runtime-Verifier', 'true');
});
verifier.onError((error, c) => {
  const cause = error.cause;
  return c.json(
    {
      errorClass: error.name,
      causeClass: cause instanceof Error ? cause.name : null,
      code:
        cause &&
        typeof cause === 'object' &&
        'code' in cause &&
        typeof cause.code === 'string' &&
        /^[A-Z0-9]{5}$/.test(cause.code)
          ? cause.code
          : null,
    },
    500,
  );
});
verifier.post('/api/__verify/auth', async (c) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(c.env.DATABASE_URL),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (fingerprint !== c.req.header('X-Expected-Database-Fingerprint'))
    return c.json({ error: 'Database binding mismatch' }, 400);
  const body: unknown = await c.req.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('run' in body) ||
    typeof body.run !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(body.run) ||
    !('action' in body)
  ) {
    return c.json({ error: 'Invalid verification request' }, 400);
  }
  const prefix = `auth-smoke-${body.run}-`;
  const db = createDatabase(c.env);
  if (
    body.action === 'seed' &&
    'password' in body &&
    typeof body.password === 'string'
  ) {
    const auth = createAuth(c.env);
    for (const role of ['admin', 'staff'] as const) {
      await auth.api.createUser({
        body: {
          name: 'Runtime test',
          email: `${prefix}${role}@example.test`,
          password: body.password,
          role,
        },
      });
    }
    const records = await db
      .select({ password: account.password })
      .from(account)
      .innerJoin(user, eq(account.userId, user.id))
      .where(like(user.email, `${prefix}%`));
    return c.json({
      credentialsMatch: true,
      passwordsHashed:
        records.length === 2 &&
        records.every(
          (record) => !!record.password && record.password !== body.password,
        ),
    });
  }
  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(like(user.email, `${prefix}%`));
  if (body.action === 'cleanup') {
    if (users.length)
      await db.delete(user).where(
        inArray(
          user.id,
          users.map((record) => record.id),
        ),
      );
    const segment = body.run.replaceAll('-', '');
    const suffix = `${Number.parseInt(segment.slice(0, 2), 16)}.${Number.parseInt(segment.slice(2, 4), 16)}`;
    const ips = [`198.18.${suffix}`, `198.19.${suffix}`];
    await db.delete(rateLimit).where(
      inArray(
        rateLimit.key,
        ips.flatMap((ip) =>
          ['/sign-in/email', '/sign-out', '/admin/create-user'].map(
            (path) => `${ip}|${path}`,
          ),
        ),
      ),
    );
    return c.json({ cleaned: true });
  }
  if (body.action === 'expire') {
    const ids = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, `${prefix}staff@example.test`));
    if (ids[0])
      await db
        .update(session)
        .set({ expiresAt: new Date(0) })
        .where(eq(session.userId, ids[0].id));
    return c.json({ expired: true });
  }
  if (body.action === 'demote') {
    await db
      .update(user)
      .set({ role: 'staff' })
      .where(
        and(
          eq(user.email, `${prefix}admin@example.test`),
          eq(user.role, 'admin'),
        ),
      );
    return c.json({ demoted: true });
  }
  return c.json({ error: 'Invalid action' }, 400);
});
verifier.all('*', (c) => app.fetch(c.req.raw, c.env));

export default {
  fetch: verifier.fetch,
};
