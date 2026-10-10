import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { ConfigurationError } from './configuration-error.js';
import type { ApiError, HealthResponse } from '../shared/api.js';
import { requireSession, type AuthEnv } from './features/auth/middleware.js';
import { authRoutes } from './features/auth/routes.js';
import { patientRoutes } from './features/patients/routes.js';
import { appointmentRoutes } from './features/appointments/routes.js';
import { dentalRecordRoutes } from './features/dental-records/routes.js';

export const app = new Hono<AuthEnv>();

app.use('*', async (c, next) => {
  const start = performance.now();
  c.header('Cache-Control', 'no-store');
  await next();
  // Do not log URLs, headers, bodies, or exception messages by default.
  console.info(
    JSON.stringify({
      method: c.req.method,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    }),
  );
});

app.use(
  '*',
  secureHeaders({
    strictTransportSecurity: false,
    xFrameOptions: 'DENY',
    referrerPolicy: 'no-referrer',
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  }),
);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok' } satisfies HealthResponse);
});

app.all('/api/health', (c) => {
  c.header('Allow', 'GET, HEAD');
  return c.json({ error: 'Method not allowed' } satisfies ApiError, 405);
});

app.route('/api/auth', authRoutes);

// Application APIs registered below this point require a database session.
app.use('/api/*', requireSession);
app.get('/api/session', (c) => c.json(c.get('staffSession')));
app.route('/api/patients', patientRoutes);
app.route('/api/appointments', appointmentRoutes);
app.route('/api/dental-records', dentalRecordRoutes);

app.notFound((c) => c.json({ error: 'Not found' } satisfies ApiError, 404));

app.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500;
  if (status >= 500) {
    const cause = error.cause ?? error;
    const databaseCode =
      cause &&
      typeof cause === 'object' &&
      'code' in cause &&
      typeof cause.code === 'string' &&
      [
        '28P01',
        '3D000',
        '42P01',
        '42703',
        '42501',
        '23505',
        '23503',
        '23514',
        '23P01',
        '40001',
      ].includes(cause.code)
        ? cause.code
        : undefined;
    console.error(
      JSON.stringify({
        event: 'server_error',
        ...(error instanceof ConfigurationError
          ? {
              code: 'SERVER_CONFIGURATION_INVALID',
              variable: error.variable,
              reason: error.reason,
            }
          : databaseCode
            ? { code: 'DATABASE_ERROR', databaseCode }
            : { code: 'UNEXPECTED_ERROR' }),
        method: c.req.method,
        status,
      }),
    );
  }
  return c.json(
    {
      error: status >= 500 ? 'Internal server error' : 'Request rejected',
    } satisfies ApiError,
    status,
  );
});
