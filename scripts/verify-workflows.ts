import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../server/db/client.js';
import { appointments, patients, user } from '../server/db/schema.js';
import { developmentEnv } from './development-env.js';
import { verificationHeaders } from './verification-headers.js';

const origin = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:4180';
const db = createDatabase(developmentEnv(origin));
const execute = promisify(execFile);
async function fixture(feature: string, action: string) {
  // Fixture commands sanitize provider errors before emitting diagnostics.
  try {
    await execute(
      process.execPath,
      ['--import', 'tsx', `scripts/${feature}-smoke-data.ts`, action],
      { env: process.env },
    );
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
    )
      console.error(error.stderr.trim());
    throw new Error(`Synthetic ${feature} ${action} failed`, { cause: error });
  }
}
function state(feature: string): { run: string; password: string } {
  return JSON.parse(readFileSync(`.local/${feature}-smoke.json`, 'utf8'));
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      ...verificationHeaders(origin),
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
}

const seeded: string[] = [];
try {
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal((await request('/api/session')).status, 401);
  assert.equal((await request('/api/patients')).status, 401);
  if (origin.startsWith('https:')) {
    // Vercel overwrites test IP headers. Repeated runs share the real client
    // bucket, so let earlier verification logins expire before this suite.
    console.log(
      'Waiting for the preview login rate window before synthetic verification',
    );
    await setTimeout(61000);
  }
  for (const feature of ['appointment', 'dental-record'])
    assert.ok(
      !existsSync(`.local/${feature}-smoke.json`),
      'Clean up prior fixture runs first',
    );
  for (const feature of ['appointment', 'dental-record']) {
    seeded.push(feature);
    await fixture(feature, 'seed');
  }
  const appointment = state('appointment');
  const login = await request('/api/auth/sign-in/email', 'POST', {
    email: `appointment-smoke-${appointment.run}-admin@example.test`,
    password: appointment.password,
  });
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (cookie) => /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie),
    ),
  );
  if (origin.startsWith('https:'))
    assert.ok(cookies.some((cookie) => /; Secure/i.test(cookie)));
  const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
  const details = {
    name: `Synthetic Appointment Patient ${appointment.run}`,
    birthDate: '1990-05-17',
    contactNumber: '09171111111',
    email: `appointment-patient-${appointment.run}@example.test`,
  };
  const created = await request('/api/patients', 'POST', details, cookie);
  assert.equal(created.status, 201);
  const data: { patient: { id: string } } = await created.json();
  assert.equal(
    (
      await request(
        `/api/patients/${data.patient.id}`,
        'PUT',
        { ...details, contactNumber: '09172222222' },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/api/patients/${data.patient.id}`,
        'GET',
        undefined,
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        '/api/auth/admin/create-user',
        'POST',
        {
          name: 'Synthetic dentist',
          email: `appointment-smoke-${appointment.run}-dentist@example.test`,
          password: appointment.password,
          role: 'staff',
          data: { isDentist: true },
        },
        cookie,
      )
    ).status,
    200,
  );
  await fixture('appointment', 'verify');
  console.log('PASS: patient create/edit/reload and scheduling workflows');
  // Retain the real five-logins-per-minute rule across the two fixture suites.
  await setTimeout(61000);
  const clinical = state('dental-record');
  const [clinicalPatient] = await db
    .insert(patients)
    .values({
      name: `Synthetic Clinical Patient ${clinical.run}`,
      birthDate: '1990-05-17',
      contactNumber: '09171111111',
      email: `clinical-patient-${clinical.run}@example.test`,
    })
    .returning();
  const [clinicalDentist] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      eq(user.email, `clinical-smoke-${clinical.run}-dentist@example.test`),
    );
  assert.ok(clinicalPatient && clinicalDentist);
  await db.insert(appointments).values({
    patientId: clinicalPatient.id,
    dentistId: clinicalDentist.id,
    startAt: new Date('2026-10-14T01:00:00Z'),
    endAt: new Date('2026-10-14T02:00:00Z'),
    status: 'completed',
    notes: `Synthetic clinical link ${clinical.run}`,
  });
  await fixture('dental-record', 'verify');
  const archiveLogin = await request('/api/auth/sign-in/email', 'POST', {
    email: `appointment-smoke-${appointment.run}-admin@example.test`,
    password: appointment.password,
  });
  assert.equal(archiveLogin.status, 200);
  const archiveCookie = archiveLogin.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.equal(
    (
      await request(
        `/api/patients/${data.patient.id}/archive`,
        'POST',
        {},
        archiveCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request('/api/auth/sign-out', 'POST', {}, archiveCookie)).status,
    200,
  );
  assert.equal(
    (await request('/api/session', 'GET', undefined, archiveCookie)).status,
    401,
  );
  console.log(
    'PASS: clinical revisions, staff/clinical permissions, patient archive and session revocation',
  );
} catch {
  console.error(
    'Workflow verification failed; provider details and credentials suppressed.',
  );
  process.exitCode = 1;
} finally {
  for (const feature of seeded.reverse()) {
    try {
      await fixture(feature, 'cleanup');
    } catch {
      console.error(
        `Synthetic ${feature} cleanup failed; retain local fixture state for inspection.`,
      );
      process.exitCode = 1;
    }
  }
}
