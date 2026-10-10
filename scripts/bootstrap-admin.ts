import { developmentEnv } from './development-env.js';
import assert from 'node:assert/strict';
import { createAuth } from '../server/features/auth/auth';
import { createDatabase } from '../server/db/client';
import { user } from '../server/db/schema';

// Operator-only first-account setup. There is no HTTP bootstrap endpoint.
async function bootstrap() {
  const env = developmentEnv(
    process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:5173',
  );
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
