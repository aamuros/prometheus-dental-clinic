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

## Results — 2026-10-10

- Node 24.19.0 / pnpm 12.10.1; frozen install and `pnpm check` passed:
  strict typechecks, lint, formatting, all 193 tests in 12 files and Vite build.
- Wrangler, the Cloudflare Vite plugin, runtime types, generated bindings,
  configuration and deployment workflow were removed. The obsolete tooling-only
  sharp override/build allowlist was removed too. `@hono/node-server` 2.1.4 is
  the only new runtime package, used for local development and live verification.
- `pnpm dev` uses Vite and a watched Node API; `pnpm preview` serves built assets
  on port 4180. `pnpm workflows:verify` orchestrates synthetic workflows and cleanup.
- Node database/auth harnesses passed with the real Neon HTTP/Drizzle adapter:
  batch transactions/recovery, login, hashing, sessions, permissions, CSRF,
  demotion, expiry, logout and persistent rate limits.
- Read-only SQL confirmed nine application/auth tables, five exact migration
  hashes, dentist overlap exclusion and the clinical audit trigger. No migration,
  database reset or new Neon project was needed.
- Vercel preview of application commit `1913857` is READY:
  <https://prometheus-dental-clinic-pjbvqpl0p-aamuros-projects.vercel.app>.
  Its bundled Node API is 1.54 MB in `sin1`; Git integration uses Node 24.x,
  automatic system variables and `main` as the production target.
- Branch-scoped Preview overrides for `DATABASE_URL` and `BETTER_AUTH_SECRET`
  select the existing development database and local development auth secret.
  No production variables, release settings or data were changed.
- `pnpm workflows:verify` passed locally and on the protected Vercel preview:
  patient CRUD/archive, staff permissions, scheduling, simultaneous conflicts,
  clinical CRUD, concurrent edit rejection, full audit history and session revocation.
- Playwright verified preview login, synthetic patient create/edit/archive and
  persisted Neon state, client navigation, direct reload, JS/CSS delivery, safe
  unknown-API JSON and logout. Only synthetic fixtures were operated on and cleaned.
- Live preview security checks returned protected API 401s, CSRF 403s and
  oversized auth 413s. Six synthetic login attempts with rotating spoofed
  forwarding headers still reached the persistent rate limit (429 + Retry-After).
- Downloaded preview assets and 200 sampled preview log entries contained none
  of the configured database URLs, password or auth secret. The sample had no 5xx.

## Risks and release instructions

The high-severity audit passes; one moderate esbuild advisory remains in Drizzle
Kit's development tooling. It is not in the deployed function's import graph.
Aliases beyond Vercel's exact deployment/branch origins require explicit auth
configuration and verification. Verification uses the provided development
branch, isolated from production; no production database was accessed.

Review CI and merge only after separate production release authorization.
Production will use its existing variables; migrations do not run on deployment.
Retirement of any remote resources in the former hosting account is a separate
operator action. Do not remove an active production runtime as part of this PR.
