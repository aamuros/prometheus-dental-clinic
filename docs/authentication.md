# Staff authentication

Better Auth 1.7.7 runs inside the existing Hono Worker, using the Drizzle adapter
and Neon HTTP driver. `nodejs_als` supplies AsyncLocalStorage as documented by
[Better Auth's versioned Hono integration](https://github.com/better-auth/better-auth/blob/v1.7.7/docs/content/docs/integrations/hono.mdx)
and [Cloudflare](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-asynclocalstorage).
The adapter explicitly disables interactive transactions, which Neon HTTP does
not support. No managed Neon Auth service or separate auth host is provisioned.

## Local setup

Use the linked Neon `development` branch and its pulled `.env.local`. Configure
ignored `.dev.vars` using `.dev.vars.example`:

- `DATABASE_URL`: development's pooled URL.
- `BETTER_AUTH_SECRET`: a random secret with at least 32 characters. Generate
  locally with `openssl rand -base64 32`; never put it in `VITE_*` or source control.
- `BETTER_AUTH_URL`: the exact app origin, normally `http://127.0.0.1:5173`,
  without a path or trailing slash. Adjust it if the development port changes.

Run `pnpm db:migrate` after confirming that `DATABASE_URL_UNPOOLED` points to
development and no `.env` or process variable overrides it. The migration creates
only auth tables and indexes; the database constrains roles to `admin` and `staff`.

Create the first administrator from an authorized operator's terminal. Set
`AUTH_BOOTSTRAP_NAME`, `AUTH_BOOTSTRAP_EMAIL`, and `AUTH_BOOTSTRAP_PASSWORD` in
the environment, then run `pnpm auth:bootstrap`. The password must be 12–128
characters. Avoid placing the password in shell history; use a hidden shell
prompt or your secret manager. Unset the values afterward.

Bootstrap runs only with the development context, matching local database
credentials, and an empty user table. It calls Better Auth's server API without
an HTTP endpoint. Run it once, without concurrent bootstrap processes. Subsequent
accounts must be created by a logged-in administrator at `/staff`, with role
`staff` or `admin`. The bootstrap script does not provision a production account.
Accounts can also be designated as dentists, independently of their access role.
Administrator account creation accepts optional `data: { isDentist: boolean }`;
other additional data is rejected. Existing accounts can be designated through
the admin-only [appointment scheduling](appointments.md) settings on `/staff`.

## Access and sessions

`/login` is public. A pathless TanStack route guards the home and `/staff` routes
by fetching `/api/session`; unauthenticated users go to login and staff cannot
open `/staff`. The existing home UI is retained. Logout waits for server session
revocation before returning to login.

Hono checks the database session on every application API request. Register
application APIs after the `requireSession` middleware in `worker/app.ts`;
administrator operations also require `requireAdmin`. Role checks never trust
browser state or a cached role cookie. Health remains public.

The exposed Better Auth flows are email/password login, logout, session lookup,
and administrator account creation. Public signup is disabled in Better Auth
and has no exposed route. Other plugin endpoints, including role changes,
impersonation and profile changes, are not exposed. Account creation validates
the allowed fields, role and password length before forwarding to Better Auth;
the admin plugin also checks the administrator's permissions.

Sessions expire after eight hours and may renew after one hour. Cookies are
HttpOnly and SameSite=Lax, with Secure on HTTPS. Local HTTP is allowed only for
localhost/127.0.0.1. All auth POST requests require the configured origin,
including login; Better Auth's own origin/CSRF checks remain enabled. API
responses are uncached and auth errors are sanitized. Rate limiting persists in
Postgres across Worker isolates, allows five login attempts per minute per IP,
and trusts only Cloudflare's `cf-connecting-ip` header. Clients without that
trusted header share a per-path bucket.

## Verification

`pnpm check` runs credential-free tests using Better Auth's memory adapter with
the same auth options, plus route/UI and existing API tests. To exercise the real
adapter and database in workerd:

```sh
pnpm build
pnpm auth:verify
```

The harness requires `.neon`, development `.env.local` and `.dev.vars`; it refuses
conflicting credentials and confirms the runtime database binding before SQL.
It starts a test-only Worker on `127.0.0.1:8788`, overrides the auth origin for
that port, and checks a marker to avoid testing a different local server. It
creates randomly named synthetic accounts, verifies hashed passwords, login,
session restoration, role enforcement, administrator account creation, CSRF,
role changes, expiration, logout, and persistent rate limiting. It deletes its
accounts (cascading accounts/sessions) and test rate-limit buckets and stops its
runtime. The production entry point has no fixture/bootstrap endpoint.

The development migration and the complete HTTP authentication flow passed in
local workerd on 2026-10-08 with `nodejs_als`; full Node compatibility was not
needed. This verification does not claim a production deployment or browser E2E
test. No genuine clinic account was seeded.

## External configuration

No OAuth credentials, mail provider, or Neon Auth URL are required for the
implemented email/password flow. For a future deployment, set encrypted Worker
secrets `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` (an HTTPS
origin), apply reviewed migrations separately, and plan the authorized initial
production administrator. Nothing here migrates or writes to production.
Password reset, email verification, account removal, and administrator session
revocation are outside this minimal feature; no email delivery is configured.

The dependency audit found no high/critical advisories. Drizzle Kit's transitive
development-only esbuild 0.18.20 has moderate advisory
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
This change does not start that esbuild development server.
