import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createAuth } from '../worker/features/auth/auth';
import { createDatabase } from '../worker/db/client';
import { user } from '../worker/db/schema';

// Operator-only first-account setup. There is no HTTP bootstrap endpoint.
async function bootstrap() {
  const context: unknown = JSON.parse(readFileSync('.neon', 'utf8'));
  assert.ok(
    context &&
      typeof context === 'object' &&
      'branch' in context &&
      context.branch === 'development',
    'Select the development branch',
  );
  const development = parseEnv(readFileSync('.env.local', 'utf8'));
  assert.equal(development.NEON_BRANCH, 'development');
  const local = parseEnv(readFileSync('.dev.vars', 'utf8'));
  assert.ok(
    local.DATABASE_URL && local.BETTER_AUTH_SECRET && local.BETTER_AUTH_URL,
    'Configure local Worker secrets first',
  );
  assert.equal(
    local.DATABASE_URL,
    development.DATABASE_URL,
    'Development database mismatch',
  );
  for (const source of [
    process.env,
    ...(existsSync('.env') ? [parseEnv(readFileSync('.env', 'utf8'))] : []),
  ]) {
    assert.ok(
      !source.DATABASE_URL || source.DATABASE_URL === local.DATABASE_URL,
      'Database override mismatch',
    );
  }
  const name = process.env.AUTH_BOOTSTRAP_NAME;
  const email = process.env.AUTH_BOOTSTRAP_EMAIL;
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD;
  assert.ok(
    name && email && password,
    'Supply bootstrap name, email and password',
  );
  assert.ok(
    name?.trim() &&
      name.length <= 100 &&
      email &&
      email.length <= 254 &&
      password &&
      password.length >= 12 &&
      password.length <= 128,
    'Supply bootstrap name, email and a 12–128 character password',
  );
  const env = {
    DATABASE_URL: local.DATABASE_URL,
    BETTER_AUTH_SECRET: local.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: local.BETTER_AUTH_URL,
  };
  assert.equal(
    (await createDatabase(env).select({ id: user.id }).from(user).limit(1))
      .length,
    0,
    'Bootstrap is allowed only for an empty account table',
  );
  await createAuth(env).api.createUser({
    body: { name, email, password, role: 'admin' },
  });
  console.log(
    'Development administrator created. Sign in using the supplied credentials.',
  );
}

try {
  await bootstrap();
} catch {
  console.error(
    'Administrator bootstrap failed. Check development configuration, account table and bootstrap values.',
  );
  process.exitCode = 1;
}
