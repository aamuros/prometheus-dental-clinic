# Staff account lifecycle

This backend milestone adds administrator account management to the existing
Better Auth 1.7.7, Hono, Drizzle and Neon HTTP integration. It adds no dependency
and no deletion endpoint. Existing account creation and role/dentist rules remain
unchanged. The `/staff` administrator screen includes server-backed account
pagination, status, lifecycle actions and assisted recovery alongside account
creation and dentist designation. All authenticated accounts can use
`/change-password`.

## API contracts

All routes require a current database session. All POST requests require an exact
configured `Origin`, JSON bodies of at most 8 KiB, and validated allowlisted
fields. Administrative routes also enforce the current administrator role.

| Method and route                       | Access          | Body / response                                          |
| -------------------------------------- | --------------- | -------------------------------------------------------- |
| `GET /api/staff?page=1`                | Administrator   | `{ accounts, page, hasMore }`, 50 per page               |
| `POST /api/staff/:id/deactivate`       | Administrator   | `{}` / `{ success: true }`                               |
| `POST /api/staff/:id/reactivate`       | Administrator   | `{}` / `{ success: true }`                               |
| `POST /api/staff/:id/revoke-sessions`  | Administrator   | `{}` / `{ success: true }`                               |
| `POST /api/staff/:id/recover-password` | Administrator   | `{ currentPassword, newPassword }` / `{ success: true }` |
| `POST /api/staff/password`             | Current account | `{ currentPassword, newPassword }` / `{ success: true }` |

Listing exposes only ID, name, email, role, active status, dentist designation and
whether a password change is required. It includes deactivated staff. Responses
and audit rows contain no passwords, hashes, session tokens, IP addresses or
private notes. Existing login/session JSON also omits bearer tokens; authentication
continues through HttpOnly cookies. Responses remain uncached.

Invalid inputs return 400; missing sessions return 401; insufficient access or
untrusted origins return 403; missing target accounts return 404; last-admin or
concurrent-credential conflicts return 409. Unexpected failures use the existing
sanitized 500 envelope. Password verification/change/recovery attempts share a
persistent per-actor limit of five per minute, returning 429 and `Retry-After`.
Passwords must be 12–128 characters; a self-service change must replace the old
password with a different one. Self-service calls cannot choose another account.

## Deactivation and recovery

Deactivation sets the existing permanent ban flag and deletes the account's
sessions atomically. Every application request checks current database state;
old cookies lose access after commit, and login is denied while deactivated.
Reactivation clears the ban and its metadata, without restoring any session or
clearing a required password change. The staff member must log in again.

For assisted recovery, the administrator must first verify the employee's identity
through the clinic's trusted process. `currentPassword` is the administrator's
own password; `newPassword` is a strong temporary employee password, supplied
in the request and never returned. Share it through a trusted private channel,
outside application logs. Do not put credentials in command arguments or PRs.
An administrator recovering their own account must instead use self-service
password change; recovery requires another authorized administrator.

Recovery replaces the credential, marks `passwordChangeRequired`, revokes all
employee sessions and records the action in one transaction. The employee logs
in with the temporary password, then must use `/api/staff/password` before any
clinical or administrative API. `/api/session` remains available to report
`user.passwordChangeRequired: true`; logout and password change remain available.
Password change clears the flag, revokes **all** sessions including the current
one, and requires login with the new password. Temporary passwords are restricted
credentials, not time-limited email reset tokens; no public recovery endpoint or
email service is enabled by this milestone.

## Atomicity, concurrency and clinical history

`server/features/staff/queries.ts` uses a Neon HTTP batch transaction, rather than
an unsupported interactive callback. A first statement takes a
`SHARE ROW EXCLUSIVE` lock on `auth_user`. The second statement gets a fresh
READ COMMITTED snapshot after waiting for that lock and rechecks the actor's
current session, ban, role and password-change restriction. It rejects disabling
the last administrator with unrestricted access. For password writes, it compares
the actor's stored credential with the hash verified before the transaction;
stale verification cannot overwrite a newer password. Concurrent administrative
changes are serialized. The lock is held only for the small mutation transaction;
normal account reads continue.

The successful account mutation, credential update where applicable, session
deletion and `staff_audit` insert commit or roll back together. Successful lifecycle
actions record only actor ID, target ID, action, timestamp and an audit ID.
Existing account creation is outside this lifecycle audit scope. Audit records
have restrictive staff foreign keys and no public mutation API. Operators still
need to define retention, access and monitoring policies before production use.

Staff accounts retain their IDs and clinical references. Appointments, dental
records and revision history continue to point to the same staff. Their existing
restrictive foreign keys remain intact; this feature never deletes users.

## Migration and verification

`drizzle/0005_calm_fenris.sql` adds the required-password-change flag and audit
table. Apply reviewed migrations separately as an operator. No production
migration or settings change was performed for this milestone.

Credential-free route tests use `tests/staff.test.ts`; Better Auth integration
tests use `tests/auth.test.ts`. Run them with:

```sh
pnpm exec vitest run tests/staff.test.ts tests/auth.test.ts
```

The guarded live harness accepts only an explicitly supplied, expiring child of
development (`br-red-sun-b3nj2cwd`) in project `muddy-boat-93080753`, named
`dev-staff-lifecycle-*`. It independently checks branch metadata and matches the
connection host through the authenticated Neon CLI **before any SQL**. Supply
`STAFF_VERIFY_BRANCH_ID` and `STAFF_VERIFY_DATABASE_URL` in a private process
environment, then run:

```sh
node --import tsx scripts/verify-staff-lifecycle.ts
```

The harness applies pending migrations only to that isolated branch and exercises
real Hono/Better Auth requests with Neon-backed sessions. It creates synthetic
staff and clinical records, tests deactivation/reactivation, revocation, password
change/recovery, concurrent changes, last-admin lockout, failed-audit rollback,
safe responses and clinical-reference preservation. To test exactly two admins,
it temporarily bans inherited accounts only in the disposable clone, restoring
their flags in `finally`. It removes its synthetic clinical records, accounts and
audit rows afterward. It starts no dev server and needs no browser or production
credential. Never use it on the shared development or production branch.

Verified on 2026-10-10 against isolated branch `br-fancy-art-b3d1difk`
(`dev-staff-lifecycle-verification`, expires 2026-10-13): migration and all live
checks passed, including concurrent deactivation leaving exactly one active
administrator and concurrent password changes allowing exactly one write.

## Frontend behavior

Staff management uses the existing TanStack route guard and server-backed page
search (`/staff?page=2`). Account actions require an inline, keyboard-accessible
confirmation; Escape or Cancel dismisses it. Self-recovery is excluded: use
Change password for your own account. Recovery requires confirmation that the
employee’s identity was verified, the acting administrator’s password, and a
confirmed temporary password. Before confirming recovery, administrators must
prepare that password in a clinic-approved private channel or securely communicate
it to the verified employee, then acknowledge preparation. Editing either
temporary-password input clears that acknowledgement. Success clears the inputs;
the password cannot be retrieved from the application afterward. Account status
and password-change flags refresh after successful actions; account creation and dentist designation remain
available on the same page.

The protected parent route fetches `/api/session`, validates and preserves the
optional boolean `passwordChangeRequired`, and redirects restricted accounts to
`/change-password` before business loaders run. The restricted layout exposes
only password change and logout. A malformed flag fails closed. Password
replacement verifies the current password on the server, clears form inputs on
success, and replaces the current route with `/login?passwordChanged=true`.
The query contains only a success indicator, never credentials. All sessions are
revoked by the backend, so the employee must log in again with the new password.

Passwords stay in password inputs and the mutation request; they are not copied
to application state, browser storage, URLs, logs or analytics. The UI validates
confirmation, length (12–128 characters), and a different self-service password;
server validation, permissions, session checks and persistent rate limits remain
authoritative. Safe errors distinguish invalid current passwords, denied access,
conflicts and rate limits (using a bounded numeric `Retry-After`). A 401 returns
the user to login. Submit guards and disabled controls prevent duplicate requests.

## UI integration readiness and operator prerequisites

Read-only schema checks on 2026-10-11 in project `muddy-boat-93080753`, database
`prometheus_dental_clinic`, found:

| Branch                                                                                                  | Migration 0005 schema                                      |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Development (`br-red-sun-b3nj2cwd`)                                                                     | Missing flag, audit table, index and constraints           |
| Existing preview database (`br-broad-math-b3cer5eo`, `preview-auth-verification`)                       | Missing flag, audit table, index and constraints           |
| Isolated verification (`br-fancy-art-b3d1difk`, `dev-staff-lifecycle-verification`, expires 2026-10-13) | Flag, audit table, index and all three constraints present |

No development, existing preview or production migration was applied for this UI
work. The guarded harness passed again on the compatible isolated branch,
including password recovery/change, revocation, concurrency, rollback and clinical
references. That initial verification covered live backend contracts and
Vitest/React Testing Library UI tests with a controlled transport. The recovery
review adds real local browser verification described below; a deployed Vercel
preview smoke test remains unperformed. The actual Vercel Preview environment’s branch
selection still needs operator confirmation; the table identifies checked Neon
branches, not an assertion about remote environment-variable values.

Before authenticated local or deployed preview verification, an operator should:

1. Confirm the runtime database belongs to the intended development/preview
   branch, never production, and review `drizzle/0005_calm_fenris.sql`. It adds
   `auth_user.password_change_required` (non-null boolean, default false),
   `staff_audit`, two restrictive foreign keys, an action check and a target/date
   index. It does not modify existing account credentials or clinical rows.
2. Supply that branch’s **direct** connection as `DATABASE_URL_UNPOOLED` in a
   private operator process environment, confirm no conflicting `.env` values,
   and run the existing migration command below. Drizzle records pending
   migrations; do not manually rerun individual SQL files.
3. Recheck schema compatibility. Keep the pooled `DATABASE_URL` and a separate
   `BETTER_AUTH_SECRET` scoped to development/Preview. Retain the existing exact
   origin handling and deployment protection from [deployment](deployment.md).
   Do not change Production variables or expose secrets through `VITE_*`.
4. Only then verify login, `/staff` pagination/actions, restricted recovery login,
   password replacement, fresh login and logout using synthetic accounts. Follow
   [verification](verification.md) for a deployed preview. Define identity
   verification, private password delivery and audit access/retention procedures
   before clinic use.

Operator-reviewed migration (credentials supplied privately, not in arguments):

```sh
pnpm db:migrate
```

For the existing disposable verification branch only, privately provide
`STAFF_VERIFY_BRANCH_ID` and `STAFF_VERIFY_DATABASE_URL`, then run:

```sh
node --import tsx scripts/verify-staff-lifecycle.ts
```

The harness independently checks Neon branch metadata and host identity before
SQL, applies any pending migrations only to that disposable clone, and removes
synthetic data afterward. Do not substitute the shared development, preview or
production branch. Recheck branch existence/expiry before reuse.

### Recovery review: live frontend verification

On 2026-10-11, the built frontend was verified in real Chromium administrator
and employee contexts against the existing local Node preview server at
`http://127.0.0.1:4180` and isolated Neon branch `br-fancy-art-b3d1difk`.
Before SQL or fixture setup, branch metadata was checked for the development
parent, non-default/unprotected status and future expiry, and the connection was
obtained for that exact branch. Read-only checks confirmed the migration 0005
flag (including its non-null/default-false definition), audit table, index and
all three constraints. No migration was needed or applied.

The browser exercised real Hono/Better Auth/Neon requests for administrator and
employee login, administrator-only management, account creation, dentist
assignment, pagination, deactivation/reactivation, session revocation, recovery
with required credential preparation, acknowledgement reset on password edits,
mandatory password-change navigation, password replacement, fresh login and
logout. Database checks confirmed session deletion and the recovery flag's
transition. Restricted visits to patients, staff and appointments made no
business API requests. The local login rate limit remained enabled; the frontend
showed 429 feedback and the driver honored the server's `Retry-After` before
retrying.

Synthetic credentials were generated only in verification-process memory and
filled directly into password inputs. No traces, screenshots, saved browser
state, request-body artifacts or credential files were created. Checks found no
credentials in browser/server logs, URLs, storage or the completed UI. Synthetic
accounts, their sessions, credentials and lifecycle audits were removed afterward,
and browser contexts and the local server were closed. No inherited account,
shared development/preview database or production setting/data was modified.

`pnpm check` passed all checks, including 290 tests (four new preparation
regressions), and `pnpm audit --audit-level=high` passed with the existing moderate
transitive esbuild advisory. This is local built-frontend verification, not a
claim about the deployed Vercel Preview's environment configuration. Confirm its
actual database identity and migration readiness before deployed verification;
the earlier development/preview schema table is dated evidence, not a fresh
check of those shared environments.
