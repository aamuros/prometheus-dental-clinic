import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createAuth } from './auth.js';
import { requireAdmin, requireSession, type AuthEnv } from './middleware.js';

export const authRoutes = new Hono<AuthEnv>();
authRoutes.use('*', bodyLimit({ maxSize: 8192 }));
authRoutes.use('*', async (c, next) => {
  if (
    c.req.method === 'POST' &&
    c.req.header('Origin') !== c.env.BETTER_AUTH_URL
  ) {
    console.warn(
      JSON.stringify({
        event: 'auth_origin_rejected',
        code: 'AUTH_ORIGIN_REJECTED',
        method: 'POST',
        status: 403,
      }),
    );
    return c.json({ error: 'Untrusted request origin' }, 403);
  }
  await next();
});

// Expose only the flows the clinic uses. Other Better Auth/plugin endpoints
// (signup, profile updates, role changes, impersonation) stay inaccessible.
authRoutes.post(
  '/admin/create-user',
  requireSession,
  requireAdmin,
  async (c) => {
    const body: unknown = await c.req.raw
      .clone()
      .json()
      .catch(() => null);
    if (
      !body ||
      typeof body !== 'object' ||
      !('name' in body) ||
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.length > 100 ||
      !('email' in body) ||
      typeof body.email !== 'string' ||
      body.email.length > 254 ||
      !('password' in body) ||
      typeof body.password !== 'string' ||
      body.password.length < 12 ||
      body.password.length > 128 ||
      !('role' in body) ||
      (body.role !== 'staff' && body.role !== 'admin') ||
      ('data' in body &&
        (!body.data ||
          typeof body.data !== 'object' ||
          Array.isArray(body.data) ||
          Object.keys(body.data).some((key) => key !== 'isDentist') ||
          !('isDentist' in body.data) ||
          typeof body.data.isDentist !== 'boolean')) ||
      Object.keys(body).some(
        (key) => !['name', 'email', 'password', 'role', 'data'].includes(key),
      )
    ) {
      return c.json({ error: 'Invalid account details' }, 400);
    }
    return handleAuth(c.get('auth'), c.req.raw);
  },
);

authRoutes.on(
  ['GET', 'POST'],
  ['/sign-in/email', '/sign-out', '/get-session'],
  (c) => handleAuth(createAuth(c.env), c.req.raw),
);
authRoutes.all('*', (c) => c.json({ error: 'Not found' }, 404));

async function handleAuth(
  auth: ReturnType<typeof createAuth>,
  request: Request,
) {
  const response = await auth.handler(request);
  if (response.status < 400) return response;
  const headers = new Headers(response.headers);
  const retryAfter = headers.get('X-Retry-After');
  if (retryAfter) headers.set('Retry-After', retryAfter);
  return Response.json(
    {
      error:
        response.status === 429
          ? 'Too many attempts. Try again later.'
          : response.status >= 500
            ? 'Authentication unavailable'
            : 'Authentication request rejected',
    },
    { status: response.status, headers },
  );
}
