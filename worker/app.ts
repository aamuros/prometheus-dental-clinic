import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiError, HealthResponse } from '../shared/api';

export const app = new Hono();

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

app.notFound((c) => c.json({ error: 'Not found' } satisfies ApiError, 404));

app.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500;
  return c.json(
    {
      error: status >= 500 ? 'Internal server error' : 'Request rejected',
    } satisfies ApiError,
    status,
  );
});
