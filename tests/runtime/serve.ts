import { serve } from '@hono/node-server';
import database from './database-server.js';
import auth from './auth-server.js';
import { serverEnv } from '../../server/env.js';

// Local test-only fixtures; api/index.ts never imports this module.
const handler = process.argv[2] === 'database' ? database : auth;
serve({
  hostname: '127.0.0.1',
  port: Number(process.argv[3]),
  fetch: (request) =>
    handler.fetch(request, serverEnv(process.env, new URL(request.url).origin)),
});
