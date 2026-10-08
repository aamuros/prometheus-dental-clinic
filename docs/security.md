# Production security checklist

This starter is unauthenticated and has no database. Its headers and safe error
responses are useful defaults, but each generated application must implement
and verify these safeguards before processing private business information.
Choose controls for the application's data and access model; the template does
not install security services or frameworks.

- [ ] **Authentication:** identify permitted users, protect entry points, and
      provide account removal and session revocation. Use a maintained provider
      or library and verify its Cloudflare compatibility.
- [ ] **Authorization:** enforce permissions on every relevant server operation,
      including individual records, files, exports, and background jobs. Test
      denied access and cross-user or cross-organization access where applicable.
- [ ] **Request validation:** validate bodies, parameters, uploads, and size
      limits on the server. Use parameterized database queries; browser checks
      and shared types are insufficient.
- [ ] **Sessions and CSRF:** when using cookie sessions, use appropriate Secure,
      HttpOnly, and SameSite attributes, expiration, rotation, and logout. Protect
      state-changing requests against CSRF with an appropriate origin/token
      strategy; do not make state changes through GET requests.
- [ ] **Secrets:** keep credentials server-side in Worker secrets and deployment
      environment secrets. Scope access, rotate credentials, and never put them
      in `VITE_*`, shared modules, source control, or logs.
- [ ] **Database and storage access:** use least-privilege credentials and
      application-specific access controls. Protect object downloads and uploads;
      confirm encryption and retention requirements for the stored information.
- [ ] **Errors and headers:** retain safe error envelopes and redact provider
      details. Verify HTTPS, static/API security headers, and CSP after adding UI
      components or external services; avoid permissive CORS without a need.
- [ ] **Logging and monitoring:** define safe diagnostic fields, retention, access,
      and alerts. Test that credentials and private information are redacted and
      that failures can be investigated without recording full requests.
- [ ] **Backup and restoration:** define recovery objectives for persistent data,
      schedule backups, restrict access, and test restoration. Include file
      storage and migrations in the recovery procedure where applicable.
- [ ] **Dependency security:** run the audit in CI and follow the update policy
      in [conventions](conventions.md). Investigate high/critical advisories before
      release and review dependency build scripts and action updates.
- [ ] **Deployment permissions:** protect the default branch, require CI, restrict
      the `production` environment to approved branches, and scope deployment
      tokens. Verify the deployed application's routes and access controls, and
      document how to roll back a failed release.

Record the checks and evidence in the generated application's verification
notes. Authentication, authorization, persistence, backups, monitoring, and
their operating costs remain application-specific responsibilities.
