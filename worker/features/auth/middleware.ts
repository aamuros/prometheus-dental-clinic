import { createMiddleware } from 'hono/factory';
import type { StaffSession } from '../../../shared/auth';
import { createAuth } from './auth';

export type AuthEnv = {
  Bindings: WorkerBindings;
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
  if (role !== 'admin' && role !== 'staff')
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
