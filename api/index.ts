import { app } from '../worker/app.js';

// Vercel supplies Node.js environment variables instead of Worker bindings.
export default {
  fetch(request: Request) {
    return app.fetch(request, {
      DATABASE_URL: process.env.DATABASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    } satisfies WorkerBindings);
  },
};
