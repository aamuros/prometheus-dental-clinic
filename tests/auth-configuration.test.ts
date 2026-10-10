import { beforeEach, expect, it, vi } from 'vitest';
import { app } from '../server/app';
import type { ServerEnv } from '../server/env';
import { createAuth } from '../server/features/auth/auth';

const env: ServerEnv = {
  DATABASE_URL: 'postgresql://test:test@example.test/clinic',
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
  BETTER_AUTH_URL: 'https://clinic.example',
};

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', () => {
    throw new Error('Unexpected network access');
  });
});

it.each([
  ['BETTER_AUTH_SECRET', '', 'missing'],
  ['BETTER_AUTH_SECRET', 'short-private-secret', 'invalid'],
  ['BETTER_AUTH_URL', '', 'missing'],
  [
    'BETTER_AUTH_URL',
    'https://private:password@clinic.example/path',
    'invalid',
  ],
  ['BETTER_AUTH_URL', 'http://clinic.example', 'invalid'],
  ['DATABASE_URL', '', 'missing'],
  ['DATABASE_URL', 'private-database-credentials', 'invalid'],
  ['DATABASE_URL', 'https://private:password@example.test/clinic', 'invalid'],
] as const)(
  'diagnoses %s configuration (%s) without disclosing values',
  async (variable, value, reason) => {
    for (const path of ['/api/auth/get-session', '/api/session']) {
      const response = await app.request(
        `${env.BETTER_AUTH_URL}${path}?token=private`,
        {},
        { ...env, [variable]: value },
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenLastCalledWith(
        JSON.stringify({
          event: 'server_error',
          code: 'SERVER_CONFIGURATION_INVALID',
          variable,
          reason,
          method: 'GET',
          status: 500,
        }),
      );
    }
  },
);

it('initializes the real Drizzle auth adapter and denies anonymous sessions without database access', async () => {
  const auth = createAuth(env);
  expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  const response = await app.request(
    `${env.BETTER_AUTH_URL}/api/session`,
    {},
    env,
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Authentication required' });
  expect(console.error).not.toHaveBeenCalled();
});

it('keeps health available when authentication is not configured', async () => {
  const response = await app.request(
    '/api/health',
    {},
    { DATABASE_URL: '', BETTER_AUTH_SECRET: '', BETTER_AUTH_URL: '' },
  );
  expect(response.status).toBe(200);
  expect(console.error).not.toHaveBeenCalled();
});

it('diagnoses a rejected login origin without logging request data', async () => {
  const response = await app.request(
    `${env.BETTER_AUTH_URL}/api/auth/sign-in/email`,
    {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'private@example.test',
        password: 'private-password',
      }),
    },
    env,
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'Untrusted request origin' });
  expect(console.warn).toHaveBeenCalledWith(
    JSON.stringify({
      event: 'auth_origin_rejected',
      code: 'AUTH_ORIGIN_REJECTED',
      method: 'POST',
      status: 403,
    }),
  );
});
