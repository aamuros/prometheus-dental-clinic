# Dental clinic stabilization review

Reviewed on 2026-10-09 (Asia/Manila). Authentication, patients, appointments,
and basic clinical notes/treatment history are implemented. Two confirmed bugs
were reproduced with failing regression tests and fixed with three small
application changes. No dependencies, schema, UI design, production data, or
remote settings were changed.

## Confirmed issues fixed

### S1 — High: banned accounts retained access through existing sessions

Impact: a banned administrator or staff account could continue reading or
changing patient and scheduling data, and a banned administrator could create
accounts until the existing session expired or was explicitly revoked.

Better Auth's admin plugin checks bans when creating a session, while the
application middleware previously checked only the current role. Clinical
routes already checked the ban flag separately, but the other application APIs
lacked that check. `worker/features/auth/middleware.ts:19` now rejects the current
user's ban flag on every protected request. Logout remains available.

Regression tests use the real Better Auth configuration and memory adapter:
log in, set the synthetic account's ban flag, reuse its cookie against protected
reads and writes, check administrator account creation denial, then log out and
verify the session is revoked. Both admin and staff cases failed before the fix.

### S2 — Medium: birth-date validation used UTC instead of the clinic date

Between midnight and 07:59 in Manila, the server and form incorrectly rejected
the current clinic date as a future birth date. The server comparison at
`worker/features/patients/validation.ts:43` and form maximum at
`src/features/patients/patient-form.tsx:79` now use the existing `clinicDate()`
helper. Regression tests cover the Manila midnight boundary, reject tomorrow,
and assert the rendered date input's maximum.

## Synthetic workflow and permission coverage

The existing credential-free suite covers the main flows. This review also adds
regressions for designated-dentist account creation without administrator rights,
revoked clinical access clearing displayed content and unsaved input, and
archived clinical corrections retaining an older appointment link.

| Workflow       | Verified in credential-free tests                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication | Hashed passwords, secure cookie attributes, login, forged/expired session rejection, current roles, banned existing sessions, logout, administrator account creation, signup/unused endpoint denial, CSRF, safe errors, and rate limiting.                                                 |
| Patients       | Admin/staff create/search/read/update, admin-only archive confirmation, retained archived records, archived edit denial, validation/body limits, pagination inputs, safe errors, and Manila-date boundaries.                                                                               |
| Appointments   | Admin/staff booking/rescheduling/cancellation, four statuses, admin-only designation/deletion, anonymous and role denial, conflict/restrict-error mapping, validation/CSRF, Manila UTC conversion, midnight/week views, and preservation of sub-minute times.                              |
| Dental records | Designated clinical access, non-clinical admin/staff denial, session-derived authors, notes/treatment forms, FDI validation, revisions, stale-version feedback retaining input, access revocation, retained archived/older-linked corrections, body limits/CSRF, and no deletion endpoint. |

Authentication tests exercise Better Auth against its memory adapter. Feature
API tests mock persistence queries; React tests use jsdom and synthetic fetch
responses. These verify application orchestration, validation, permissions, and
UI interactions, but cannot prove PostgreSQL constraints, trigger atomicity,
real concurrent writes, or workerd/hosted runtime behavior. The schema and
queries were reviewed locally. Earlier live verification is documented in each
feature's notes and was not repeated here.

## Remaining security and functional gaps

- **Release blockers:** the existing production checklist remains incomplete,
  including account removal/admin session revocation, password recovery/change,
  deployment access controls, least-privilege database access, monitoring,
  retention, and tested backup restoration. No current production configuration
  was inspected or changed. Patient/clinical read-access auditing is absent.
- **Concurrent demographic/scheduling edits:** patient and appointment updates
  have no expected version, so overlapping edits can overwrite each other.
  Appointment exclusion constraints prevent dentist time conflicts; clinical
  amendments already use conditional version updates. This limitation is now
  explicit in the roadmap, without adding a new concurrency contract here.
- **Incomplete planned scope:** consent/additional patient identifiers, separate
  receptionist roles, dentist availability/recurrence/notifications, structured
  medical history, advanced charting, treatment plans, prescriptions,
  attachments, and billing are not implemented. These are remaining features,
  not regressions to address by expanding this stabilization change.
- **Bounded clinical selector:** only the 50 most recent eligible appointments
  can be newly selected. Older existing links remain available during correction.
- **Dependency audit:** the high/critical threshold passes, with one moderate
  advisory remaining. No dependency changes were made.

## Checks and external verification

- Targeted frontend/Worker/tooling typecheck and the four changed test files
  passed after the two fixes (67 tests at that point).
- `pnpm audit --audit-level=high` passed; one moderate advisory remains.
- Full `pnpm check` passed: strict frontend/Worker/tooling TypeScript,
  zero-warning lint, formatting, all 186 tests in ten files, and both production
  bundles. Wrangler logs were directed to the ignored local `.wrangler/logs`
  directory and telemetry was disabled for the check.
- `pnpm auth:verify` and `pnpm db:verify` require matching development Neon
  credentials in `.neon`, `.env.local`, and `.dev.vars`, access to Neon, and a
  local workerd runtime. Feature smoke helpers likewise require a verified
  development endpoint, synthetic fixture setup/cleanup, and a local application
  runtime. They were not run during this review; no database SQL was executed.
- Browser/E2E and hosted production behavior were not verified. No local server,
  deployment, production-data access, or new E2E tooling was used.

See the updated [roadmap](roadmap.md) for completed versus remaining work and the
[production checklist](security.md) for release requirements.

## Main stabilization verification

Rechecked on 2026-10-10 (Asia/Manila). `pnpm check` passed, including strict
TypeScript, lint, formatting, all 188 tests in eleven files, and the Cloudflare
Worker/client production build. `pnpm audit --audit-level=high` passed with one
moderate advisory. The configured Node 24.19.0 and pnpm 12.10.1 versions were
used. Database, browser, and hosted runtime checks were not repeated; the release
requirements above still apply.
