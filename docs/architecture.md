# Architecture

## One application, one deployment

Prometheus Dental Clinic is a feature-oriented modular monolith: a React/Vite
SPA and Hono API deployed together on Vercel. `api/index.ts` exports a Node.js
fetch handler. Vercel bundles its imports; NodeNext checks and explicit `.js`
imports prevent the extensionless ESM failure fixed on the working preview branch.

`vercel.json` routes `/api` and `/api/*` to that function before filesystem or
SPA fallback. API responses retain JSON errors and Hono security headers. Other
requests receive static security headers, then existing files or `index.html`
for TanStack navigation. Static delivery does not invoke the API. Function
compute is in Singapore (`sin1`), near the Neon database.

## Boundaries and organization

`src/` runs in browsers, `server/` in Node and `shared/` contains only portable
contracts. Strict TypeScript passes separate these environments; ESLint rejects
server imports in browser modules. Secrets and database clients never belong in
shared modules. Same-origin fetch needs no permissive CORS middleware.

Business features live under `src/features/<feature>/` and
`server/features/<feature>/`. Routes compose features. Handlers validate input,
authorize, invoke queries and translate results. Extract shared code only for
actual reuse or independently testable behavior; avoid speculative layers.

TanStack Router uses a code-based route tree. Protected loaders require server
sessions. Tailwind 4, semantic tokens and accessible controls provide the UI;
React and all existing feature components remain unchanged by the migration.

## API and authentication

Hono returns uncached JSON, health 200, unsupported health methods 405, safe
404s and sanitized exceptions. Protected routes first enforce the current
database session, role and ban status. Clinical-only access checks the dentist
flag on the server. Request logs contain only method, status and duration.

Better Auth uses native Node AsyncLocalStorage, Drizzle and database sessions.
`server/env.ts` adapts process variables to a portable request environment.
Production requires the configured HTTPS auth origin. Preview requests use only
exact origins from Vercel's deployment/branch metadata, never wildcard hosts or
client-controlled forwarding headers. All mutation CSRF checks remain enabled.
Vercel's overwritten `x-vercel-forwarded-for` is the only trusted IP header;
local development overwrites it from the socket. Rate limits persist in Neon.
See [authentication](authentication.md).

## Persistence

`server/db/client.ts` creates request-scoped Drizzle clients with Neon's HTTP
driver and a server-only pooled `DATABASE_URL`. Health does not query the database.
HTTP batch transactions work; interactive transaction callbacks do not.
Staff lifecycle mutations acquire an account-table write lock in the first
batch statement, then recheck authority and last-admin eligibility in a fresh
READ COMMITTED snapshot. Account changes, session revocation and audit insertion
commit together. See [staff lifecycle](staff-lifecycle.md).

`server/db/schema.ts` owns auth tables and exports feature-owned tables. Reviewed
SQL preserves [appointment exclusion constraints](appointments.md), restrictive
clinical foreign keys and the [atomic revision trigger](dental-records.md).
No schema or migration changes are part of the runtime migration.

Drizzle Kit uses direct `DATABASE_URL_UNPOOLED` for separate, operator-run
migrations. `.env.local`, optional `.env`, then process variables supply local
configuration in increasing priority. `neon.ts` provisions no additional services.
Reuse project `muddy-boat-93080753`, development branch `br-red-sun-b3nj2cwd` and
`prometheus_dental_clinic`; never use production for synthetic verification.

## Development and verification

`pnpm dev` starts Vite and a minimal loopback Node Hono server, with frontend hot
reload, backend watch mode and `/api` proxying. `pnpm preview` serves built assets
and the same API on port 4180. Neither requires another application service.

Vitest uses Node for API tests and jsdom for React. The plain emitted-ESM test
checks actual Node resolution. Guarded live harnesses launch Node test entries,
verify credentials before SQL and clean synthetic accounts. They never appear
in the deployed entry. GitHub CI is credential-free; Vercel Git integration
builds previews. See [verification](verification.md) and [deployment](deployment.md).
