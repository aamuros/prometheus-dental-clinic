# Patient management

Patient management adds name, birth date, contact number, optional email,
creation/update timestamps, and an archive timestamp. Existing styling and the
code-based TanStack router are retained; staff navigation links to `/patients`.

## Permissions and API

All patient endpoints require a current server-validated admin/staff session.
Both roles may list, view, create, and edit active patients. Only administrators
may archive. These are clinic-wide records in this single application; there is
no per-user ownership or organization layer.

| Endpoint                         | Access      | Behavior                                                                               |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `GET /api/patients`              | Admin/staff | Active patients by default; `q`, `page`, and `status=active\|archived` select the list |
| `POST /api/patients`             | Admin/staff | Create a patient; returns 201                                                          |
| `GET /api/patients/:id`          | Admin/staff | View active or archived details                                                        |
| `PUT /api/patients/:id`          | Admin/staff | Replace editable fields on an active patient                                           |
| `POST /api/patients/:id/archive` | Admin       | Archive without deleting; repeated requests preserve the original archive timestamp    |

There is no permanent-delete API. Archived records remain readable, are excluded
from the active list, and cannot be edited (409). The UI asks for confirmation
before archiving and provides an archived-list filter. Restoring archived records
is outside this feature.

Create/update bodies contain `name`, `birthDate` (`YYYY-MM-DD`), `contactNumber`,
and optional `email` (missing, null, or blank becomes null). The server rejects
unexpected fields, invalid IDs/JSON/calendar dates, future birth dates, control
characters, invalid email, and contact numbers outside 7–15 digits. Names are
limited to 200 characters, contact numbers to 30 including formatting, and email
to 254. Phone formatting allows an optional leading `+`, spaces, parentheses,
and hyphens. Mutation bodies are limited to 8 KiB.

The birth-date maximum uses the current clinic date in Asia/Manila on both
the server and the form, including the hours before UTC reaches that date.

Writes require `Origin` to match `BETTER_AUTH_URL`; UI visibility does not grant
permission. Responses remain uncached, errors safe, and logs omit patient fields
and search strings. Drizzle binds query values; search treats `%`, `_`, and
backslashes literally. Lists return at most 50 rows and `hasMore`, with stable
name/ID ordering and bounded page/search parameters. Updates and archiving check
active status in the database mutation itself.

## Organization

- `worker/features/patients/`: table, input validation, Drizzle queries and Hono routes.
- `src/features/patients/`: API contract checks, list, details and shared add/edit form.
- `shared/patients.ts`: runtime-independent input/response types.
- `src/routes/patient*.tsx`: protected routing and loader composition.
- `drizzle/0001_dazzling_eternals.sql`: patients table, constraints and partial active-name index.
- `tests/patients.test.ts` and `tests/patients-ui.test.tsx`: validation, CRUD, roles, origins, archive rules and UI interactions.

## Development verification — 2026-10-08

Before implementation, `pnpm auth:verify` and `pnpm db:verify` passed in local
workerd against development. Authentication, server authorization, Neon HTTP
queries, batch transactions and recovery were working; there were no development
blockers. Neon API endpoint metadata and local credential checks confirmed the
linked development branch before applying the reviewed patient migration.

`pnpm check` passed all strict typechecks, ESLint, formatting, 75 tests in six
files, and production builds. `pnpm audit --audit-level=high` passed with no high
or critical advisories; the known moderate development-only Drizzle Kit/esbuild
advisory remains documented in [authentication](authentication.md).

The built Worker and static assets ran locally on port 4180 with the auth origin
overridden for that port. An isolated Playwright browser exercised:

- Anonymous patient navigation redirecting to login.
- Staff login, empty patient list, add patient, details, search, edit and reload.
- Edited values surviving reload and search.
- No staff archive control and a real API archive rejection (403).
- Invalid birth-date rejection (400), literal wildcard search, and cross-origin rejection (403).
- Administrator login, archive confirmation, readable archived details, archived-list inclusion and active-list exclusion.
- Archived edit rejection (409), permanent-delete rejection (405), unchanged timestamp on repeated archive, and patient API denial after logout (401).

An independent Drizzle query confirmed the exact browser-created synthetic
record, edited phone number, retained archive timestamp, and timestamps in Neon.
Cleanup removed the synthetic patient and temporary admin/staff accounts with
cascading auth sessions/accounts. The isolated browser and test runtime were
stopped. No production database writes, commits or deployment occurred.

To repeat the workflow, build first, then run `pnpm patients:smoke-data seed`.
The helper verifies development context and credential consistency and stores
random fixture credentials only in ignored `.wrangler/patient-smoke.json`.
Run the built app in local workerd on port 4180 with
`--var BETTER_AUTH_URL:http://127.0.0.1:4180`; use the synthetic accounts from that
file to exercise the workflow. Account emails are
`patient-smoke-<run>-staff@example.test` and
`patient-smoke-<run>-admin@example.test`. Add a patient named
`Synthetic Patient <run>`, birth date `1990-05-17`, contact `09170000000`, and
email `patient-<run>@example.test`. Edit the contact to `09171111111` and archive
the record as the administrator. Run
`pnpm patients:smoke-data check` to assert persisted results and
`pnpm patients:smoke-data cleanup` afterward, including after a failed workflow.
Do not rebuild while verification is running, since asset updates reload workerd.
The helper is an operator script; there is no fixture or cleanup HTTP endpoint.

Only synthetic data was used. Before real patient data or production use,
complete the existing [production security checklist](security.md), including
least-privilege database credentials, account lifecycle controls, backups/restore,
logging retention and deployment access controls. No new external service or
OAuth credentials are required by this feature.
