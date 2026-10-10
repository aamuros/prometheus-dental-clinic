import { app } from '../server/app.js';
import { serverEnv } from '../server/env.js';

// Vercel bundles this entry and its explicit .js ESM imports for Node.js.
export default {
  fetch(request: Request) {
    return app.fetch(
      request,
      serverEnv(process.env, new URL(request.url).origin),
    );
  },
};
