import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import handler from '../api/index';
import { createAuth } from '../server/features/auth/auth';

vi.mock('../server/features/auth/auth', () => ({
  createAuth: vi.fn(() => ({
    api: { getSession: async () => null },
  })),
}));

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => vi.unstubAllEnvs());

it('serves health through the Vercel entry point without database access', async () => {
  const response = await handler.fetch(
    new Request('https://clinic.example/api/health'),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(createAuth).not.toHaveBeenCalled();
});

it('passes Vercel environment variables to the existing protected API', async () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://example.test/clinic');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-with-at-least-32-characters');
  vi.stubEnv('BETTER_AUTH_URL', 'https://clinic.example');
  const response = await handler.fetch(
    new Request('https://clinic.example/api/session'),
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Authentication required' });
  expect(createAuth).toHaveBeenCalledWith({
    DATABASE_URL: 'postgresql://example.test/clinic',
    BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
    BETTER_AUTH_URL: 'https://clinic.example',
  });
});

it('uses the exact Vercel preview origin instead of a production auth URL', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', 'clinic-abc-aamuros-projects.vercel.app');
  vi.stubEnv(
    'VERCEL_BRANCH_URL',
    'clinic-git-migration-aamuros-projects.vercel.app',
  );
  vi.stubEnv('BETTER_AUTH_URL', 'https://clinic.example');
  await handler.fetch(
    new Request(
      'https://clinic-git-migration-aamuros-projects.vercel.app/api/session',
    ),
  );
  expect(createAuth).toHaveBeenCalledWith(
    expect.objectContaining({
      BETTER_AUTH_URL:
        'https://clinic-git-migration-aamuros-projects.vercel.app',
    }),
  );
});

it('does not trust an arbitrary Host or Origin on a preview', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', 'clinic-abc-aamuros-projects.vercel.app');
  vi.stubEnv('BETTER_AUTH_URL', 'https://clinic.example');
  const response = await handler.fetch(
    new Request('https://attacker.example/api/auth/sign-out', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'Untrusted request origin' });
});

it('rejects the production origin for preview mutations', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', 'clinic-abc-aamuros-projects.vercel.app');
  vi.stubEnv('BETTER_AUTH_URL', 'https://clinic.example');
  const response = await handler.fetch(
    new Request(
      'https://clinic-abc-aamuros-projects.vercel.app/api/auth/sign-out',
      {
        method: 'POST',
        headers: { Origin: 'https://clinic.example' },
      },
    ),
  );
  expect(response.status).toBe(403);
});
