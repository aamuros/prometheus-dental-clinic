# Vercel deployment

Use the existing `aamuros-projects/prometheus-dental-clinic` project and Git
integration. Every non-production branch gets a preview; `main` is the
production branch target. GitHub Actions runs `pnpm check` and the high-severity
audit with a frozen lockfile. It has no deployment credentials or migration step.
Require these checks during PR review before authorizing a release.

`vercel.json` selects Vite, `pnpm build:vercel`, `dist/client` and Singapore
function compute. `api/index.ts` uses Vercel's default Node.js runtime. Set the
project Node version to 24.x, matching `.node-version`. The build checks NodeNext
imports; Vercel bundles the API and imported modules separately from static assets.

## Environment scopes

| Environment | Configuration                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------- |
| Development | Ignored `.env.local`: pooled runtime URL, direct operator URL, auth secret, local auth origin |
| Preview     | Server-only `DATABASE_URL` for the isolated development database and a separate auth secret   |
| Production  | Existing production variables; no changes authorized by this migration                        |

Production `BETTER_AUTH_URL` must be the exact staff-facing HTTPS origin with
no path or trailing slash. The canonical production domain supplied through
`VERCEL_PROJECT_PRODUCTION_URL` is also accepted, so a stale configured origin
does not block login on that domain. Keep automatic system environment variables
enabled. Other production aliases must use the explicitly configured origin.
Preview auth origins are selected from Vercel's exact
`VERCEL_URL` / `VERCEL_BRANCH_URL` metadata; keep automatic system environment
variables enabled. Do not configure a wildcard trusted origin. Aliases outside
these exact origins need deliberate configuration and testing before use.

Keep `DATABASE_URL_UNPOOLED` out of deployment configuration; migration commands
run separately. Never use `VITE_*` for secrets. Confirm the preview database
belongs to project `muddy-boat-93080753`, development branch `br-red-sun-b3nj2cwd`,
database `prometheus_dental_clinic`; do not point previews at production.
Use a runtime role with minimum data permissions and a separate DDL migration
role before production patient use.

## Preview validation

Push the reviewed migration branch, inspect its Vercel deployment, and follow
[verification](verification.md). Authenticate protected previews using the
existing Vercel CLI identity or an origin-scoped development OIDC header; keep
Deployment Protection enabled. Do not share tokens or secret-bearing artifacts.

No command in this repository deploys production. Do not merge `main`, promote
a preview, change production variables or run production migrations without
separate authorization. Existing runtime retirement in the former hosting
account requires a separate operator action; deleting remote resources is not
part of this PR.

## Authentication configuration and diagnostics

Configure a stable, separate `BETTER_AUTH_SECRET` of at least 32 characters for
Preview. Do not reuse or rotate the Production secret. Give Preview its own
`DATABASE_URL` for the confirmed Neon development branch above; a single Vercel
entry scoped to both Production and Preview shares the same credentials.
An operator must preserve the existing Production value/scope when separating
these entries. Redeploy the Preview after changing configuration; existing
deployments retain their environment snapshot. No repository command performs
these environment changes.

Keep automatic system variables enabled. Preview origin selection requires
`VERCEL_ENV`, `VERCEL_URL` and optionally `VERCEL_BRANCH_URL`; canonical Production
origin selection uses `VERCEL_PROJECT_PRODUCTION_URL`. The explicit Production
`BETTER_AUTH_URL` remains necessary for additional approved aliases. No arbitrary
Host, Origin or forwarded-header value becomes a trusted origin.

Operational logs use `server_error` with `SERVER_CONFIGURATION_INVALID`
(`variable` and `missing`/`invalid` reason), `DATABASE_ERROR` (an allowlisted
PostgreSQL code), or `UNEXPECTED_ERROR`. `auth_origin_rejected` identifies the
application's CSRF rejection without logging either origin or credentials.
Inspect the exact deployment's logs using the existing authenticated Vercel CLI.
The response stays generic; do not add raw exceptions, SQL, cookies, tokens,
email addresses, URLs or patient details to logs. Access remains limited to
authorized project operators under the project's existing Vercel log retention;
this change creates no additional log store or retention policy.

Missing configuration deliberately keeps authentication unavailable while
`/api/health` remains public. Resolve the named configuration problem before
testing login. Treat database codes `28P01` as a credential problem, `3D000` as
a missing database, `42P01`/`42703` as a schema mismatch and `42501` as insufficient
permissions; review the intended branch instead of resetting or migrating a
database automatically. Never replay test writes against Production.
