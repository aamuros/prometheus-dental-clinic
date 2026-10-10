# Staff lifecycle implementation plan

Extend the existing backend authentication flow without deleting staff accounts,
changing roles, adding dependencies, or changing production configuration.

1. Add failing API tests for admin listing and mutations, self-service password
   changes, recovery, restricted recovery sessions, CSRF, validation and safe errors.
2. Add a feature-owned audit table and `passwordChangeRequired` user flag. Reuse
   Better Auth's credential hashing/verification, ban state and session tables.
3. Implement `/api/staff` routes and explicit safe account projections. Recovery
   requires the administrator's current password and a supplied temporary password;
   the employee must replace it before using business APIs. Password changes
   revoke all sessions and require a fresh login.
4. Use Neon HTTP batch transactions: acquire an account-table write lock before
   the mutation statement, recheck actor/session/credentials, preserve at least
   one active administrator, revoke sessions and insert an audit record atomically.
   Conditional password writes reject a credential changed since verification.
5. Generate the migration offline. On an isolated expiring child of the existing
   development branch, apply migrations and exercise real sessions, concurrent
   deactivations/password changes, rollback on audit failure and clinical references.
6. Update authentication/security documentation, run `pnpm check` and
   `pnpm audit --audit-level=high`, then commit and open a focused pull request.

Better Auth 1.7.7 provides `listUsers`, `banUser`, `unbanUser`,
`revokeUserSessions`, `changePassword`, `verifyPassword`, and `setUserPassword`.
The built-in mutations use separate adapter calls and do not enforce the clinic's
atomic audit/last-admin invariants. Use its password context with the existing
Drizzle tables for the atomic clinic operations; keep raw plugin routes closed.

Verification uses synthetic data only in the isolated branch. Existing local
credentials, production settings, and production data remain untouched.
