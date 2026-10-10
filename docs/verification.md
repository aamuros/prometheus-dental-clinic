# Verification

## Credential-free checks

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm audit --audit-level=high
```

CI runs strict frontend/Node/tooling checks, lint, formatting, all unit tests and
the Vite build. API tests cover auth, staff permissions, patients, scheduling,
clinical records, revisions and safe errors. React tests cover the existing UI.
The emitted ESM test loads the API in plain Node, protecting the `.js` import fix.
Tests do not require credentials or external services.

## Live Node and Neon

Reuse the existing development database, never production. `.neon` must select
`muddy-boat-93080753` / `development`, and `.env.local` must contain the matching
pooled/direct URLs, `NEON_BRANCH=development` and local auth secret. Synthetic
helpers reject conflicting environment values and verify the known endpoint
before SQL. No migrations or resets are needed for this migration.

```sh
pnpm db:verify
pnpm auth:verify
BETTER_AUTH_URL=http://127.0.0.1:4180 pnpm preview
```

The database harness verifies credential mismatch rejection, SELECT, shared
batch transaction, failure recovery and unsupported interactive transactions.
The auth harness verifies real adapter/session/rate-limit behavior. Both launch
and stop Node test servers; test routes are absent from deployed code.

`pnpm workflows:verify` orchestrates synthetic accounts and API patient setup,
runs the retained scheduling/clinical verifiers, and cleans fixtures in `finally`.
It waits one minute before preview logins and between suites to preserve the
real client IP login rate limit during repeated runs.
For interactive browser checks, use feature smoke tools to seed synthetic staff, dentists and patients; run
`verify` for appointments and clinical records, then `cleanup` for each run.
Fixtures and random credentials live in ignored `.local/`, mode 600. The
appointment verifier checks concurrent overlap rejection and scheduling rules;
the clinical verifier checks immutable full history, versions and permissions.
See the feature docs for the retained business rules. Cleanup is scoped to each
synthetic run; do not remove real records or prior clinical history.

## Vercel preview

Confirm the team/project, non-main branch and development database before testing.
Protected previews require the authenticated Vercel CLI or an origin-scoped local
OIDC header; never disable protection. `VERIFY_BASE_URL` selects an exact HTTPS
preview origin for feature smoke requests. Never put bypass credentials in source
or command arguments; supply them through a protected process environment.

Verify health 200 JSON, protected APIs 401, login and secure cookies, staff and
clinical permissions, patient create/edit/archive, appointments and concurrent
conflicts, clinical create/edit and persisted revisions, CSRF rejection and
rate limiting. Check unknown APIs return safe JSON and API headers remain uncached.
In a browser, navigate directly and through TanStack routes, reload, inspect
static assets and confirm logout revokes the session.

Privately scan `dist/client` and downloaded assets for actual database URLs,
passwords and auth secrets, printing only pass/fail. Logs must contain only
method/status/duration and never private exception or request data. Record exact
commands, preview URL, database identity, cleanup and any unverified steps in
[the migration record](vercel-migration.md). Production validation/release is a
separately authorized operation.
