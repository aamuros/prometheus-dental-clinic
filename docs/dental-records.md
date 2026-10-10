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
application and guarded to the verified development endpoint and fixture run.

## Verification

Credential-free tests preserve the API and UI behavior described above. Use
`pnpm check` for CI checks, then the guarded Node/Neon procedure in
[verification](verification.md) for live integration checks. Synthetic fixtures
remain in ignored `.local/` and must be cleaned after the run. The smoke helpers
use the existing development project and reject other database endpoints.

Run `pnpm dental-recordss:smoke-data seed`, then `verify` and `cleanup` against the
local preview or exact `VERIFY_BASE_URL`. No synthetic fixture routes are deployed.
