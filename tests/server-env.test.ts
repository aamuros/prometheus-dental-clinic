import { expect, it } from 'vitest';
import { serverEnv } from '../server/env';
import { authOptions } from '../server/features/auth/auth';

const production = {
  VERCEL_ENV: 'production',
  VERCEL_PROJECT_PRODUCTION_URL: 'prometheus-dental-clinic.vercel.app',
  BETTER_AUTH_URL: 'https://obsolete.example.test/',
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
  DATABASE_URL: 'postgresql://example.test/clinic',
};
const origin = 'https://prometheus-dental-clinic.vercel.app';

it('uses the platform production domain when the configured auth URL is stale', () => {
  const env = serverEnv(production, origin);
  expect(env.BETTER_AUTH_URL).toBe(origin);
  expect(() => authOptions(env)).not.toThrow();
});

it('uses the platform production domain when no auth URL is configured', () => {
  expect(
    serverEnv({ ...production, BETTER_AUTH_URL: undefined }, origin)
      .BETTER_AUTH_URL,
  ).toBe(origin);
});

it('retains the explicitly configured custom production origin', () => {
  expect(
    serverEnv(
      { ...production, BETTER_AUTH_URL: 'https://clinic.example.test' },
      'https://clinic.example.test',
    ).BETTER_AUTH_URL,
  ).toBe('https://clinic.example.test');
});

it('does not select an untrusted request origin in production', () => {
  const env = serverEnv(
    { ...production, BETTER_AUTH_URL: 'https://clinic.example.test' },
    'https://attacker.example.test',
  );
  expect(env.BETTER_AUTH_URL).toBe('https://clinic.example.test');
});

it.each([
  'attacker.example/path',
  'attacker.example@clinic.example',
  'clinic.example:443',
  '*.example.test',
])('does not trust a malformed platform production host: %s', (host) => {
  const env = serverEnv(
    {
      ...production,
      VERCEL_PROJECT_PRODUCTION_URL: host,
      BETTER_AUTH_URL: 'https://clinic.example.test',
    },
    'https://attacker.example',
  );
  expect(env.BETTER_AUTH_URL).toBe('https://clinic.example.test');
});

it('does not use production metadata in local development', () => {
  expect(
    serverEnv(
      {
        ...production,
        VERCEL_ENV: undefined,
        BETTER_AUTH_URL: 'http://127.0.0.1:5173',
      },
      origin,
    ).BETTER_AUTH_URL,
  ).toBe('http://127.0.0.1:5173');
});
