import assert from 'node:assert/strict';
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
import { patients, user } from '../worker/db/schema';
import { createAuth } from '../worker/features/auth/auth';

// Synthetic fixtures only, driven from an authorized developer's terminal.
// No fixture/cleanup endpoint is included in the application Worker.
const statePath = '.wrangler/patient-smoke.json';

function developmentEnv() {
  const context: unknown = JSON.parse(readFileSync('.neon', 'utf8'));
  assert.ok(
    context &&
      typeof context === 'object' &&
      'branch' in context &&
      context.branch === 'development',
    'Select development first',
  );
  const development = parseEnv(readFileSync('.env.local', 'utf8'));
  const local = parseEnv(readFileSync('.dev.vars', 'utf8'));
  assert.equal(development.NEON_BRANCH, 'development');
  assert.ok(local.DATABASE_URL && local.BETTER_AUTH_SECRET);
  assert.equal(
    local.DATABASE_URL,
    development.DATABASE_URL,
    'Database binding mismatch',
  );
  for (const source of [
    process.env,
    ...(existsSync('.env') ? [parseEnv(readFileSync('.env', 'utf8'))] : []),
  ]) {
    for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED'])
      assert.ok(
        !source[key] || source[key] === development[key],
        'Database override mismatch',
      );
  }
  return {
    DATABASE_URL: local.DATABASE_URL,
    BETTER_AUTH_SECRET: local.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: 'http://127.0.0.1:4180',
  };
}

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
    'Invalid synthetic fixture state',
  );
  return { run: data.run, password: data.password };
}

async function main() {
  const env = developmentEnv();
  const db = createDatabase(env);
  const action = process.argv[2];
  if (action === 'seed') {
    assert.ok(!existsSync(statePath), 'Clean up existing smoke fixtures first');
    const state = {
      run: randomUUID(),
      password: Array.from(randomBytes(32), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    };
    mkdirSync('.wrangler', { recursive: true });
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    for (const role of ['admin', 'staff'] as const) {
      await createAuth(env).api.createUser({
        body: {
          name: 'Synthetic verification account',
          email: `patient-smoke-${state.run}-${role}@example.test`,
          password: state.password,
          role,
        },
      });
    }
    console.log(
      'Synthetic admin/staff fixtures created; credentials are in ignored local state.',
    );
    return;
  }
  const state = readState();
  const emailPrefix = `patient-smoke-${state.run}-`;
  const patientName = `Synthetic Patient ${state.run}`;
  if (action === 'check') {
    const records = await db
      .select()
      .from(patients)
      .where(eq(patients.name, patientName));
    assert.equal(records.length, 1, 'Expected one browser-created patient');
    const patient = records[0];
    assert.ok(patient);
    assert.equal(patient.birthDate, '1990-05-17');
    assert.equal(
      patient.contactNumber,
      '09171111111',
      'Browser edit must persist',
    );
    assert.equal(patient.email, `patient-${state.run}@example.test`);
    assert.ok(
      patient.archivedAt instanceof Date,
      'Browser archive must persist without deleting',
    );
    assert.ok(patient.updatedAt >= patient.createdAt);
    console.log(
      'PASS: browser-created patient, edited contact number, retained archived record and timestamps persisted in Neon development.',
    );
    return;
  }
  if (action === 'cleanup') {
    await db
      .delete(patients)
      .where(
        and(
          eq(patients.name, patientName),
          eq(patients.email, `patient-${state.run}@example.test`),
        ),
      );
    const accounts = await db
      .select({ id: user.id })
      .from(user)
      .where(like(user.email, `${emailPrefix}%`));
    if (accounts.length)
      await db.delete(user).where(
        inArray(
          user.id,
          accounts.map((account) => account.id),
        ),
      );
    assert.equal(
      (
        await db
          .select({ id: patients.id })
          .from(patients)
          .where(eq(patients.name, patientName))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select({ id: user.id })
          .from(user)
          .where(like(user.email, `${emailPrefix}%`))
      ).length,
      0,
    );
    unlinkSync(statePath);
    console.log(
      'Synthetic patient and staff fixtures removed; associated accounts/sessions cascaded.',
    );
    return;
  }
  throw new Error('Use seed, check or cleanup');
}

try {
  await main();
} catch {
  console.error(
    'Patient fixture operation failed. Check development configuration and synthetic fixture state.',
  );
  process.exitCode = 1;
}
