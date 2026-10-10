# Staff account lifecycle

This backend milestone adds administrator account management to the existing
Better Auth 1.7.7, Hono, Drizzle and Neon HTTP integration. It adds no dependency
and no deletion endpoint. Existing account creation and role/dentist rules remain
unchanged. Management screens and a password-change screen are a later UI milestone.

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
