# Staff authentication

Better Auth 1.7.7 runs in Hono on Node.js using Drizzle and the existing Neon HTTP
driver. Interactive adapter transactions stay disabled. Public signup remains
disabled; account creation is administrator-only.

## Local setup

Add `BETTER_AUTH_SECRET` (a random value of at least 32 characters) and exact
`BETTER_AUTH_URL=http://127.0.0.1:5173` to ignored `.env.local` alongside the Neon
variables. See [.env.example](../.env.example). Never store secrets in browser
variables or logs. For `pnpm preview`, supply `BETTER_AUTH_URL=http://127.0.0.1:4180`
in the process environment. Keep cookies and auth URLs specific to each scope.

`pnpm auth:bootstrap` is an operator-only first-development-account tool. It
requires the guarded development database and an empty account table. Supply
`AUTH_BOOTSTRAP_NAME`, `AUTH_BOOTSTRAP_EMAIL`, and `AUTH_BOOTSTRAP_PASSWORD` through
a private process environment, never source or command arguments. Use the
existing staff administrator when the table is populated. Synthetic verification
creates its own temporary accounts without bootstrap.

## Access and sessions

`/login` is public. A pathless TanStack route guards the home and `/staff` routes
by fetching `/api/session`; unauthenticated users go to login and staff cannot
open `/staff`. The existing home UI is retained. Logout waits for server session
revocation before returning to login.

Hono checks the database session on every application API request. Register
application APIs after the `requireSession` middleware in `server/app.ts`;
administrator operations also require `requireAdmin`. Role checks never trust
browser state or a cached role cookie. Health remains public.

The middleware also checks the current account ban flag, so a ban denies
application access through sessions issued before the ban. Logout remains
available to clear those sessions. Expired bans are cleared by Better Auth on
the next successful login.

The exposed Better Auth flows are email/password login, logout, session lookup,
and administrator account creation. Session tokens are delivered only through
HttpOnly cookies; login and session JSON responses omit them. Public signup is disabled in Better Auth
and has no exposed route. Other plugin endpoints, including role changes,
impersonation and profile changes, are not exposed. Account creation validates
the allowed fields, role and password length before forwarding to Better Auth;
the admin plugin also checks the administrator's permissions.

Sessions expire after eight hours and may renew after one hour. Cookies are
HttpOnly and SameSite=Lax, with Secure on HTTPS. Local HTTP is allowed only for
localhost/127.0.0.1. All auth POST requests require the configured origin,
including login; Better Auth's own origin/CSRF checks remain enabled. API
responses are uncached and auth errors are sanitized. Rate limiting persists in
Postgres across Node function instances, allows five login attempts per minute per IP,
and trusts only Vercel's overwritten `x-vercel-forwarded-for` header. Clients without that
trusted header share a per-path bucket.

Production requires a configured exact HTTPS origin. On Vercel previews,
`server/env.ts` selects only the exact deployment or branch origin from system
metadata; arbitrary Host/Origin values and other projects' previews are never
trusted. Each request gets one origin, preserving the existing mutation checks
throughout auth, patients, appointments and clinical records. Better Auth's own
CSRF checks and secure-cookie settings remain enabled.

Local Node development overwrites the trusted IP header from the socket, so
client-supplied proxy headers cannot bypass rate limits. Only the local test
harness accepts synthetic IP headers for isolated rate-limit verification.

## Verification

`pnpm auth:verify` launches a loopback Node test server, confirms the guarded
Neon development connection before SQL, and tests password hashing, login,
sessions, staff/admin permissions, account creation, CSRF, expiry, demotion,
logout and persistent rate limits. Random synthetic accounts are cleaned up in
`finally`. No fixture endpoint is included in `api/index.ts`.

Credential-free auth tests use Better Auth's memory adapter with the same
options. Live preview verification must also inspect Secure/HttpOnly/SameSite
cookies and attempt spoofed IP headers. See [verification](verification.md).

## Staff account lifecycle

Administrator listing, deactivation/reactivation, session revocation, assisted
recovery and authenticated password changes are available through the
feature-owned `/api/staff` routes. See [staff lifecycle](staff-lifecycle.md) for
the endpoint contracts, recovery restrictions, atomic audits, last-admin guard
and isolated Neon verification procedure. These endpoints reuse Better Auth's
credential hashing and auth tables; raw password/plugin mutation routes remain
closed. Recovery does not require an email provider.
