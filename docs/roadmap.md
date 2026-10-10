# Development roadmap

Authentication, patients, appointments, and basic dental records are implemented.
They use the existing React/TanStack Router frontend, Hono Worker API, Better Auth,
and Neon/Drizzle persistence. The application is not yet ready for private
production patient data: the [production security checklist](security.md) remains
open. This roadmap distinguishes implemented functionality from remaining work.

## Implemented

| Area                      | Completed functionality                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and access | Administrator-created admin/staff accounts, independent dentist designation, password login, database-backed sessions, logout, rate limiting, same-origin mutation checks, server permissions, and immediate denial of existing sessions for banned accounts.                                  |
| Patients                  | Demographics and contact details, validated create/read/update, bounded search and pagination, admin-only archival, retained archived records, and Manila-date birth-date validation.                                                                                                          |
| Appointments              | Booking, rescheduling, cancellation, four statuses, dentist designation, date/list/day/week views in Asia/Manila, pagination, database overlap prevention, and protection of appointment links used by clinical records.                                                                       |
| Dental records            | Dentist-only clinical notes and completed treatment history, diagnosis/procedure text, FDI tooth numbers, optional appointment links, paginated full revisions with authenticated authors, expected-version conflict protection, and corrections after patient archival or dentist retirement. |

See [authentication](authentication.md), [patients](patients.md),
[appointments](appointments.md), and [dental records](dental-records.md) for
contracts and earlier development-runtime evidence. The
[stabilization review](stabilization-review.md) records the current synthetic-test
coverage, confirmed fixes, and validation limits; earlier live checks are not
evidence that those checks were repeated during this review.

## Remaining

1. **Release safeguards:** complete and verify account removal and administrator
   session revocation, the account recovery/password-change process, deployment
   permissions, least-privilege database credentials, safe monitoring, retention
   policy, and backup restoration. Read-access auditing for patient/clinical data
   is not implemented. Admin/staff plus a dentist designation are the current
   permission model; distinct receptionist/dentist roles are not implemented.
2. **External verification:** repeat guarded auth/database workerd checks and
   synthetic feature smoke checks against a verified development Neon endpoint.
   Confirm exclusion constraints, clinical audit-trigger rollback, real concurrent
   writes, and persistence independently of mocks. Browser and hosted production
   behavior require their own verification; no production data is needed.
3. **Patient scope:** consent capture, additional identifiers, and restoration of
   archived patients remain unimplemented. Define retention and auditing before
   expanding the record model.
4. **Appointment scope:** dentist availability/schedules, recurrence, and
   notifications remain unimplemented. Patient and appointment edits currently
   lack the expected-version protection used by dental records.
5. **Clinical scope:** structured medical/dental history, advanced dental
   charting/odontograms, treatment plans, prescriptions, and attachments remain
   unimplemented. The appointment selector intentionally shows only the 50 most
   recent eligible appointments; existing older links remain editable.
6. **Billing:** service prices, invoices, payments, balances, receipts, and tax
   reporting remain unimplemented. Confirm clinic requirements before adding
   exact monetary values, payment permissions, or external integrations.

Keep future work focused, with reviewed migrations, server validation, permission
tests, and credential-free regressions. Test migrations on an isolated development
branch. Add payment, email, or file services only when approved feature work needs
them.
