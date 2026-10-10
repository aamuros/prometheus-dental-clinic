import type { ServerEnv } from '../../env.js';
import { createMiddleware } from 'hono/factory';
import type { StaffSession } from '../../../shared/auth.js';
import { createAuth } from './auth.js';

export type AuthEnv = {
  Bindings: ServerEnv;
  Variables: {
    auth: ReturnType<typeof createAuth>;
    staffSession: StaffSession;
  };
};

export const requireSession = createMiddleware<AuthEnv>(async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Authentication required' }, 401);
  const role = session.user.role;
  // Better Auth checks bans on login, so also deny sessions issued before a ban.
  if (session.user.banned || (role !== 'admin' && role !== 'staff'))
    return c.json({ error: 'Access denied' }, 403);
  c.set('auth', auth);
  c.set('staffSession', {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role,
    },
  });
  await next();
});

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get('staffSession').user.role !== 'admin')
    return c.json({ error: 'Administrator access required' }, 403);
  await next();
});
