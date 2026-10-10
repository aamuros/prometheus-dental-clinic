import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { app } from '../server/app.js';
import { createDatabase } from '../server/db/client.js';
import {
  account,
  appointments,
  dentalRecordHistory,
  dentalRecords,
  patients,
  session,
  staffAudit,
  user,
} from '../server/db/schema.js';
import { createAuth } from '../server/features/auth/auth.js';
import {
  credentialHash,
  mutateStaff,
} from '../server/features/staff/queries.js';

// Deliberately separate from .env.local/developmentEnv: only an explicit,
// ephemeral child of development is allowed. The guard runs before any SQL.
const origin = 'https://staff-verification.example.test';
let stage = 'isolated branch guard';
function verificationEnv() {
  const branchId = process.env.STAFF_VERIFY_BRANCH_ID;
  const connection = process.env.STAFF_VERIFY_DATABASE_URL;
  assert.ok(
    branchId && connection,
    'Supply explicit isolated branch credentials',
  );
  const branch: unknown = JSON.parse(
    execFileSync(
      'neon',
      [
        'branches',
        'get',
        branchId,
        '--project-id',
        'muddy-boat-93080753',
        '--output',
        'json',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );
  assert.ok(
    branch &&
      typeof branch === 'object' &&
      'id' in branch &&
      branch.id === branchId &&
      'parent_id' in branch &&
      branch.parent_id === 'br-red-sun-b3nj2cwd' &&
      'name' in branch &&
      typeof branch.name === 'string' &&
      branch.name.startsWith('dev-staff-lifecycle-') &&
      'default' in branch &&
      branch.default === false &&
      'protected' in branch &&
      branch.protected === false &&
      'expires_at' in branch &&
      typeof branch.expires_at === 'string',
  );
  const connectionURL = new URL(connection);
  assert.equal(connectionURL.protocol, 'postgresql:');
  assert.equal(connectionURL.pathname, '/prometheus_dental_clinic');
  assert.equal(connectionURL.searchParams.get('sslmode'), 'require');
  const branchConnection = new URL(
    execFileSync(
      'neon',
      [
        'connection-string',
        branchId,
        '--project-id',
        'muddy-boat-93080753',
        '--database-name',
        'prometheus_dental_clinic',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim(),
  );
  assert.equal(connectionURL.hostname, branchConnection.hostname);
  return {
    DATABASE_URL: connection,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
  };
}

async function verify() {
  const env = verificationEnv();
  const db = createDatabase(env);
  stage = 'migration';
  // Operator-run migration, after independently checking the isolated branch.
  await migrate(db, { migrationsFolder: './drizzle' });
  const auth = createAuth(env);
  const run = randomUUID();
  const password = randomBytes(24).toString('base64url');
  const changedPassword = randomBytes(24).toString('base64url');
  const temporaryPassword = randomBytes(24).toString('base64url');
  const syntheticIds: string[] = [];
  let patientId: string | undefined;
  let appointmentId: string | undefined;
  let recordId: string | undefined;
  let rollbackConstraint = false;
  let inherited: { id: string; banned: boolean | null }[] = [];
  let ip = 1;
  const originalLog = console.info;
  console.info = () => undefined;
  async function request(
    path: string,
    body?: unknown,
    cookie?: string,
    requestOrigin: string | null = origin,
  ) {
    return app.request(
      `${origin}${path}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-forwarded-for': `192.0.2.${ip++ % 250}`,
          ...(requestOrigin ? { Origin: requestOrigin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      env,
    );
  }
  async function create(label: string, role: 'staff' | 'admin') {
    const created = await auth.api.createUser({
      body: {
        name: `Synthetic ${label}`,
        email: `staff-lifecycle-${run}-${label}@example.test`,
        password,
        role,
      },
    });
    syntheticIds.push(created.user.id);
    return created.user;
  }
  async function login(email: string, loginPassword = password) {
    const response = await request('/api/auth/sign-in/email', {
      email,
      password: loginPassword,
    });
    assert.equal(response.status, 200, 'Synthetic login failed');
    assert.ok(!(await response.text()).includes('"token"'));
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }
  async function sessionId(cookie: string) {
    const resolved = await auth.api.getSession({
      headers: new Headers({ Cookie: cookie }),
    });
    assert.ok(resolved);
    return resolved.session.id;
  }
  try {
    stage = 'synthetic account setup';
    const adminA = await create('admin-a', 'admin');
    const adminB = await create('admin-b', 'admin');
    const employee = await create('employee', 'staff');
    await db
      .update(user)
      .set({ isDentist: true })
      .where(eq(user.id, employee.id));
    const adminCookie = await login(adminA.email);
    let secondAdminCookie = await login(adminB.email);
    const employeeCookie = await login(employee.email);
    const secondEmployeeCookie = await login(employee.email);
    stage = 'authorization and validation';

    assert.equal((await request('/api/staff')).status, 401);
    assert.equal(
      (await request('/api/staff', undefined, employeeCookie)).status,
      403,
    );
    const listed = await request('/api/staff', undefined, adminCookie);
    assert.equal(listed.status, 200);
    assert.ok(!/"password"|"token"|"banReason"/.test(await listed.text()));
    for (const action of [
      'deactivate',
      'reactivate',
      'revoke-sessions',
      'recover-password',
    ]) {
      assert.equal(
        (
          await request(
            `/api/staff/${employee.id}/${action}`,
            {},
            employeeCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `/api/staff/${employee.id}/${action}`,
            {},
            adminCookie,
            null,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `/api/staff/${employee.id}/${action}`,
            {},
            adminCookie,
            'https://hostile.example.test',
          )
        ).status,
        403,
      );
    }
    assert.equal(
      (
        await request(
          `/api/staff/${employee.id}/deactivate`,
          { role: 'admin' },
          adminCookie,
        )
      ).status,
      400,
    );

    const [patient] = await db
      .insert(patients)
      .values({
        name: `Synthetic ${run}`,
        birthDate: '1990-01-01',
        contactNumber: '0000000000',
      })
      .returning();
    assert.ok(patient);
    patientId = patient.id;
    const [appointment] = await db
      .insert(appointments)
      .values({
        patientId: patient.id,
        dentistId: employee.id,
        startAt: new Date('2026-01-01T00:00:00Z'),
        endAt: new Date('2026-01-01T01:00:00Z'),
        status: 'completed',
      })
      .returning();
    assert.ok(appointment);
    appointmentId = appointment.id;
    const [record] = await db
      .insert(dentalRecords)
      .values({
        patientId: patient.id,
        appointmentId: appointment.id,
        dentistId: employee.id,
        createdBy: employee.id,
        updatedBy: employee.id,
        kind: 'note',
        clinicalNotes: 'Synthetic verification only',
        treatmentDate: '2026-01-01',
      })
      .returning();
    assert.ok(record);
    recordId = record.id;
    await db
      .update(dentalRecords)
      .set({
        clinicalNotes: 'Synthetic revision',
        version: 2,
        updatedBy: employee.id,
        updatedAt: new Date(),
      })
      .where(eq(dentalRecords.id, record.id));
    const historyBefore = await db
      .select()
      .from(dentalRecordHistory)
      .where(eq(dentalRecordHistory.recordId, record.id));
    assert.ok(historyBefore.length > 0);

    assert.equal(
      (await request(`/api/staff/${employee.id}/deactivate`, {}, adminCookie))
        .status,
      200,
    );
    assert.equal(
      (await request('/api/session', undefined, employeeCookie)).status,
      401,
    );
    assert.equal(
      (await request('/api/session', undefined, secondEmployeeCookie)).status,
      401,
    );
    assert.equal(
      (
        await request('/api/auth/sign-in/email', {
          email: employee.email,
          password,
        })
      ).status,
      403,
    );
    assert.deepEqual(
      await db
        .select()
        .from(dentalRecordHistory)
        .where(eq(dentalRecordHistory.recordId, record.id)),
      historyBefore,
    );
    assert.equal(
      (
        await db
          .select()
          .from(dentalRecords)
          .where(eq(dentalRecords.id, record.id))
      )[0]?.dentistId,
      employee.id,
    );
    assert.equal(
      (
        await db
          .select()
          .from(appointments)
          .where(eq(appointments.id, appointment.id))
      )[0]?.dentistId,
      employee.id,
    );
    await assert.rejects(db.delete(user).where(eq(user.id, employee.id)));
    assert.equal(
      (await request(`/api/staff/${employee.id}/reactivate`, {}, adminCookie))
        .status,
      200,
    );
    assert.equal(
      (await request('/api/session', undefined, employeeCookie)).status,
      401,
    );
    const activeCookie = await login(employee.email);
    assert.equal(
      (
        await request(
          `/api/staff/${employee.id}/revoke-sessions`,
          {},
          adminCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/api/session', undefined, activeCookie)).status,
      401,
    );

    stage = 'password change';
    const passwordCookie = await login(employee.email);
    const oldHash = await credentialHash(db, employee.id);
    assert.ok(oldHash);
    assert.equal(
      (
        await request(
          '/api/staff/password',
          {
            currentPassword: 'incorrect-password',
            newPassword: changedPassword,
          },
          passwordCookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/api/staff/password',
          {
            currentPassword: password,
            newPassword: changedPassword,
            userId: adminA.id,
          },
          passwordCookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/api/staff/password',
          { currentPassword: password, newPassword: changedPassword },
          passwordCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/api/session', undefined, passwordCookie)).status,
      401,
    );
    assert.equal(
      (
        await request('/api/auth/sign-in/email', {
          email: employee.email,
          password,
        })
      ).status,
      401,
    );
    const changedCookie = await login(employee.email, changedPassword);
    assert.notEqual(await credentialHash(db, employee.id), changedPassword);

    stage = 'password recovery';
    const recovery = {
      currentPassword: password,
      newPassword: temporaryPassword,
    };
    assert.equal(
      (
        await request(
          `/api/staff/${employee.id}/recover-password`,
          { ...recovery, currentPassword: 'incorrect-password' },
          adminCookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/staff/${employee.id}/recover-password`,
          recovery,
          adminCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/api/session', undefined, changedCookie)).status,
      401,
    );
    assert.equal(
      (
        await request('/api/auth/sign-in/email', {
          email: employee.email,
          password: changedPassword,
        })
      ).status,
      401,
    );
    const recoveryCookie = await login(employee.email, temporaryPassword);
    const recoveredSession = await request(
      '/api/session',
      undefined,
      recoveryCookie,
    );
    assert.equal(recoveredSession.status, 200);
    const sessionBody: { user: { passwordChangeRequired: boolean } } =
      await recoveredSession.json();
    assert.equal(sessionBody.user.passwordChangeRequired, true);
    for (const path of [
      '/api/patients',
      '/api/appointments',
      '/api/dental-records',
    ])
      assert.equal(
        (await request(path, undefined, recoveryCookie)).status,
        403,
      );
    assert.equal(
      (
        await request(
          '/api/staff/password',
          { currentPassword: temporaryPassword, newPassword: changedPassword },
          recoveryCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/api/session', undefined, recoveryCookie)).status,
      401,
    );
    const finalCookie = await login(employee.email, changedPassword);
    assert.equal(
      (await request('/api/patients', undefined, finalCookie)).status,
      200,
    );

    // Prove stale verification cannot overwrite a newer password. Two writes
    // start from the same verified credential and session; only one may succeed.
    stage = 'concurrent password changes';
    const expectedHash = await credentialHash(db, employee.id);
    assert.ok(expectedHash);
    const currentSessionId = await sessionId(finalCookie);
    const context = await auth.$context;
    const [hashA, hashB] = await Promise.all([
      context.password.hash(randomBytes(24).toString('base64url')),
      context.password.hash(randomBytes(24).toString('base64url')),
    ]);
    const passwordResults = await Promise.all(
      [hashA, hashB].map((newHash) =>
        mutateStaff(db, {
          actorId: employee.id,
          targetId: employee.id,
          sessionId: currentSessionId,
          action: 'change-password',
          expectedHash,
          newHash,
        }),
      ),
    );
    assert.equal(passwordResults.filter((result) => result === 'ok').length, 1);
    assert.ok(passwordResults.includes('forbidden'));

    // Inject an audit failure: account and session changes must roll back.
    await db.execute(
      sql`ALTER TABLE staff_audit ADD CONSTRAINT staff_verify_rollback CHECK (action <> 'deactivate') NOT VALID`,
    );
    rollbackConstraint = true;
    const rollbackCookie = await login(adminB.email);
    stage = 'audit rollback';
    const auditCount = (await db.select().from(staffAudit)).length;
    const failed = await request(
      `/api/staff/${adminB.id}/deactivate`,
      {},
      adminCookie,
    );
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'Internal server error' });
    assert.equal(
      (await request('/api/session', undefined, rollbackCookie)).status,
      200,
    );
    assert.equal(
      (await db.select().from(user).where(eq(user.id, adminB.id)))[0]?.banned,
      false,
    );
    assert.equal((await db.select().from(staffAudit)).length, auditCount);
    await db.execute(
      sql`ALTER TABLE staff_audit DROP CONSTRAINT staff_verify_rollback`,
    );
    rollbackConstraint = false;

    // Temporarily deactivate inherited accounts only in this disposable clone,
    // restoring flags in finally. This leaves exactly our two synthetic admins.
    stage = 'concurrent last administrator actions';
    inherited = await db
      .select({ id: user.id, banned: user.banned })
      .from(user)
      .where(
        sql`id NOT IN (${sql.join(
          syntheticIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    for (const row of inherited)
      await db.update(user).set({ banned: true }).where(eq(user.id, row.id));
    // A recovered administrator is still an admin by role, but cannot perform
    // administration until replacing the temporary password. Count unrestricted
    // administrators so this state cannot permit deactivating the only operator.
    assert.equal(
      (
        await request(
          `/api/staff/${adminB.id}/recover-password`,
          recovery,
          adminCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/api/session', undefined, secondAdminCookie)).status,
      401,
    );
    const restrictedAdminCookie = await login(adminB.email, temporaryPassword);
    assert.equal(
      (await request(`/api/staff/${adminA.id}/deactivate`, {}, adminCookie))
        .status,
      409,
    );
    assert.equal(
      (
        await request(
          `/api/staff/${adminA.id}/reactivate`,
          {},
          restrictedAdminCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await request('/api/auth/admin/create-user', {}, restrictedAdminCookie))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          '/api/staff/password',
          { currentPassword: temporaryPassword, newPassword: password },
          restrictedAdminCookie,
        )
      ).status,
      200,
    );
    secondAdminCookie = await login(adminB.email);
    const concurrent = await Promise.all([
      request(`/api/staff/${adminA.id}/deactivate`, {}, adminCookie),
      request(`/api/staff/${adminB.id}/deactivate`, {}, secondAdminCookie),
    ]);
    assert.deepEqual(
      concurrent.map((response) => response.status).sort(),
      [200, 409],
    );
    const remaining = (
      await db
        .select()
        .from(user)
        .where(inArray(user.id, [adminA.id, adminB.id]))
    ).filter((row) => !row.banned);
    assert.equal(remaining.length, 1);
    const survivor = remaining[0];
    assert.ok(survivor);
    const survivorCookie = await login(survivor.email);
    assert.equal(
      (
        await request(
          `/api/staff/${survivor.id}/deactivate`,
          {},
          survivorCookie,
        )
      ).status,
      409,
    );
    const disabledId = survivor.id === adminA.id ? adminB.id : adminA.id;
    const disabledCookie =
      survivor.id === adminA.id ? secondAdminCookie : adminCookie;
    assert.equal(
      (
        await request(
          `/api/staff/${survivor.id}/reactivate`,
          {},
          disabledCookie,
        )
      ).status,
      401,
    );
    assert.equal(
      (await request(`/api/staff/${disabledId}/reactivate`, {}, survivorCookie))
        .status,
      200,
    );
    const restoredCookie = await login(survivor.email);
    // Recovery also removes admin privileges until password change. It cannot
    // strand the last unrestricted admin, even though the account isn't banned.
    assert.equal(
      (await request(`/api/staff/${disabledId}/deactivate`, {}, restoredCookie))
        .status,
      200,
    );
    const adminHash = await credentialHash(db, survivor.id);
    assert.ok(adminHash);
    assert.equal(
      await mutateStaff(db, {
        actorId: survivor.id,
        targetId: survivor.id,
        sessionId: await sessionId(restoredCookie),
        action: 'recover-password',
        expectedHash: adminHash,
        newHash: hashA,
      }),
      'conflict',
    );

    const audits = await db
      .select()
      .from(staffAudit)
      .where(inArray(staffAudit.targetId, syntheticIds));
    for (const action of [
      'deactivate',
      'reactivate',
      'revoke-sessions',
      'change-password',
      'recover-password',
    ])
      assert.ok(audits.some((row) => row.action === action));
    for (const row of audits)
      assert.deepEqual(Object.keys(row).sort(), [
        'action',
        'actorId',
        'createdAt',
        'id',
        'targetId',
      ]);
    assert.equal(
      (await db.select().from(session).where(eq(session.userId, employee.id)))
        .length,
      0,
    );
    console.log(
      'PASS: isolated Neon migration; authorization, CSRF, safe listing/errors, deactivation/reactivation, session revocation, password change/recovery, concurrent last-admin/password changes, audit rollback and preserved clinical history',
    );
  } finally {
    console.info = originalLog;
    if (rollbackConstraint)
      await db.execute(
        sql`ALTER TABLE staff_audit DROP CONSTRAINT staff_verify_rollback`,
      );
    for (const row of inherited)
      await db
        .update(user)
        .set({ banned: row.banned })
        .where(eq(user.id, row.id));
    if (recordId) {
      await db
        .delete(dentalRecordHistory)
        .where(eq(dentalRecordHistory.recordId, recordId));
      await db.delete(dentalRecords).where(eq(dentalRecords.id, recordId));
    }
    if (appointmentId)
      await db.delete(appointments).where(eq(appointments.id, appointmentId));
    if (patientId) await db.delete(patients).where(eq(patients.id, patientId));
    if (syntheticIds.length) {
      await db
        .delete(staffAudit)
        .where(inArray(staffAudit.targetId, syntheticIds));
      await db.delete(account).where(inArray(account.userId, syntheticIds));
      await db.delete(user).where(inArray(user.id, syntheticIds));
      await db.execute(
        sql`DELETE FROM auth_rate_limit WHERE key IN (${sql.join(
          syntheticIds.map((id) => sql`${`staff-password:${id}`}`),
          sql`, `,
        )})`,
      );
    }
  }
}
verify().catch(() => {
  console.error(
    `Staff lifecycle verification failed at ${stage}; credentials and provider details suppressed.`,
  );
  process.exitCode = 1;
});
