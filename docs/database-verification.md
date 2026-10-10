# Neon database verification

## Current development database — 2026-10-10

The application now uses the existing `prometheus-dental-clinic-development`
project (`muddy-boat-93080753`) in organization `org-solitary-paper-36906181`,
branch `development` (`br-red-sun-b3nj2cwd`), database `prometheus_dental_clinic`.
Neon CLI metadata confirmed PostgreSQL 18 and region `aws-ap-southeast-1`.
No project, branch, managed authentication service, or production connection
was created for this setup.

The authenticated CLI linked `.neon` and pulled database credentials into
`.env.local`. Both pooled and direct credentials were compared privately with
CLI connection strings for the explicit project, branch, database, and role.
SQL confirmed the database identity and absence of application/migration tables
before `pnpm db:migrate` applied all five committed migrations unchanged.

The pooled runtime URL in `.dev.vars` matches `.env.local`; the direct URL stays
in `.env.local` for migration tooling. `.env` is absent and no database/auth
process overrides are set. A new random local auth secret and origin
`http://127.0.0.1:5173` are configured in `.dev.vars`. Secret files have mode `600`
and remain ignored; no secret values appear in this report.

Post-migration SQL and Drizzle checks confirmed all nine application tables and
their columns match the existing schema. All five migration ledger hashes and
timestamps match the committed SQL/journal. The `btree_gist` extension,
appointment overlap exclusion constraint, composite clinical foreign key, and
`dental_records_audit` trigger exist. Tables created:

- `auth_user`, `auth_account`, `auth_session`, `auth_verification`, `auth_rate_limit`
- `patients`, `appointments`, `dental_records`, `dental_record_history`
- `drizzle.__drizzle_migrations` (migration ledger)

Verification passed with Node 24.19.0 and pnpm 12.10.1:

- `pnpm check`: typechecks, lint, formatting, 189 tests in 12 files, and
  `pnpm build` for the client and Worker.
- `pnpm db:verify`: matching development bindings, SQL queries, HTTP batch
  transactions, failure recovery, and expected interactive transaction rejection.
- `pnpm auth:verify`: real Better Auth/Drizzle login, sessions, permissions,
  administrator account creation, CSRF, expiration, logout, and database-backed
  rate limits using temporary synthetic accounts.
- `pnpm dev --port 5173 --strictPort`: local startup, health, login HTML, and
  unauthorized session responses at `http://127.0.0.1:5173`; the server was stopped
  after verification. This was an HTTP smoke check, not browser E2E testing.
- A private scan of `dist/client` found none of the local URLs, database password,
  or auth secret in browser output. The Worker build's local secret file remains
  inside ignored `dist/`.
- A final Drizzle query confirmed all nine application tables contain no records
  after fixture cleanup. No permanent administrator was provisioned.
- `pnpm audit --audit-level=high`: exit code 0, no high/critical findings; the
  existing moderate Drizzle Kit development-tooling advisory described in
  [authentication](authentication.md#external-configuration) remains.

Only ignored local configuration and setup/verification documentation changed.
Application code, schema definitions, committed migrations, authentication,
Cloudflare configuration, and the Vercel adapter were preserved. No deployment
was performed. Run `pnpm dev` to start locally; staff login requires a separately
authorized initial account bootstrap as described in the authentication guide.

The earlier record below describes the previous project and historical fixture
tests; it is not the current local connection configuration.

## Historical foundation verification — 2026-10-08

Verified on 2026-10-08 with Node 24.19.0, pnpm 12.10.1, Wrangler 4.148.0,
Neon serverless driver 1.2.0, Drizzle ORM 0.45.4, and Drizzle Kit 0.31.11.

## Development context and credentials

- Project: `green-bar-82369299` (`prometheus-dental-clinic`).
- Created schema-only `development` branch `br-polished-lab-b38jmw3l`, avoiding
  copies of production rows. Production was not used for SQL or migration tests.
- Checked out development and refreshed ignored `.env.local`. Both URLs were
  checked against the development endpoint returned by Neon; the runtime URL is
  pooled, the migration URL is direct, and both identify the same database.
- `.neon` and `.env.local` remain ignored; `.env.local` has permissions `600`.
  No `.env`, `.dev.vars`, or process database credentials override these values.

## Local Workers runtime

`pnpm build` followed by `pnpm db:verify` repeats the runtime test. It requires
network access and localhost port `8789`. The test uses the application's Hono
app, database factory, Wrangler configuration, and native workerd runtime. It
adds a route only in `tests/runtime/database-worker.ts`, never in the application's
entry point. No browser tooling or Cloudflare deployment is involved.

Passed checks:

- Application health route responds from the local Worker.
- A credential mismatch returns 400 before database queries.
- Hono's actual `DATABASE_URL` binding matches the selected development URL;
  the URL and its fingerprint are never returned or logged.
- Drizzle executes `SELECT 1` and returns `1`.
- `db.batch()` returns both expected results with the same PostgreSQL transaction ID.
- An intentionally failing batch is rejected; the next query succeeds.
- Interactive `db.transaction()` is rejected with the adapter's expected unsupported error.

The HTTP driver works without `nodejs_compat` or Hyperdrive. Batched HTTP
transactions are supported; interactive transactions, persistent sessions, and
session-level operations require a different connection strategy. Do not treat
`db.transaction()` as available simply because it appears in the TypeScript API.

## Disposable migration test

Created an expiring child of development, `development-migration-check-20261008`
(`br-hidden-darkness-b3y8yjpq`). Only its credentials were used for migration
testing. An ignored fixture configuration extended the application's
`drizzle.config.ts`, changing only schema and output paths under `output/`.
Drizzle Kit used its Neon WebSocket driver in Node with a direct connection.

Passed checks:

- Generated and applied a migration for a synthetic fixture table.
- Reapplied migrations without duplicate ledger entries or schema errors.
- Generated and applied an additional column with a default; the synthetic row
  was preserved and received the default. The migration ledger contained two entries.
- An intentionally invalid third migration exited with code `1`, rolled back
  its table creation, and did not advance the ledger. Kit's captured output did
  not include the provider's error text; the exit code and database state were checked.
- Deleted the disposable branch after verification, removing its fixture table
  and migration ledger. Development contains neither fixture table nor the ledger.

The application schema remains empty. No permanent application tables, business
routes, authentication, or UI changes were introduced. For future schema changes,
generate and review migrations, then test on a new disposable development child
before applying them to the intended environment.

## Readiness

The integration is ready for development using individual queries and batch
transactions. Live runtime tests remain separate from the credential-free
`pnpm check`; neither check deploys Cloudflare or migrates production.
