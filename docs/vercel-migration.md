# Vercel runtime migration

The migration starts from `4fdf243` on `chore/connect-neon-development`,
which includes the verified Node ESM imports and account/date fixes absent
from `main`. Keep React/Vite, TanStack Router, Hono, Better Auth, the Neon HTTP
driver, Drizzle schemas and all five SQL migrations.

Implementation and verification:

1. Rename `worker/` to `server/`, use explicit environment contracts and
   NodeNext checks, and remove platform bindings, Wrangler and its plugins.
2. Keep the Vercel Node function and `/api` routing. Resolve exact deployment
   origins from Vercel system metadata; retain CSRF, secure cookies and
   persistent rate limits using Vercel's trusted forwarding header.
3. Run Vite and a loopback Node Hono server with hot reload. Replace runtime
   verifiers with Node harnesses and keep synthetic fixtures outside deployment.
4. Retain credential-free GitHub CI and Vercel Git deployment integration.
   Update development, environment, architecture and verification instructions.
5. Run all checks, audit and real database/auth/business verification; validate
   a non-production Vercel preview and open a PR against `main`.

Reuse development project `muddy-boat-93080753`, branch `br-red-sun-b3nj2cwd`,
database `prometheus_dental_clinic`. Verify existing tables and migration
records without resetting or running migrations. Use a disposable child of
development for preview writes where possible. Never modify production
variables, data, branch settings or deploy production.

Verification results and remaining risks are recorded here after execution.
