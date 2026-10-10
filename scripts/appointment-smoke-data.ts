import { verificationHeaders } from './verification-headers.js';
import { developmentEnv } from './development-env.js';
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
import { and, eq, inArray, like } from 'drizzle-orm';
import { createDatabase } from '../server/db/client';
import { appointments, patients, user } from '../server/db/schema';
import { createAuth } from '../server/features/auth/auth';

// Operator-only synthetic fixtures. Never included in the application.
const statePath = '.local/appointment-smoke.json';
const origin = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:4180';

function readState() {
  const data: unknown = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.ok(
    data &&
      typeof data === 'object' &&
      'run' in data &&
      typeof data.run === 'string' &&
      /^[a-f0-9-]{36}$/.test(data.run) &&
      'password' in data &&
      typeof data.password === 'string',
  );
  return { run: data.run, password: data.password };
}
async function main() {
  const env = developmentEnv(origin);
  const action = process.argv[2];
  if (action === 'migrate') {
    // The runtime checks above confirm both URLs before invoking the existing
    // direct-connection Drizzle migrator with explicit development credentials.
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
    assert.ok(!existsSync(statePath), 'Clean up existing fixtures first');
    const state = {
      run: randomUUID(),
      password: Array.from(randomBytes(32), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    };
    mkdirSync('.local', { recursive: true });
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    for (const role of ['admin', 'staff'] as const)
      await createAuth(env).api.createUser({
        body: {
          name: `Synthetic ${role}`,
          email: `appointment-smoke-${state.run}-${role}@example.test`,
          password: state.password,
          role,
        },
      });
    console.log(
      'Synthetic admin/staff fixtures created; credentials are in ignored local state.',
    );
    return;
  }
  const state = readState();
  const prefix = `appointment-smoke-${state.run}-`;
  const patientName = `Synthetic Appointment Patient ${state.run}`;
  const patientEmail = `appointment-patient-${state.run}@example.test`;
  const fixturePatients = await db
    .select()
    .from(patients)
    .where(
      and(eq(patients.name, patientName), eq(patients.email, patientEmail)),
    );
  const fixtureUsers = await db
    .select()
    .from(user)
    .where(like(user.email, `${prefix}%`));
  if (action === 'check') {
    assert.equal(fixturePatients.length, 1, 'Expected browser-created patient');
    const patient = fixturePatients[0];
    assert.ok(patient);
    const dentist = fixtureUsers.find(
      (record) => record.email === `${prefix}dentist@example.test`,
    );
    assert.ok(
      dentist?.isDentist,
      'Browser-created dentist designation must persist',
    );
    const records = await db
      .select()
      .from(appointments)
      .where(eq(appointments.patientId, patient.id));
    const browser = records.find(
      (record) => record.notes === `Browser appointment ${state.run}`,
    );
    assert.ok(browser);
    assert.equal(browser.dentistId, dentist.id);
    assert.equal(browser.startAt.toISOString(), '2026-10-12T02:00:00.000Z');
    assert.equal(browser.endAt.toISOString(), '2026-10-12T03:00:00.000Z');
    assert.equal(browser.status, 'cancelled');
    assert.ok(browser.updatedAt >= browser.createdAt);
    console.log(
      'PASS: browser patient, dentist designation, UTC reschedule, notes, cancelled status and timestamps persisted in Neon development.',
    );
    return;
  }
  if (action === 'verify') {
    const patient = fixturePatients[0];
    assert.ok(patient, 'Create the synthetic patient in the browser first');
    const dentist = fixtureUsers.find(
      (record) => record.email === `${prefix}dentist@example.test`,
    );
    assert.ok(dentist?.isDentist);
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
          ...verificationHeaders(origin),
          'Content-Type': 'application/json',
          ...(requestOrigin ? { Origin: requestOrigin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      });
    }
    async function login(role: string) {
      const response = await request('/api/auth/sign-in/email', 'POST', {
        email: `${prefix}${role}@example.test`,
        password: state.password,
      });
      assert.equal(response.status, 200, `${role} login`);
      return response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    }
    const staffCookie = await login('staff');
    const adminCookie = await login('admin');
    const base = {
      patientId: patient.id,
      dentistId: dentist.id,
      startAt: '2026-10-13T01:00:00.000Z',
      endAt: '2026-10-13T02:00:00.000Z',
      status: 'scheduled',
      notes: `API appointment ${state.run}`,
    };
    const path = '/api/appointments';
    async function create(body = base) {
      return request(path, 'POST', body, staffCookie);
    }
    const bookingResponses = await Promise.all([create(), create()]);
    assert.deepEqual(
      bookingResponses.map((response) => response.status).sort(),
      [201, 409],
      'Concurrent booking must have exactly one winner',
    );
    let bookedId = '';
    for (const response of bookingResponses)
      if (response.status === 201) {
        const data = (await response.json()) as { appointment: { id: string } };
        bookedId = data.appointment.id;
      }
    assert.ok(bookedId);
    assert.equal(
      (
        await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.patientId, patient.id),
              eq(appointments.dentistId, dentist.id),
              eq(appointments.startAt, new Date(base.startAt)),
            ),
          )
      ).length,
      1,
      'Only one concurrent booking persisted',
    );
    const bookedPath = `${path}/${bookedId}`;
    for (const [startAt, endAt] of [
      ['2026-10-13T00:30:00Z', '2026-10-13T01:30:00Z'],
      ['2026-10-13T01:15:00Z', '2026-10-13T01:45:00Z'],
      ['2026-10-13T00:30:00Z', '2026-10-13T02:30:00Z'],
      ['2026-10-13T01:30:00Z', '2026-10-13T02:30:00Z'],
    ] as const)
      assert.equal(
        (await create({ ...base, startAt, endAt })).status,
        409,
        'Partial, contained and encompassing overlaps',
      );
    assert.equal(
      (
        await create({
          ...base,
          startAt: base.endAt,
          endAt: '2026-10-13T03:00:00.000Z',
        })
      ).status,
      201,
      'Back-to-back bookings',
    );
    assert.equal(
      (
        await request(
          bookedPath,
          'PUT',
          { ...base, startAt: base.endAt, endAt: '2026-10-13T03:00:00.000Z' },
          staffCookie,
        )
      ).status,
      409,
      'Reschedule must enforce conflict',
    );
    for (const status of ['completed', 'no-show', 'scheduled']) {
      assert.equal(
        (await request(bookedPath, 'PUT', { ...base, status }, staffCookie))
          .status,
        200,
        'Status update',
      );
      assert.equal(
        (await create()).status,
        409,
        'Non-cancelled history retains its slot',
      );
    }
    assert.equal(
      (await request(`${bookedPath}/cancel`, 'POST', undefined, staffCookie))
        .status,
      200,
    );
    const cancelledBefore = (
      await db.select().from(appointments).where(eq(appointments.id, bookedId))
    )[0];
    assert.ok(cancelledBefore);
    assert.equal(
      (await request(`${bookedPath}/cancel`, 'POST', undefined, staffCookie))
        .status,
      200,
    );
    const cancelledAfter = (
      await db.select().from(appointments).where(eq(appointments.id, bookedId))
    )[0];
    assert.ok(cancelledAfter);
    assert.equal(
      cancelledAfter.updatedAt.toISOString(),
      cancelledBefore.updatedAt.toISOString(),
      'Repeat cancellation preserves timestamp',
    );
    assert.equal((await create()).status, 201, 'Cancellation releases slot');
    assert.equal(
      (await request(bookedPath, 'PUT', base, staffCookie)).status,
      409,
      'Reopening cancelled appointment checks conflicts',
    );
    assert.equal(
      (await request(bookedPath, 'DELETE', undefined, staffCookie)).status,
      403,
    );
    for (const body of [
      { ...base, endAt: base.startAt },
      { ...base, status: 'pending' },
      {
        ...base,
        dentistId:
          fixtureUsers.find(
            (record) => record.email === `${prefix}staff@example.test`,
          )?.id ?? '',
      },
      { ...base, notes: 'x'.repeat(2001) },
    ])
      assert.equal(
        (await create(body)).status,
        400,
        'Input/reference validation',
      );
    for (const [suffix, method] of [
      ['', 'GET'],
      ['', 'POST'],
      [`/${bookedId}`, 'GET'],
      [`/${bookedId}`, 'PUT'],
      [`/${bookedId}/cancel`, 'POST'],
      [`/${bookedId}`, 'DELETE'],
    ])
      assert.equal(
        (
          await request(
            `${path}${suffix}`,
            method,
            method === 'POST' || method === 'PUT' ? base : undefined,
          )
        ).status,
        401,
      );
    assert.equal(
      (
        await request(
          path,
          'POST',
          base,
          staffCookie,
          'https://hostile.example.test',
        )
      ).status,
      403,
    );
    assert.equal(
      (await request(path, 'POST', base, staffCookie, null)).status,
      403,
    );
    const invalidDentist = await request(
      '/api/auth/admin/create-user',
      'POST',
      {
        name: 'Synthetic other dentist',
        email: `${prefix}other-dentist@example.test`,
        password: state.password,
        role: 'staff',
        data: { isDentist: true },
      },
      adminCookie,
    );
    assert.equal(invalidDentist.status, 200);
    const other = await db
      .select()
      .from(user)
      .where(eq(user.email, `${prefix}other-dentist@example.test`));
    assert.ok(other[0]);
    assert.equal(
      (await create({ ...base, dentistId: other[0].id })).status,
      201,
      'Different dentists may book the same time',
    );
    assert.equal(
      (await request(`${path}/staff`, 'GET', undefined, staffCookie)).status,
      403,
    );
    assert.equal(
      (
        await request(
          `${path}/dentists/${other[0].id}`,
          'PUT',
          { isDentist: false },
          staffCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `${path}/dentists/${other[0].id}`,
          'PUT',
          { isDentist: false },
          adminCookie,
        )
      ).status,
      200,
    );
    const newTime = {
      ...base,
      dentistId: other[0].id,
      startAt: '2026-10-14T01:00:00Z',
      endAt: '2026-10-14T02:00:00Z',
    };
    assert.equal(
      (await create(newTime)).status,
      400,
      'Removed designation cannot book',
    );
    assert.equal(
      (
        await request(
          `${path}/dentists/${other[0].id}`,
          'PUT',
          { isDentist: true },
          adminCookie,
        )
      ).status,
      200,
    );
    await db.update(user).set({ banned: true }).where(eq(user.id, other[0].id));
    assert.equal(
      (await create(newTime)).status,
      400,
      'Banned dentist cannot book',
    );
    await db
      .update(user)
      .set({ banned: false })
      .where(eq(user.id, other[0].id));
    const rescheduleIds: string[] = [];
    for (const [startAt, endAt] of [
      ['2026-10-16T01:00:00Z', '2026-10-16T02:00:00Z'],
      ['2026-10-16T03:00:00Z', '2026-10-16T04:00:00Z'],
    ] as const) {
      const response = await create({ ...base, startAt, endAt });
      assert.equal(response.status, 201);
      const data = (await response.json()) as { appointment: { id: string } };
      rescheduleIds.push(data.appointment.id);
    }
    const reschedules = await Promise.all(
      rescheduleIds.map((id) =>
        request(
          `${path}/${id}`,
          'PUT',
          {
            ...base,
            startAt: '2026-10-16T05:00:00Z',
            endAt: '2026-10-16T06:00:00Z',
          },
          staffCookie,
        ),
      ),
    );
    assert.deepEqual(
      reschedules.map((response) => response.status).sort(),
      [200, 409],
      'Concurrent reschedules must have exactly one winner',
    );
    const crossMidnight = {
      ...base,
      startAt: '2026-10-14T15:30:00Z',
      endAt: '2026-10-14T16:30:00Z',
    };
    assert.equal((await create(crossMidnight)).status, 201);
    const dateResponse = await request(
      `${path}?from=2026-10-15&to=2026-10-16`,
      'GET',
      undefined,
      staffCookie,
    );
    assert.equal(dateResponse.status, 200);
    const day = (await dateResponse.json()) as {
      appointments: { startAt: string }[];
    };
    assert.ok(
      day.appointments.some(
        (appointment) => appointment.startAt === '2026-10-14T15:30:00.000Z',
      ),
      'Manila day includes crossing-midnight appointments',
    );
    assert.equal(
      (
        await request(
          `/api/patients/${patient.id}/archive`,
          'POST',
          undefined,
          adminCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await create({
          ...base,
          startAt: '2026-10-20T01:00:00Z',
          endAt: '2026-10-20T02:00:00Z',
        })
      ).status,
      400,
      'Archived patient cannot book',
    );
    // Existing history may change status/notes, while rescheduling archived patients is denied.
    assert.equal(
      (
        await request(
          bookedPath,
          'PUT',
          { ...base, status: 'cancelled', notes: 'Archived history' },
          staffCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          bookedPath,
          'PUT',
          {
            ...base,
            startAt: '2026-10-20T01:00:00Z',
            endAt: '2026-10-20T02:00:00Z',
          },
          staffCookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request(bookedPath, 'DELETE', undefined, adminCookie)).status,
      204,
    );
    assert.equal(
      (await request(bookedPath, 'GET', undefined, staffCookie)).status,
      404,
    );
    console.log(
      'PASS: live Node.js CRUD, simultaneous booking conflict, overlap variants, adjacent/different-dentist bookings, reschedule conflict, all statuses, cancellation/reopening, Manila midnight filtering, validation, archive rules, permissions and CSRF.',
    );
    return;
  }
  if (action === 'cleanup') {
    if (fixturePatients.length) {
      const ids = fixturePatients.map((record) => record.id);
      await db.delete(appointments).where(inArray(appointments.patientId, ids));
      await db.delete(patients).where(inArray(patients.id, ids));
    }
    if (fixtureUsers.length) {
      const ids = fixtureUsers.map((record) => record.id);
      await db.delete(appointments).where(inArray(appointments.dentistId, ids));
      await db.delete(user).where(inArray(user.id, ids));
    }
    assert.equal(
      (
        await db
          .select({ id: user.id })
          .from(user)
          .where(like(user.email, `${prefix}%`))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select({ id: patients.id })
          .from(patients)
          .where(eq(patients.email, patientEmail))
      ).length,
      0,
    );
    unlinkSync(statePath);
    console.log(
      'Synthetic appointments, patients, staff and associated auth sessions removed.',
    );
    return;
  }
  throw new Error('Use migrate, seed, check, verify or cleanup');
}
try {
  await main();
} catch (error) {
  // Assertions contain synthetic expectations only; provider errors stay hidden.
  console.error(
    error instanceof assert.AssertionError
      ? `Appointment verification failed: ${error.message}`
      : 'Appointment operation failed. Check development configuration and synthetic fixture state.',
  );
  process.exitCode = 1;
}
