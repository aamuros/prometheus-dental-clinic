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

## Verification

Credential-free tests preserve the API and UI behavior described above. Use
`pnpm check` for CI checks, then the guarded Node/Neon procedure in
[verification](verification.md) for live integration checks. Synthetic fixtures
remain in ignored `.local/` and must be cleaned after the run. The smoke helpers
use the existing development project and reject other database endpoints.

Run `pnpm appointmentss:smoke-data seed`, then `verify` and `cleanup` against the
local preview or exact `VERIFY_BASE_URL`. No synthetic fixture routes are deployed.
