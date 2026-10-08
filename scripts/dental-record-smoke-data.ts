import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { parseEnv } from 'node:util';
import { and, eq, inArray, like } from 'drizzle-orm';
import { createDatabase } from '../worker/db/client';
import {
  appointments,
  dentalRecordHistory,
  dentalRecords,
  patients,
  user,
} from '../worker/db/schema';
import { createAuth } from '../worker/features/auth/auth';

// Operator-only verification, never mounted in the application Worker.
const origin = 'http://127.0.0.1:4180';
const statePath = '.wrangler/dental-record-smoke.json';
function developmentEnv() {
  const context: unknown = JSON.parse(readFileSync('.neon', 'utf8'));
  assert.ok(
    context &&
      typeof context === 'object' &&
      'branch' in context &&
      context.branch === 'development' &&
      'projectId' in context &&
      context.projectId === 'green-bar-82369299',
  );
  const development = parseEnv(readFileSync('.env.local', 'utf8'));
  const local = parseEnv(readFileSync('.dev.vars', 'utf8'));
  assert.equal(development.NEON_BRANCH, 'development');
  assert.ok(
    local.DATABASE_URL &&
      local.BETTER_AUTH_SECRET &&
      development.DATABASE_URL_UNPOOLED,
  );
  assert.equal(local.DATABASE_URL, development.DATABASE_URL);
  for (const source of [
    process.env,
    ...(existsSync('.env') ? [parseEnv(readFileSync('.env', 'utf8'))] : []),
  ]) {
    for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED'])
      assert.ok(
        !source[key] || source[key] === development[key],
        'Unexpected database override',
      );
  }
  // Metadata verified before use: this endpoint belongs to development
  // br-polished-lab-b38jmw3l. Reject any other endpoint before issuing SQL.
  const direct = new URL(development.DATABASE_URL_UNPOOLED);
  const pooled = new URL(local.DATABASE_URL);
  assert.equal(
    direct.hostname,
    'ep-shy-flower-b3mjfmsi.c-4.ap-southeast-1.aws.neon.tech',
  );
  assert.equal(pooled.hostname.replace('-pooler', ''), direct.hostname);
  assert.equal(pooled.pathname, direct.pathname);
  assert.ok(!direct.hostname.includes('-pooler'));
  return {
    DATABASE_URL: local.DATABASE_URL,
    DATABASE_URL_UNPOOLED: development.DATABASE_URL_UNPOOLED,
    BETTER_AUTH_SECRET: local.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: origin,
  };
}
function readState() {
  const state: unknown = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.ok(
    state &&
      typeof state === 'object' &&
      'run' in state &&
      typeof state.run === 'string' &&
      /^[a-f0-9-]{36}$/.test(state.run) &&
      'password' in state &&
      typeof state.password === 'string',
  );
  return { run: state.run, password: state.password };
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
async function responseRecord(response: Response) {
  const data: unknown = await response.json();
  assert.ok(object(data) && object(data.record));
  const record = data.record;
  assert.ok(
    typeof record.id === 'string' && typeof record.version === 'number',
  );
  return { id: record.id, version: record.version, raw: record };
}
async function main() {
  const env = developmentEnv();
  const action = process.argv[2];
  if (action === 'migrate') {
    const result = spawnSync('pnpm', ['db:migrate'], {
      env: {
        ...process.env,
        DATABASE_URL: env.DATABASE_URL,
        DATABASE_URL_UNPOOLED: env.DATABASE_URL_UNPOOLED,
      },
      stdio: 'inherit',
    });
    assert.equal(result.status, 0, 'Development migration failed');
    return;
  }
  const db = createDatabase(env);
  if (action === 'seed') {
    assert.ok(!existsSync(statePath), 'Clean up old fixtures first');
    const state = {
      run: randomUUID(),
      password: Array.from(randomBytes(32), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    };
    mkdirSync('.wrangler', { recursive: true });
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    for (const designation of ['admin', 'staff', 'dentist', 'second-dentist']) {
      const email = `clinical-smoke-${state.run}-${designation}@example.test`;
      await createAuth(env).api.createUser({
        body: {
          name: `Synthetic ${designation}`,
          email,
          password: state.password,
          role: designation === 'admin' ? 'admin' : 'staff',
        },
      });
      if (designation.includes('dentist'))
        await db
          .update(user)
          .set({ isDentist: true })
          .where(eq(user.email, email));
    }
    console.log(
      'Synthetic clinical fixtures created; credentials remain in ignored local state.',
    );
    return;
  }
  const state = readState();
  const prefix = `clinical-smoke-${state.run}-`;
  const patientEmail = `clinical-patient-${state.run}@example.test`;
  const fixturePatients = await db
    .select()
    .from(patients)
    .where(like(patients.email, `clinical-patient-${state.run}%@example.test`));
  const fixtureUsers = await db
    .select()
    .from(user)
    .where(like(user.email, `${prefix}%@example.test`));
  if (action === 'cleanup') {
    // Explicit operator cleanup, guarded to this synthetic run. The application
    // has no clinical deletion endpoint and never mutates prior revisions.
    const patientIds = fixturePatients.map((patient) => patient.id);
    if (patientIds.length) {
      const rows = await db
        .select({ id: dentalRecords.id })
        .from(dentalRecords)
        .where(inArray(dentalRecords.patientId, patientIds));
      if (rows.length)
        await db.delete(dentalRecordHistory).where(
          inArray(
            dentalRecordHistory.recordId,
            rows.map((row) => row.id),
          ),
        );
      await db
        .delete(dentalRecords)
        .where(inArray(dentalRecords.patientId, patientIds));
      await db
        .delete(appointments)
        .where(inArray(appointments.patientId, patientIds));
      await db.delete(patients).where(inArray(patients.id, patientIds));
    }
    if (fixtureUsers.length)
      await db.delete(user).where(
        inArray(
          user.id,
          fixtureUsers.map((record) => record.id),
        ),
      );
    unlinkSync(statePath);
    console.log('Synthetic clinical fixtures removed.');
    return;
  }
  const patient = fixturePatients.find((row) => row.email === patientEmail);
  assert.ok(patient, 'Create the synthetic patient in the browser first');
  const dentist = fixtureUsers.find(
    (row) => row.email === `${prefix}dentist@example.test`,
  );
  const second = fixtureUsers.find(
    (row) => row.email === `${prefix}second-dentist@example.test`,
  );
  assert.ok(dentist?.isDentist && second?.isDentist);
  if (action === 'check') {
    const rows = await db
      .select()
      .from(dentalRecords)
      .where(eq(dentalRecords.patientId, patient.id));
    const note = rows.find((row) => row.kind === 'note');
    const treatment = rows.find((row) => row.kind === 'treatment');
    assert.ok(note && treatment);
    assert.equal(note.clinicalNotes, `Browser corrected note ${state.run}`);
    assert.equal(note.version, 2);
    assert.equal(note.createdBy, dentist.id);
    assert.equal(note.updatedBy, second.id);
    assert.equal(treatment.procedures, `Synthetic restoration ${state.run}`);
    assert.deepEqual(treatment.toothNumbers, [26, 51]);
    assert.equal(treatment.dentistId, dentist.id);
    assert.ok(treatment.appointmentId);
    const history = await db
      .select()
      .from(dentalRecordHistory)
      .where(eq(dentalRecordHistory.recordId, note.id))
      .orderBy(dentalRecordHistory.version);
    assert.equal(history.length, 2);
    assert.equal(
      history[0]?.snapshot.clinicalNotes,
      `Browser original note ${state.run}`,
    );
    assert.equal(history[1]?.snapshot.clinicalNotes, note.clinicalNotes);
    assert.equal(history[0]?.changedBy, dentist.id);
    assert.equal(history[1]?.changedBy, second.id);
    console.log(
      'PASS: browser notes, treatment, FDI teeth, appointment link, creator/modifier, and full revisions persisted in Neon development.',
    );
    return;
  }
  assert.equal(action, 'verify', 'Use migrate, seed, check, verify or cleanup');
  const ipBytes = randomBytes(2);
  const testIP = `198.18.${ipBytes[0]}.${ipBytes[1]}`;
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    cookie?: string,
    requestOrigin: string | null = origin,
  ) {
    return fetch(`${origin}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': testIP,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
  }
  async function login(designation: string) {
    const response = await request('/api/auth/sign-in/email', 'POST', {
      email: `${prefix}${designation}@example.test`,
      password: state.password,
    });
    assert.equal(response.status, 200);
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }
  const clinical = await login('dentist');
  const otherClinical = await login('second-dentist');
  const staff = await login('staff');
  const admin = await login('admin');
  const path = '/api/dental-records';
  const input = {
    patientId: patient.id,
    kind: 'note' as const,
    clinicalNotes: 'Synthetic API note',
    diagnosis: 'Synthetic diagnosis',
    procedures: null,
    toothNumbers: [11, 85],
    treatmentDate: '2026-10-01',
    dentistId: dentist.id,
    appointmentId: null,
  };
  const created = await request(path, 'POST', input, clinical);
  assert.equal(created.status, 201);
  const record = await responseRecord(created);
  assert.equal(record.version, 1);
  assert.equal(record.raw.createdBy, dentist.id);
  const recordPath = `${path}/${record.id}`;
  for (const cookie of [staff, admin, undefined]) {
    const deniedRequests: [string, string, unknown][] = [
      [`${path}?patientId=${patient.id}`, 'GET', undefined],
      [recordPath, 'GET', undefined],
      [`${path}/options?patientId=${patient.id}`, 'GET', undefined],
      [path, 'POST', input],
      [recordPath, 'PUT', { ...input, version: 1 }],
      [recordPath, 'DELETE', undefined],
    ];
    for (const [requestPath, method, body] of deniedRequests)
      assert.equal(
        (await request(requestPath, method, body, cookie)).status,
        cookie ? 403 : 401,
      );
  }
  for (const requestOrigin of [null, 'https://attacker.test'])
    assert.equal(
      (await request(path, 'POST', input, clinical, requestOrigin)).status,
      403,
    );
  for (const patch of [
    { toothNumbers: [19] },
    { toothNumbers: [56] },
    { toothNumbers: [11, 11] },
    { createdBy: second.id },
    { treatmentDate: '2026-02-30' },
    { treatmentDate: '9999-01-01' },
    { clinicalNotes: '' },
    { clinicalNotes: 'x'.repeat(4001) },
    { patientId: 'bad-id' },
    { appointmentId: 'bad-id' },
  ])
    assert.equal(
      (await request(path, 'POST', { ...input, ...patch }, clinical)).status,
      400,
    );
  assert.equal((await request(recordPath, 'PUT', input, clinical)).status, 400);
  assert.equal(
    (await request(recordPath, 'DELETE', undefined, clinical)).status,
    405,
  );
  assert.equal(
    (await request(`${path}/${randomUUID()}`, 'GET', undefined, clinical))
      .status,
    404,
  );
  const invalidJson = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: clinical,
      'Content-Type': 'application/json',
    },
    body: '{',
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(invalidJson.status, 400);
  assert.equal(
    (
      await request(
        path,
        'POST',
        { ...input, clinicalNotes: 'x'.repeat(33000) },
        clinical,
      )
    ).status,
    413,
  );
  const edits = await Promise.all([
    request(
      recordPath,
      'PUT',
      { ...input, clinicalNotes: 'Concurrent correction A', version: 1 },
      clinical,
    ),
    request(
      recordPath,
      'PUT',
      { ...input, clinicalNotes: 'Concurrent correction B', version: 1 },
      otherClinical,
    ),
  ]);
  assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409]);
  const persisted = (
    await db.select().from(dentalRecords).where(eq(dentalRecords.id, record.id))
  )[0];
  assert.ok(persisted);
  assert.equal(persisted.version, 2);
  assert.equal(persisted.createdBy, dentist.id);
  const history = await db
    .select()
    .from(dentalRecordHistory)
    .where(eq(dentalRecordHistory.recordId, record.id))
    .orderBy(dentalRecordHistory.version);
  assert.equal(history.length, 2);
  assert.equal(history[0]?.snapshot.clinicalNotes, input.clinicalNotes);
  assert.equal(history[1]?.snapshot.clinicalNotes, persisted.clinicalNotes);
  assert.equal(history[1]?.changedBy, persisted.updatedBy);
  assert.equal(
    (await request(recordPath, 'PUT', { ...input, version: 1 }, clinical))
      .status,
    409,
  );
  const detail = await request(recordPath, 'GET', undefined, otherClinical);
  assert.equal(detail.status, 200);
  const detailBody: unknown = await detail.json();
  assert.ok(object(detailBody) && Array.isArray(detailBody.history));
  assert.equal(detailBody.history.length, 2);
  const linked = (
    await db
      .select()
      .from(appointments)
      .where(eq(appointments.patientId, patient.id))
  )[0];
  assert.ok(linked);
  assert.equal(
    (
      await request(
        path,
        'POST',
        { ...input, appointmentId: linked.id, dentistId: second.id },
        clinical,
      )
    ).status,
    400,
    'Appointment dentist mismatch',
  );
  const otherPatient = (
    await db
      .insert(patients)
      .values({
        name: `Synthetic Other Clinical Patient ${state.run}`,
        birthDate: '1990-05-17',
        contactNumber: '09170000000',
        email: `clinical-patient-${state.run}-other@example.test`,
      })
      .returning()
  )[0];
  assert.ok(otherPatient);
  assert.equal(
    (
      await request(
        path,
        'POST',
        { ...input, patientId: otherPatient.id, appointmentId: linked.id },
        clinical,
      )
    ).status,
    400,
    'Appointment patient mismatch',
  );
  assert.equal(
    (
      await request(
        recordPath,
        'PUT',
        { ...input, patientId: otherPatient.id, version: 2 },
        clinical,
      )
    ).status,
    400,
    'Cannot move clinical record to another patient',
  );
  assert.equal(
    (
      await request(
        recordPath,
        'PUT',
        { ...input, kind: 'treatment', procedures: 'Synthetic', version: 2 },
        clinical,
      )
    ).status,
    400,
    'Cannot change record type',
  );
  const treatment = await request(
    path,
    'POST',
    {
      ...input,
      kind: 'treatment',
      clinicalNotes: null,
      procedures: 'Synthetic API restoration',
      appointmentId: linked.id,
    },
    clinical,
  );
  assert.equal(treatment.status, 201);
  assert.equal(
    (
      await request(
        `/api/appointments/${linked.id}`,
        'PUT',
        {
          patientId: otherPatient.id,
          dentistId: linked.dentistId,
          startAt: linked.startAt.toISOString(),
          endAt: linked.endAt.toISOString(),
          status: linked.status,
          notes: linked.notes,
        },
        admin,
      )
    ).status,
    409,
    'Linked appointment patient reassignment blocked',
  );
  assert.equal(
    (
      await request(
        `/api/appointments/${linked.id}`,
        'DELETE',
        undefined,
        admin,
      )
    ).status,
    409,
    'Linked appointment deletion blocked',
  );
  assert.equal(
    (
      await request(
        `${path}?patientId=${patient.id}&kind=treatment`,
        'GET',
        undefined,
        clinical,
      )
    ).status,
    200,
  );
  await db
    .update(user)
    .set({ isDentist: false })
    .where(eq(user.id, dentist.id));
  for (const method of ['GET', 'PUT'])
    assert.equal(
      (
        await request(
          recordPath,
          method,
          method === 'PUT' ? { ...input, version: 2 } : undefined,
          clinical,
        )
      ).status,
      403,
      'Revoked designation is enforced for an existing session',
    );
  assert.equal(
    (await request(path, 'POST', input, otherClinical)).status,
    400,
    'Unavailable responsible dentist',
  );
  // Corrections retain historical references to a retired dentist.
  assert.equal(
    (
      await request(
        recordPath,
        'PUT',
        { ...input, clinicalNotes: 'Retained retired dentist', version: 2 },
        otherClinical,
      )
    ).status,
    200,
  );
  await db
    .update(user)
    .set({ isDentist: true, banned: true })
    .where(eq(user.id, dentist.id));
  assert.equal(
    (await request(recordPath, 'GET', undefined, clinical)).status,
    403,
    'Banned clinical user denied',
  );
  await db.update(user).set({ banned: false }).where(eq(user.id, dentist.id));
  await db
    .update(patients)
    .set({ archivedAt: new Date() })
    .where(eq(patients.id, patient.id));
  assert.equal(
    (await request(path, 'POST', input, clinical)).status,
    400,
    'No new records for archived patient',
  );
  assert.equal(
    (await request(recordPath, 'GET', undefined, clinical)).status,
    200,
    'Archived history readable',
  );
  assert.equal(
    (
      await request(
        recordPath,
        'PUT',
        { ...input, clinicalNotes: 'Archived correction', version: 3 },
        otherClinical,
      )
    ).status,
    200,
    'Archived history corrections retain revisions',
  );
  // A deliberate history constraint failure must roll back the current write.
  await assert.rejects(
    db
      .insert(dentalRecordHistory)
      .values({
        recordId: record.id,
        version: 5,
        snapshot: input,
        changedBy: second.id,
        changedAt: new Date(),
      })
      .then(async () => {
        await db
          .update(dentalRecords)
          .set({
            version: 5,
            updatedBy: second.id,
            clinicalNotes: 'Must roll back',
          })
          .where(eq(dentalRecords.id, record.id));
      }),
  );
  assert.equal(
    (
      await db
        .select()
        .from(dentalRecords)
        .where(eq(dentalRecords.id, record.id))
    )[0]?.version,
    4,
    'Audit failure rolls back clinical edit',
  );
  await db
    .delete(dentalRecordHistory)
    .where(
      and(
        eq(dentalRecordHistory.recordId, record.id),
        eq(dentalRecordHistory.version, 5),
      ),
    );
  await assert.rejects(
    db.delete(dentalRecords).where(eq(dentalRecords.id, record.id)),
    'History FK blocks accidental record deletion',
  );
  console.log(
    'PASS: live clinical CRUD, full atomic audit history, concurrent edit conflict, validation, FDI notation, appointment integrity, archived/retired references, clinical permissions/revocation, CSRF, and deletion protection.',
  );
}
main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) console.error(error.message);
  console.error(
    'Clinical smoke verification failed; private provider details suppressed. Fixtures remain for inspection/cleanup.',
  );
  process.exitCode = 1;
});
