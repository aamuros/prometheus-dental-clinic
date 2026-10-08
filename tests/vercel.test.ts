import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import handler from '../api/index';
import { createAuth } from '../worker/features/auth/auth';

vi.mock('../worker/features/auth/auth', () => ({
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
