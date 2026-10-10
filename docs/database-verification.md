# Neon database verification

The existing project `muddy-boat-93080753`, branch `br-red-sun-b3nj2cwd`
(`development`), database `prometheus_dental_clinic` in `aws-ap-southeast-1`
was initialized before the runtime migration. It contains nine application/auth
tables and five recorded Drizzle migrations:

- `auth_user`, `auth_account`, `auth_session`, `auth_verification`, `auth_rate_limit`
- `patients`, `appointments`, `dental_records`, `dental_record_history`
- `drizzle.__drizzle_migrations` (separate migration ledger)

The reviewed migrations install `btree_gist`, the dentist-overlap exclusion
constraint, restrictive clinical foreign keys and the atomic clinical audit
trigger. The runtime migration changes none of these SQL files or schema rules
and does not run migrations, reset tables or create another Neon project.

`.env.local` contains pooled runtime and direct migration URLs for the same
development database. The direct URL is used only by operator tooling. Local
scripts load `.env.local`, optional `.env`, then process overrides; guarded
verification rejects mismatches before SQL. Never print credentials.

`pnpm db:verify` runs a test-only Node Hono entry, checks the expected credential
fingerprint before any query and verifies SELECT, shared HTTP batch transactions,
failure recovery and the expected rejection of interactive transactions.
`pnpm auth:verify` verifies Better Auth against the real Drizzle adapter with
synthetic accounts and cleanup. These checks are separate from credential-free
CI and do not add application endpoints.

Current results are recorded in [the migration record](vercel-migration.md).
Use [verification](verification.md) to repeat the checks and review constraints
and migration hashes before any deliberate schema change.
