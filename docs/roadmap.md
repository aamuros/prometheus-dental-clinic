# Development roadmap

The repository currently provides application and database foundations only.
Implement these phases in order, with focused schema migrations, server-side
validation, permission tests, and credential-free unit tests for each feature.

1. **Authentication and access:** integrate Better Auth after verifying Worker
   and Drizzle adapter compatibility; add secure sessions, logout/revocation,
   CSRF protection, and clinic roles (administrator, dentist, receptionist).
   Enforce authorization in the API and complete the [security checklist](security.md)
   before storing private information.
2. **Patients:** add patient identifiers, demographics, contact details, and
   consent; implement authorized search and record updates with access auditing
   and a defined retention policy.
3. **Appointments:** add dentist schedules, clinic timezone rules, booking,
   rescheduling, cancellation, and status tracking. Prevent conflicting bookings
   at the database level and test concurrent requests.
4. **Clinical records:** add medical/dental history, encounter notes, dental
   charting, and treatment plans. Restrict clinical access, preserve amendment
   history, and define attachment access and retention when uploads are needed.
5. **Billing:** add service prices, invoices, payments, balances, and receipts.
   Use exact monetary values, permission checks, and idempotent payment updates;
   confirm clinic tax and reporting requirements before implementation.

Before release, test migrations on an isolated Neon branch, verify backup
restoration, and run the documented Worker/browser smoke checks. External payment,
email, and file services should be added only when a feature requires them.
