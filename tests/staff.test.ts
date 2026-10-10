import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../server/app';

const state = vi.hoisted(() => ({
  role: 'admin' as string | null,
  banned: false,
  passwordChangeRequired: false,
  execute: vi.fn(),
  batch: vi.fn(),
  hash: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('../server/db/client', () => ({
  createDatabase: () => ({ execute: state.execute, batch: state.batch }),
}));
vi.mock('../server/features/auth/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () =>
        state.role
          ? {
              session: { id: 'session-id' },
              user: {
                id: 'actor',
                name: 'Actor',
                email: 'actor@example.test',
                role: state.role,
                banned: state.banned,
                passwordChangeRequired: state.passwordChangeRequired,
              },
            }
          : null,
    },
    $context: Promise.resolve({
      password: { hash: state.hash, verify: state.verify },
    }),
  }),
}));
const origin = 'https://clinic.example.test';
const password = 'new-strong-password-123!';
function request(
  path = '',
  body?: unknown,
  requestOrigin: string | null = origin,
) {
  return app.request(
    `${origin}/api/staff${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    {
      DATABASE_URL: 'unused',
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: 'unit-test-only-secret-32-characters-long',
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.role = 'admin';
  state.banned = false;
  state.passwordChangeRequired = false;
  state.execute.mockResolvedValue({
    rows: [{ password: 'stored-hash', count: 1 }],
  });
  state.batch.mockResolvedValue([{ rows: [] }, { rows: [{ status: 'ok' }] }]);
  state.hash.mockResolvedValue('new-hash');
  state.verify.mockResolvedValue(true);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('Staff lifecycle API', () => {
  it('requires an administrator for listing and every administrative mutation', async () => {
    const paths = [
      '',
      '/employee/deactivate',
      '/employee/reactivate',
      '/employee/revoke-sessions',
      '/employee/recover-password',
    ];
    for (const role of [null, 'staff']) {
      state.role = role;
      for (const path of paths)
        expect((await request(path, path ? {} : undefined)).status).toBe(
          role ? 403 : 401,
        );
    }
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.batch).not.toHaveBeenCalled();
  });
  it('lists only safe account fields with bounded pagination', async () => {
    state.execute.mockResolvedValue({
      rows: [
        {
          id: 'employee',
          name: 'Employee',
          email: 'employee@example.test',
          role: 'staff',
          banned: true,
          isDentist: true,
          passwordChangeRequired: false,
          password: 'private-hash',
          token: 'private-token',
        },
      ],
    });
    const response = await request('?page=1');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const text = await response.text();
    expect(text).toContain('employee@example.test');
    expect(text).not.toMatch(/private|password"|token/);
    for (const query of [
      '?page=0',
      '?page=1.5',
      '?page=NaN',
      '?page=1&page=2',
      '?role=admin',
    ])
      expect((await request(query)).status).toBe(400);
  });
  it.each(['deactivate', 'reactivate', 'revoke-sessions'])(
    'allows admin %s with an empty body',
    async (action) => {
      expect((await request(`/employee/${action}`, {})).status).toBe(200);
      expect(state.batch).toHaveBeenCalledOnce();
    },
  );
  it.each(['deactivate', 'reactivate', 'revoke-sessions', 'recover-password'])(
    'protects %s against CSRF and extra fields',
    async (action) => {
      const body =
        action === 'recover-password'
          ? { currentPassword: password, newPassword: password }
          : {};
      for (const requestOrigin of [null, 'https://hostile.example.test'])
        expect(
          (await request(`/employee/${action}`, body, requestOrigin)).status,
        ).toBe(403);
      expect(
        (await request(`/employee/${action}`, { ...body, role: 'admin' }))
          .status,
      ).toBe(400);
      expect(state.batch).not.toHaveBeenCalled();
    },
  );
  it('verifies the acting administrator before recovery and returns no credential material', async () => {
    const response = await request('/employee/recover-password', {
      currentPassword: password,
      newPassword: password,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(state.verify).toHaveBeenCalledWith({
      password,
      hash: 'stored-hash',
    });
    expect(state.hash).toHaveBeenCalledWith(password);
    state.verify.mockResolvedValue(false);
    expect(
      (
        await request('/employee/recover-password', {
          currentPassword: password,
          newPassword: password,
        })
      ).status,
    ).toBe(400);
    expect(state.batch).toHaveBeenCalledOnce();
  });
  it('allows staff to change only their own password and validates credentials', async () => {
    state.role = 'staff';
    const body = {
      currentPassword: password,
      newPassword: 'different-strong-password-123!',
    };
    expect((await request('/password', body)).status).toBe(200);
    expect(
      (await request('/password', { ...body, userId: 'victim' })).status,
    ).toBe(400);
    expect(
      (await request('/password', { ...body, newPassword: 'short' })).status,
    ).toBe(400);
    expect(
      (await request('/password', { ...body, newPassword: password })).status,
    ).toBe(400);
    expect((await request('/password', body, null)).status).toBe(403);
  });
  it('limits password attempts before password verification', async () => {
    state.execute.mockResolvedValue({ rows: [{ count: 6 }] });
    const response = await request('/password', {
      currentPassword: password,
      newPassword: 'different-strong-password-123!',
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.batch).not.toHaveBeenCalled();
  });
  it('restricts recovered users to session inspection, password change and logout', async () => {
    state.role = 'staff';
    state.passwordChangeRequired = true;
    expect(
      (
        await app.request(
          `${origin}/api/session`,
          {},
          { DATABASE_URL: 'unused' },
        )
      ).status,
    ).toBe(200);
    for (const path of [
      '/api/patients',
      '/api/appointments',
      '/api/dental-records',
    ])
      expect(
        (await app.request(`${origin}${path}`, {}, { DATABASE_URL: 'unused' }))
          .status,
      ).toBe(403);
    expect(
      (
        await request('/password', {
          currentPassword: password,
          newPassword: 'different-strong-password-123!',
        })
      ).status,
    ).toBe(200);
  });
  it.each(['deactivate', 'reactivate', 'revoke-sessions', 'recover-password'])(
    'denies a deactivated administrator %s',
    async (action) => {
      state.banned = true;
      expect((await request(`/employee/${action}`, {})).status).toBe(403);
      expect(state.batch).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['not_found', 404],
    ['last_admin', 409],
    ['conflict', 409],
    ['forbidden', 403],
  ] as const)('translates %s to a safe error', async (status, code) => {
    state.batch.mockResolvedValue([{ rows: [] }, { rows: [{ status }] }]);
    expect((await request('/employee/deactivate', {})).status).toBe(code);
  });
  it('sanitizes unexpected database failures', async () => {
    state.batch.mockRejectedValue(new Error('private credential material'));
    const response = await request('/employee/deactivate', {});
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
  it('rejects malformed JSON and oversized bodies', async () => {
    for (const body of ['{', JSON.stringify({ junk: 'x'.repeat(9000) })]) {
      const response = await app.request(
        `${origin}/api/staff/employee/deactivate`,
        {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body,
        },
        { DATABASE_URL: 'unused', BETTER_AUTH_URL: origin },
      );
      expect([400, 413]).toContain(response.status);
      expect(await response.text()).not.toContain('private');
    }
    expect(state.batch).not.toHaveBeenCalled();
  });
});
