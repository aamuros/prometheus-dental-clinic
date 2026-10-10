import { betterAuth } from 'better-auth/minimal';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../server/app';
import { authOptions } from '../server/features/auth/auth';

function makeTestAuth(store: Record<string, Record<string, unknown>[]>) {
  return betterAuth({
    ...authOptions({
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: 'unit-test-only-secret-32-characters-long',
    }),
    database: memoryAdapter(store),
  });
}
const { state } = vi.hoisted(() => ({
  state: { auth: undefined as ReturnType<typeof makeTestAuth> | undefined },
}));
vi.mock('../server/features/auth/auth', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../server/features/auth/auth')>();
  return {
    ...actual,
    createAuth: () => {
      if (!state.auth) throw new Error('Test auth not initialized');
      return state.auth;
    },
  };
});

const origin = 'https://clinic.example.test';
const password = 'test-password-with-entropy-491!';
let store: Record<
  'user' | 'session' | 'account' | 'verification' | 'rateLimit',
  Record<string, unknown>[]
>;

async function request(
  path: string,
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) {
  return app.request(
    `${origin}${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: requestOrigin,
        'x-vercel-forwarded-for': '192.0.2.1',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    {
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: 'unit-test-only-secret-32-characters-long',
      DATABASE_URL: 'unused',
    },
  );
}

async function login(role: 'admin' | 'staff') {
  if (!state.auth) throw new Error('Missing auth');
  await state.auth.api.createUser({
    body: { name: role, email: `${role}@example.test`, password, role },
  });
  const response = await request('/api/auth/sign-in/email', {
    email: `${role}@example.test`,
    password,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return { cookie, response };
}

beforeEach(() => {
  store = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  state.auth = makeTestAuth(store);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('Clinic authentication and authorization', () => {
  it('uses only the platform-overwritten Vercel IP header for rate limiting', () => {
    const options = authOptions({
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: 'unit-test-only-secret-32-characters-long',
    });
    expect(options.advanced.ipAddress.ipAddressHeaders).toEqual([
      'x-vercel-forwarded-for',
    ]);
  });
  it('hides unexpected adapter errors from responses and logs', async () => {
    if (!state.auth) throw new Error('Missing auth');
    const context = await state.auth.$context;
    vi.spyOn(context.adapter, 'findOne').mockRejectedValue(
      new Error('private connection and account details'),
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await request('/api/auth/sign-in/email', {
      email: 'staff@example.test',
      password,
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(log).not.toHaveBeenCalled();
  });

  it('rejects missing and forged sessions but leaves health public', async () => {
    expect((await request('/api/session')).status).toBe(401);
    expect(
      (
        await request(
          '/api/session',
          undefined,
          '__Secure-better-auth.session_token=forged',
        )
      ).status,
    ).toBe(401);
    expect((await request('/api/health')).status).toBe(200);
  });

  it('logs in with a hashed password, secure cookie and server session; logout revokes it', async () => {
    const { cookie, response } = await login('staff');
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(response.headers.get('set-cookie')).toMatch(/Secure/i);
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);
    expect(store.account[0]?.password).not.toBe(password);
    const session = await request('/api/session', undefined, cookie);
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({
      user: expect.objectContaining({ role: 'staff' }),
    });
    expect((await request('/api/auth/sign-out', {}, cookie)).status).toBe(200);
    expect((await request('/api/session', undefined, cookie)).status).toBe(401);
  });

  it('rejects expired sessions and observes role changes without trusting cached cookies', async () => {
    const { cookie } = await login('admin');
    const body = {
      name: 'New staff',
      email: 'new@example.test',
      password,
      role: 'staff',
    };
    if (store.user[0]) store.user[0].role = 'staff';
    expect(
      (await request('/api/auth/admin/create-user', body, cookie)).status,
    ).toBe(403);
    if (store.session[0]) store.session[0].expiresAt = new Date(0);
    expect((await request('/api/session', undefined, cookie)).status).toBe(401);
  });

  it.each(['admin', 'staff'] as const)(
    'denies an existing %s session immediately after an account ban',
    async (role) => {
      const { cookie } = await login(role);
      const user = store.user[0];
      if (!user) throw new Error('Missing fixture user');
      user.banned = true;
      const id = '36f38e10-ae56-4a44-9fae-5742baceb003';
      for (const path of [
        '/api/session',
        '/api/patients',
        '/api/appointments',
        '/api/appointments/staff',
        '/api/dental-records',
        `/api/dental-records/options?patientId=${id}`,
      ]) {
        const response = await request(path, undefined, cookie);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Access denied' });
      }
      for (const path of [
        '/api/patients',
        `/api/patients/${id}/archive`,
        '/api/appointments',
        `/api/appointments/${id}/cancel`,
        '/api/dental-records',
      ]) {
        expect((await request(path, {}, cookie)).status).toBe(403);
      }
      expect(
        (
          await request(
            '/api/auth/admin/create-user',
            {
              name: 'Blocked creation',
              email: 'blocked@example.test',
              password,
              role: 'staff',
            },
            cookie,
          )
        ).status,
      ).toBe(403);
      expect(store.user).toHaveLength(1);
      // A banned account must still be able to clear its cookie and session.
      expect((await request('/api/auth/sign-out', {}, cookie)).status).toBe(
        200,
      );
      expect((await request('/api/session', undefined, cookie)).status).toBe(
        401,
      );
    },
  );

  it('restricts account creation to admins and validates roles and password length', async () => {
    const body = {
      name: 'New staff',
      email: 'new@example.test',
      password,
      role: 'staff',
    };
    expect((await request('/api/auth/admin/create-user', body)).status).toBe(
      401,
    );
    const staff = await login('staff');
    expect(
      (await request('/api/auth/admin/create-user', body, staff.cookie)).status,
    ).toBe(403);
    const admin = await login('admin');
    expect(
      (
        await request(
          '/api/auth/admin/create-user',
          { ...body, password: 'short' },
          admin.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/auth/admin/create-user',
          { ...body, role: 'owner' },
          admin.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/auth/admin/create-user',
          { ...body, data: { role: 'admin' } },
          admin.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request('/api/auth/admin/create-user', body, admin.cookie)).status,
    ).toBe(200);
    expect(
      (
        await request('/api/auth/sign-in/email', {
          email: body.email,
          password,
        })
      ).status,
    ).toBe(200);
  });

  it('lets administrators create a designated dentist without granting administrator access', async () => {
    const { cookie } = await login('admin');
    const response = await request(
      '/api/auth/admin/create-user',
      {
        name: 'Synthetic dentist',
        email: 'dentist@example.test',
        password,
        role: 'staff',
        data: { isDentist: true },
      },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(
      store.user.find((user) => user.email === 'dentist@example.test'),
    ).toMatchObject({
      role: 'staff',
      isDentist: true,
    });
  });

  it('blocks public signup and unused account/role endpoints', async () => {
    for (const path of [
      '/sign-up/email',
      '/update-user',
      '/admin/set-role',
      '/admin/impersonate-user',
    ]) {
      expect(
        (
          await request(`/api/auth${path}`, {
            name: 'Visitor',
            email: 'visitor@example.test',
            password,
            role: 'admin',
          })
        ).status,
      ).not.toBe(200);
    }
    expect(store.user).toHaveLength(0);
    const response = await state.auth?.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          name: 'Visitor',
          email: 'visitor@example.test',
          password,
        }),
      }),
    );
    expect(response?.status).toBe(400);
  });

  it('rejects cross-origin login, logout and account creation', async () => {
    const { cookie } = await login('admin');
    const hostile = 'https://untrusted.example.test';
    expect(
      (
        await request(
          '/api/auth/sign-in/email',
          { email: 'admin@example.test', password },
          undefined,
          hostile,
        )
      ).status,
    ).toBe(403);
    expect(
      (await request('/api/auth/sign-out', {}, cookie, hostile)).status,
    ).toBe(403);
    expect(
      (
        await request(
          '/api/auth/admin/create-user',
          { name: 'New', email: 'new@example.test', password, role: 'admin' },
          cookie,
          hostile,
        )
      ).status,
    ).toBe(403);
    expect(store.user).toHaveLength(1);
  });

  it('returns a safe login failure and limits repeated attempts', async () => {
    await login('staff');
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await request('/api/auth/sign-in/email', {
        email: 'staff@example.test',
        password: 'wrong-password',
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Authentication request rejected',
      });
    }
    const limited = await request('/api/auth/sign-in/email', {
      email: 'staff@example.test',
      password,
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });
});
