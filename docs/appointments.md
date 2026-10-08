# Appointment scheduling

Appointments reuse patient records and authenticated staff accounts. A dentist
is an existing admin/staff account with `isDentist=true`, independent of its
access role. Administrators can designate an existing account under `/staff`,
or select the dentist checkbox when creating an account. Removing designation
retains its appointment history and prevents new bookings/reschedules.

## Permissions and API

All routes require a fresh server-validated admin/staff session. Mutations require
an Origin matching `BETTER_AUTH_URL`, and bodies are limited to 8 KiB.

| Endpoint                                  | Access      | Behavior                                                                    |
| ----------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| `GET /api/appointments`                   | Admin/staff | List overlapping appointments in a clinic date range                        |
| `POST /api/appointments`                  | Admin/staff | Create an appointment; returns 201                                          |
| `GET /api/appointments/:id`               | Admin/staff | Read appointment with patient/dentist names                                 |
| `PUT /api/appointments/:id`               | Admin/staff | Replace editable fields, reschedule, or change status                       |
| `POST /api/appointments/:id/cancel`       | Admin/staff | Cancel while retaining the record; repeat cancellation preserves timestamps |
| `DELETE /api/appointments/:id`            | Admin       | Permanently delete; returns 204                                             |
| `GET /api/appointments/dentists`          | Admin/staff | List designated, non-banned dentists                                        |
| `GET /api/appointments/staff`             | Admin       | List staff IDs, names and dentist designations                              |
| `PUT /api/appointments/dentists/:staffId` | Admin       | Update only `{ isDentist: boolean }`                                        |

Appointment bodies contain `patientId`, `dentistId`, `startAt`, `endAt`, `status`,
and optional `notes`. Status is `scheduled`, `completed`, `cancelled`, or
`no-show`. Unknown fields, invalid IDs, invalid calendar dates/times, timestamps
without an explicit timezone, non-positive intervals, unsupported statuses,
and notes longer than 2,000 characters are rejected. Notes are plain text;
line breaks and tabs are accepted, other control characters are rejected.

Creation and rescheduling require an active patient and a designated, non-banned
dentist. Existing appointments remain readable after patient archival or dentist
removal. Their status/notes can be edited without moving the slot. Reopening a
cancelled appointment rechecks current eligibility and conflicts. Patient and
dentist foreign keys restrict permanent removal of referenced records.

## Conflicts and time

`drizzle/0002_premium_flatman.sql` adds the appointments table, staff dentist flag,
and PostgreSQL `btree_gist` extension. Its `appointments_dentist_overlap` exclusion
constraint prohibits overlapping half-open `tstzrange` intervals for the same
dentist on every non-cancelled appointment. It runs within the database, including
for concurrent inserts, reschedules, and reopening cancelled appointments.
Adjacent appointments are allowed; different dentists may book the same interval.
Completed/no-show history retains its slot; cancellation releases it. A conflict
returns a safe HTTP 409 without provider error details.

Drizzle Kit does not model exclusion constraints. The constraint is an explicit,
reviewed addition to the generated migration; preserve it in future migrations.
The Neon HTTP driver remains unchanged and needs no interactive transaction.

Appointment times and timestamps use `timestamptz`; the API serializes UTC ISO
instants. The form explicitly converts Asia/Manila input to UTC independently of
the browser timezone and preserves time precision when editing notes/status.
Schedule views format in `Asia/Manila` (UTC+08:00).

List parameters are `from` (inclusive clinic date), `to` (exclusive clinic date),
and `page`. The default is today in Manila. Ranges are limited to 31 days; each
page has 50 appointments with stable start/ID ordering and an explicit `hasMore`.
Filters include appointments crossing midnight by interval overlap. The UI has
date-filtered list and daily/weekly agenda views; weeks run Monday through Sunday.
All views expose pagination instead of silently hiding additional appointments.
The patient selector searches/paginates active patients and retains its selection.

## Development verification

The existing patient, authentication, and database paths were checked before
scheduling verification. Credential-free tests and the live `pnpm auth:verify`
and `pnpm db:verify` harnesses passed. A synthetic patient was created/edited in
the browser, reloaded, archived by an admin, independently checked in Neon,
and cleaned up. No prerequisite development blocker was found.

Only the linked Neon `development` branch (`br-polished-lab-b38jmw3l`) is used.
Neon endpoint metadata was checked against the local runtime/migration URLs.
The appointment fixture helper verifies development context and matching
credentials before migrating, seeding, querying, or cleaning up. The migration
was applied to development; production was not accessed for SQL.

Verified on 2026-10-08:

- `pnpm check`: strict frontend/Worker/tooling TypeScript, zero-warning ESLint,
  formatting, all 135 tests in eight files, and both production bundles passed.
- `pnpm audit --audit-level=high`: passed with no high/critical advisories.
  The existing moderate development-only Drizzle Kit/esbuild advisory remains.
- Both auth/database live workerd harnesses passed again with the new schema.
- The built app passed an isolated browser workflow: anonymous redirect,
  administrator dentist account creation and removal/redesignation on the same
  staff record, staff patient/appointment creation, reload persistence, explicit
  Manila times, date filters, daily/weekly views, rescheduling, conflict feedback
  with retained form input, all four statuses, cancellation confirmation and
  retained cancellation after reload, and logout.
- `appointments:smoke-data check` independently confirmed the browser-created
  patient, dentist flag, UTC reschedule, notes, cancellation and timestamps.
- `appointments:smoke-data verify` passed against the real built Worker and
  Neon development. Simultaneous bookings produced exactly one 201 and one 409,
  with only one row persisted. Simultaneous reschedules produced exactly one
  200 and one 409. Partial/contained/encompassing overlaps, adjacent bookings,
  different dentists, conflict on rescheduling/reopening, completed/no-show slot
  retention, idempotent cancellation and released slots all passed. The harness
  also verified archived-patient rules, removed/banned dentists, midnight
  filtering, server validation, anonymous/staff/admin permissions and CSRF.

Verification issues were resolved: generated migration metadata needed
formatting; the browser helper needed accessible combobox locators and waits for
logout/view transitions; and Wrangler's default log directory was outside the
execution sandbox. A final build with `WRANGLER_LOG_PATH=.wrangler/logs` and
`WRANGLER_SEND_METRICS=false` passed without that log error. No application check
remains failing. The synthetic fixtures and local browser/runtime were removed
after verification. No commit or deployment was made. Hosted production behavior
and real-data operation were not verified.

To repeat the synthetic smoke check:

1. Run `pnpm check` and `pnpm audit --audit-level=high`.
2. After verifying endpoint metadata, run `pnpm appointments:smoke-data migrate`.
   It invokes the existing Drizzle migrator with guarded direct development URLs.
3. Run `pnpm appointments:smoke-data seed`. Random fixture credentials are stored
   only in ignored `.wrangler/appointment-smoke.json`. Accounts use
   `appointment-smoke-<run>-admin@example.test` and
   `appointment-smoke-<run>-staff@example.test`.
4. Run the built app in local workerd on `127.0.0.1:4180`, overriding
   `BETTER_AUTH_URL` to `http://127.0.0.1:4180`. Do not rebuild during verification.
5. As admin, create/designate `Synthetic Dentist <run>` with email
   `appointment-smoke-<run>-dentist@example.test`. As staff, create
   `Synthetic Appointment Patient <run>` (birth date `1990-05-17`, contact
   `09170000000`, email `appointment-patient-<run>@example.test`). Book this
   dentist/patient for `2026-10-12 09:00–10:00` Manila with notes
   `Browser appointment <run>`. Reload, inspect list/day/week views and date
   filters, reschedule to `10:00–11:00`, try an overlapping booking, change
   statuses, and cancel with confirmation. Reload to confirm retention.
6. Run `pnpm appointments:smoke-data check` for independent Drizzle persistence
   assertions, then `pnpm appointments:smoke-data verify` for live HTTP/database
   scheduling, simultaneous bookings, overlap/reschedule/status conflicts,
   timezone boundaries, validation, permissions, CSRF, and archival behavior.
   The API verification intentionally archives its synthetic patient at the end.
7. Always run `pnpm appointments:smoke-data cleanup`, including after failures,
   and stop the browser and local runtime. Cleanup removes only the run's
   synthetic appointments/patient/accounts and their cascading auth sessions.

The helper is an operator script; there are no fixture or cleanup HTTP endpoints
in the application. Production deployment and real patient data remain outside
this verification. Complete the existing [production checklist](security.md)
before processing private clinic information. Treatments, billing,
notifications, account lifecycle management, and recurrence are outside this feature.
