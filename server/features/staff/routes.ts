import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireAdmin, type AuthEnv } from '../auth/middleware.js';
import { createDatabase } from '../../db/client.js';
import {
  allowPasswordAttempt,
  credentialHash,
  listStaff,
  mutateStaff,
  type StaffAction,
} from './queries.js';

export const staffRoutes = new Hono<AuthEnv>();
staffRoutes.use(
  '*',
  bodyLimit({
    maxSize: 8192,
    onError: (c) => c.json({ error: 'Request too large' }, 413),
  }),
);
staffRoutes.use('*', async (c, next) => {
  if (
    c.req.method === 'POST' &&
    c.req.header('Origin') !== c.env.BETTER_AUTH_URL
  )
    return c.json({ error: 'Untrusted request origin' }, 403);
  await next();
});
staffRoutes.get('/', requireAdmin, async (c) => {
  const query = new URL(c.req.url).searchParams;
  const pageValue = query.get('page') ?? '1';
  if (
    [...query.keys()].some((key) => key !== 'page') ||
    query.getAll('page').length > 1 ||
    !/^[1-9]\d{0,4}$/.test(pageValue)
  )
    return c.json({ error: 'Invalid pagination' }, 400);
  return c.json(await listStaff(createDatabase(c.env), Number(pageValue)));
});

function passwordDetails(
  body: unknown,
): body is { currentPassword: string; newPassword: string } {
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body).length === 2 &&
    'currentPassword' in body &&
    typeof body.currentPassword === 'string' &&
    body.currentPassword.length > 0 &&
    body.currentPassword.length <= 128 &&
    'newPassword' in body &&
    typeof body.newPassword === 'string' &&
    body.newPassword.length >= 12 &&
    body.newPassword.length <= 128
  );
}

function mutation(action: StaffAction) {
  return async (c: Context<AuthEnv>) => {
    const actorId = c.get('staffSession').user.id;
    const targetId = action === 'change-password' ? actorId : c.req.param('id');
    if (!targetId || !/^[A-Za-z0-9_-]{1,128}$/.test(targetId))
      return c.json({ error: 'Invalid account identifier' }, 400);
    const body: unknown = await c.req.json().catch(() => null);
    const db = createDatabase(c.env);
    let expectedHash: string | undefined;
    let newHash: string | undefined;
    if (action === 'change-password' || action === 'recover-password') {
      if (
        !passwordDetails(body) ||
        (action === 'change-password' &&
          body.currentPassword === body.newPassword)
      )
        return c.json({ error: 'Invalid password details' }, 400);
      if (!(await allowPasswordAttempt(db, actorId))) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Too many attempts. Try again later.' }, 429);
      }
      expectedHash = (await credentialHash(db, actorId)) ?? undefined;
      const { password } = await c.get('auth').$context;
      if (
        !expectedHash ||
        !(await password.verify({
          hash: expectedHash,
          password: body.currentPassword,
        }))
      )
        return c.json({ error: 'Password verification failed' }, 400);
      newHash = await password.hash(body.newPassword);
    } else if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length
    ) {
      return c.json({ error: 'Invalid account details' }, 400);
    }
    const status = await mutateStaff(db, {
      actorId,
      targetId,
      action,
      sessionId: c.get('sessionId'),
      ...(expectedHash ? { expectedHash } : {}),
      ...(newHash ? { newHash } : {}),
    });
    if (status === 'not_found')
      return c.json({ error: 'Account not found' }, 404);
    if (status === 'forbidden') return c.json({ error: 'Access denied' }, 403);
    if (status === 'last_admin')
      return c.json(
        { error: 'The last active administrator must retain access' },
        409,
      );
    if (status === 'conflict')
      return c.json({ error: 'Account changed; sign in and try again' }, 409);
    return c.json({ success: true });
  };
}
staffRoutes.post('/password', mutation('change-password'));
staffRoutes.post('/:id/deactivate', requireAdmin, mutation('deactivate'));
staffRoutes.post('/:id/reactivate', requireAdmin, mutation('reactivate'));
staffRoutes.post(
  '/:id/revoke-sessions',
  requireAdmin,
  mutation('revoke-sessions'),
);
staffRoutes.post(
  '/:id/recover-password',
  requireAdmin,
  mutation('recover-password'),
);
