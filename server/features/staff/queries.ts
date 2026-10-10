import { sql } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import type { StaffRole } from '../../../shared/auth.js';

type Database = ReturnType<typeof createDatabase>;
export type StaffAction =
  | 'deactivate'
  | 'reactivate'
  | 'revoke-sessions'
  | 'change-password'
  | 'recover-password';
type MutationStatus =
  'ok' | 'not_found' | 'forbidden' | 'last_admin' | 'conflict';
type StaffAccount = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  banned: boolean | null;
  isDentist: boolean;
  passwordChangeRequired: boolean;
};

export async function listStaff(db: Database, page: number) {
  const result = await db.execute<StaffAccount>(sql`
    SELECT id, name, email, role, banned, is_dentist AS "isDentist",
      password_change_required AS "passwordChangeRequired"
    FROM auth_user ORDER BY created_at, id LIMIT 51 OFFSET ${(page - 1) * 50}
  `);
  return {
    accounts: result.rows.slice(0, 50).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      active: !row.banned,
      isDentist: row.isDentist,
      passwordChangeRequired: row.passwordChangeRequired,
    })),
    page,
    hasMore: result.rows.length > 50,
  };
}

export async function credentialHash(db: Database, userId: string) {
  const result = await db.execute<{ password: string | null }>(sql`
    SELECT password FROM auth_account WHERE user_id = ${userId} AND provider_id = 'credential'
  `);
  return result.rows[0]?.password;
}

// Unlike Better Auth's HTTP handler, custom clinic routes do not automatically
// enter its rate limiter. Persist a shared per-actor password-attempt bucket.
export async function allowPasswordAttempt(db: Database, actorId: string) {
  const now = Date.now();
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO auth_rate_limit (id, key, count, last_request)
    VALUES (${crypto.randomUUID()}, ${`staff-password:${actorId}`}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_rate_limit.last_request <= ${now - 60000} THEN 1 ELSE auth_rate_limit.count + 1 END,
      last_request = CASE WHEN auth_rate_limit.last_request <= ${now - 60000} THEN ${now} ELSE auth_rate_limit.last_request END
    RETURNING count
  `);
  return Number(result.rows[0]?.count) <= 5;
}

export async function mutateStaff(
  db: Database,
  input: {
    actorId: string;
    sessionId: string;
    targetId: string;
    action: StaffAction;
    expectedHash?: string;
    newHash?: string;
  },
): Promise<MutationStatus> {
  const { actorId, sessionId, targetId, action } = input;
  const expectedHash = input.expectedHash ?? null;
  const newHash = input.newHash ?? null;
  // A separate first statement is essential: the next READ COMMITTED statement
  // gets a fresh snapshot after the lock wait. A count inside a single concurrent
  // UPDATE/CTE can see stale administrators. HTTP batch transactions are supported.
  const [, result] = await db.batch([
    db.execute(sql`LOCK TABLE auth_user IN SHARE ROW EXCLUSIVE MODE`),
    db.execute<{ status: MutationStatus }>(sql`
      WITH actor AS MATERIALIZED (
        SELECT u.* FROM auth_user u JOIN auth_session s ON s.user_id = u.id
        WHERE u.id = ${actorId} AND s.id = ${sessionId} AND s.expires_at > now()
          AND NOT coalesce(u.banned, false)
          AND (${action} = 'change-password' OR (u.role = 'admin' AND NOT u.password_change_required))
          AND (u.role IN ('admin', 'staff'))
      ), target AS MATERIALIZED (
        SELECT * FROM auth_user WHERE id = ${targetId}
      ), decision AS MATERIALIZED (
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM actor) THEN 'forbidden'
          WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
          WHEN ${action} = 'change-password' AND ${actorId} <> ${targetId} THEN 'forbidden'
          WHEN ${action} = 'recover-password' AND ${actorId} = ${targetId} THEN 'conflict'
          WHEN ${action} IN ('deactivate', 'recover-password')
            AND EXISTS (SELECT 1 FROM target WHERE role = 'admin' AND NOT coalesce(banned, false) AND NOT password_change_required)
            AND (SELECT count(*) FROM auth_user WHERE role = 'admin' AND NOT coalesce(banned, false) AND NOT password_change_required) <= 1
            THEN 'last_admin'
          WHEN ${action} IN ('change-password', 'recover-password') AND (
            ${newHash}::text IS NULL OR ${expectedHash}::text IS NULL OR
            NOT EXISTS (SELECT 1 FROM auth_account WHERE user_id = ${actorId}
              AND provider_id = 'credential' AND password = ${expectedHash}) OR
            NOT EXISTS (SELECT 1 FROM auth_account WHERE user_id = ${targetId} AND provider_id = 'credential')
          ) THEN 'conflict'
          ELSE 'ok' END AS status
      ), changed AS (
        UPDATE auth_user SET
          banned = CASE WHEN ${action} = 'deactivate' THEN true WHEN ${action} = 'reactivate' THEN false ELSE banned END,
          ban_reason = CASE WHEN ${action} = 'deactivate' THEN 'Account deactivated' WHEN ${action} = 'reactivate' THEN NULL ELSE ban_reason END,
          ban_expires = CASE WHEN ${action} IN ('deactivate', 'reactivate') THEN NULL ELSE ban_expires END,
          password_change_required = CASE WHEN ${action} = 'recover-password' THEN true WHEN ${action} = 'change-password' THEN false ELSE password_change_required END,
          updated_at = now()
        WHERE id = ${targetId} AND (SELECT status FROM decision) = 'ok'
        RETURNING id
      ), password_changed AS (
        UPDATE auth_account SET password = ${newHash}, updated_at = now()
        WHERE user_id IN (SELECT id FROM changed) AND provider_id = 'credential'
          AND ${action} IN ('change-password', 'recover-password')
        RETURNING id
      ), revoked AS (
        DELETE FROM auth_session WHERE user_id IN (SELECT id FROM changed)
          AND ${action} <> 'reactivate' RETURNING id
      ), audited AS (
        INSERT INTO staff_audit (actor_id, target_id, action)
        SELECT ${actorId}, id, ${action} FROM changed RETURNING id
      ) SELECT status FROM decision
    `),
  ]);
  const status = result.rows[0]?.status;
  if (!status) throw new Error('Missing lifecycle result');
  return status;
}
