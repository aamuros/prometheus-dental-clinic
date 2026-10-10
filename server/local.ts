import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import handler from '../api/index.js';

const preview = process.argv.includes('--preview');
const local = new Hono();
local.all('/api', (c) => handler.fetch(c.req.raw));
local.all('/api/*', (c) => handler.fetch(c.req.raw));
if (preview) {
  // Match Vercel's static security headers; API responses retain Hono's policy.
  local.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    await next();
  });
  local.use('*', serveStatic({ root: './dist/client' }));
  local.get('*', serveStatic({ path: './dist/client/index.html' }));
}
const port = preview ? 4180 : 3001;
serve(
  {
    hostname: '127.0.0.1',
    port,
    fetch(request, bindings) {
      // Loopback development trusts the socket, never a browser forwarding header.
      request.headers.set(
        'x-vercel-forwarded-for',
        bindings.incoming.socket.remoteAddress ?? '127.0.0.1',
      );
      return local.fetch(request);
    },
  },
  () => console.info(`Local Node API listening on http://127.0.0.1:${port}`),
);
