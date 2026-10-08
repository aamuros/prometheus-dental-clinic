# Dental records and treatment history

Patients now have a **Dental records and treatment history** link. Clinical
notes and completed treatments share the feature-owned `dental_records` schema,
distinguished by `kind`. Treatment history is the paginated, date-ordered list
of completed treatment entries; `dental_record_history` stores full revisions
of both types. This keeps one input, permission, and amendment path without
introducing treatment plans or odontograms.

## Access and validation

Every clinical endpoint requires a fresh Better Auth admin/staff session and a
current, non-banned dentist designation in the database. Administrator status
alone does not grant clinical access. Administrators manage designation through
the existing staff screen. Access is clinic-wide among designated dentists;
there is no patient-owner or multi-clinic permission model. Removing designation
or banning an account immediately denies clinical access to existing sessions.

Mutations require the configured same-origin `Origin`; bodies are capped at
32 KiB. Clinical notes are required for note entries, and procedures performed
are required for completed treatments. Diagnosis and additional notes/procedures
are optional. Dates must be valid calendar dates, no later than today's clinic
date in Asia/Manila. Tooth numbers are optional distinct FDI numbers: quadrants
1–4 with positions 1–8, and primary quadrants 5–8 with positions 1–5. Unknown
fields, forged audit authors, invalid IDs, control characters, invalid dates,
duplicate teeth, and oversized text are rejected on the server.

New records require an active patient and an available designated dentist.
Optional appointments must belong to the same patient and responsible dentist
and be scheduled or completed. Recording treatment does not alter scheduling
status. Existing history remains readable, and corrections remain possible,
after patient archival or removal of the responsible dentist's designation.
The patient and record type cannot be changed on an existing record.

## API

| Endpoint                                               | Behavior                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `GET /api/dental-records?patientId=…&kind=note&page=1` | Patient clinical notes; `kind=treatment` selects treatment history        |
| `POST /api/dental-records`                             | Create a note or completed treatment; returns 201                         |
| `GET /api/dental-records/:id?page=1`                   | Current record and paginated full revision history                        |
| `PUT /api/dental-records/:id`                          | Replace editable content using the required expected `version`            |
| `GET /api/dental-records/options?patientId=…`          | Available dentists and the patient's 50 most recent eligible appointments |

List and revision pages contain 50 entries, stable ordering, and explicit
`hasMore`. The UI exposes both pagination controls. Forms show the bounded
appointment selector, FDI help, responsible dentist, date, diagnosis, notes,
and procedures. Details show revision authors and dates, and expandable prior
content. Non-clinical users receive an access message without clinical content.
Archived patients have no new-entry controls.

## History and deletion protection

The server derives `createdBy` and `updatedBy` from the authenticated session.
The `audit_dental_record` PostgreSQL trigger inserts the full snapshot, version,
modifier ID, and timestamp atomically with each creation or correction. History
insert failures roll back the current write. The trigger protects record
identity, patient, type, creator, creation date, and monotonic revisions.
Conditional updates on the expected version return 409 when another clinician
has edited the record; the UI preserves unsaved form input.

The application exposes no deletion endpoint or revision mutation endpoint.
`DELETE /api/dental-records/:id` returns 405. Restrictive foreign keys prevent
removing records with history, linked patients, appointments, or referenced
accounts. A composite appointment/patient/dentist foreign key prevents
reassigning a linked appointment. Appointment deletion/reassignment returns a
safe 409 for both foreign-key and PostgreSQL restrict violations.

`drizzle/0003_premium_living_mummy.sql` creates the tables and trigger;
`0004_violet_beast.sql` creates the supporting unique constraint before its
composite foreign key. Drizzle Kit does not model the audit trigger: preserve
this reviewed SQL in later migration work. History is append-only through the
application; database operators still possess direct SQL privileges. The
operator-only synthetic cleanup helper is deliberately separate from the
Worker and guarded to the verified development endpoint and fixture run.

## Verification on 2026-10-09 (Asia/Manila)

Only Neon `development` (`br-polished-lab-b38jmw3l`) was used. Read-only Neon
metadata confirmed endpoint `ep-shy-flower-b3mjfmsi` belonged to that branch;
the helper validates branch context, URL/override agreement, direct migration
connection, and this endpoint before any SQL. Both migrations were applied to
development. All patient, account, appointment, and clinical fixtures were
synthetic; production SQL was not accessed.

Prerequisites passed before implementation: all 135 existing tests, both live
auth/database workerd harnesses, browser patient creation/reload and appointment
creation/reschedule/cancellation/reload, independent Neon persistence assertions,
and the full live scheduling harness (including simultaneous bookings,
permissions, validation, CSRF, and archive/timezone rules). No application
prerequisite blocker was found.

Feature verification:

- `pnpm check`: passed strict frontend/Worker/tooling TypeScript, zero-warning
  ESLint, formatting, all 179 tests in ten files, and both production bundles.
- `pnpm audit --audit-level=high`: passed; one existing moderate, development-only
  Drizzle Kit/esbuild advisory remains.
- `pnpm auth:verify` and `pnpm db:verify`: passed with the clinical schema.
- Browser: patient and completed appointment creation, note/treatment creation,
  diagnosis, FDI permanent/primary teeth, optional appointment link, reload
  persistence, a second dentist's correction, old snapshot inspection,
  non-clinical staff denial, anonymous redirect, and logout passed.
- The final production-preview browser check also passed an archived patient's
  treatment correction, reload persistence and original/new revisions, denial
  for a non-clinical administrator, and logout.
- `dental-records:smoke-data check`: independently confirmed content, tooth
  numbers, appointment link, creator/modifier IDs, and before/after snapshots
  in Neon.
- `dental-records:smoke-data verify`: passed against the built application in
  Cloudflare Vite production preview and Neon development. It verifies clinical
  CRUD, full history, simultaneous updates (one 200 and one 409), stale versions,
  audit-failure rollback, validation, malformed/oversized requests, CSRF,
  anonymous and non-clinical admin/staff denial, designation revocation and bans,
  archived-patient corrections, retained retired-dentist references, appointment
  integrity, and API/database deletion protection.

Failures encountered: sandboxed runtime/tsx sockets needed approved execution;
an exact-label browser locator needed replacement for a populated textarea;
repeat verification logins hit the unchanged rate limiter, so API fixture runs
supply synthetic test IP headers and browser checks respect its time window;
PostgreSQL `23001` restrict errors needed
the safe appointment 409 mapping. Wrangler's local proxy intermittently returned
500 with **Network connection lost**, including during stale/concurrent edits.
These requests did not reach the application's error handler. A fresh Wrangler
session also exhibited the issue; the full harness passed through Cloudflare
Vite production preview without retries. This is a local Wrangler verification
limitation, not evidence of hosted production behavior.

No commit or deployment was made. Hosted behavior, production credentials,
real patient data, and completion of the existing production security/backup
checklist remain unverified. No billing, prescriptions, plans, or advanced
odontogram UI were added.

## Repeat the development workflow

1. Run `pnpm check` and `pnpm audit --audit-level=high`.
2. Verify Neon endpoint metadata, then run
   `pnpm dental-records:smoke-data migrate` and `seed`.
3. Run the built application in local production preview at
   `http://127.0.0.1:4180`, configuring the local runtime's `BETTER_AUTH_URL` to
   that origin. Do not rebuild during verification. Credentials are only in
   ignored `.wrangler/dental-record-smoke.json`.
4. Log in as `clinical-smoke-<run>-dentist@example.test`; create
   `Synthetic Clinical Patient <run>` with email
   `clinical-patient-<run>@example.test`, birth date `1990-05-17`, and contact
   `09170000000`. Create a completed appointment on October 1, 2026, from
   09:00–10:00 Manila with `Synthetic dentist`.
5. Add `Browser original note <run>` dated `2026-10-01`. Record
   `Synthetic restoration <run>` with teeth `26, 51`, dated `2026-10-01`, linked
   to that appointment. Reload and inspect the records. As
   `clinical-smoke-<run>-second-dentist@example.test`, correct the note to
   `Browser corrected note <run>` and inspect both versions. Verify anonymous
   redirects and denial for the synthetic non-clinical staff/admin accounts.
6. Run `pnpm dental-records:smoke-data check`, then `verify`. The API harness
   intentionally archives its synthetic patient at the end. Archived clinical
   corrections can also be verified through the browser.
7. Always run `pnpm dental-records:smoke-data cleanup`, including after failures,
   and stop the browser/runtime. Cleanup removes only that run's synthetic
   revisions, records, appointments, patients, accounts, and cascading sessions.
