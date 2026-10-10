import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';

const { developmentEnv } = await import('./development-env.ts');
const local = developmentEnv('http://127.0.0.1:8788');
const baseURL = 'http://127.0.0.1:8788';
const url = new URL(baseURL);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
const run = randomUUID();
const segment = run.replaceAll('-', '');
const ipSuffix = `${Number.parseInt(segment.slice(0, 2), 16)}.${Number.parseInt(segment.slice(2, 4), 16)}`;
const testIP = `198.18.${ipSuffix}`;
const failureIP = `198.19.${ipSuffix}`;
const prefix = `auth-smoke-${run}-`;
const password = randomBytes(32).toString('base64url');
const fingerprint = createHash('sha256')
  .update(local.DATABASE_URL)
  .digest('hex');
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'tests/runtime/serve.ts', 'auth', '8788'],
  {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, ...local },
  },
);
const exited = once(child, 'exit');
let startupCode = '';
child.stderr.on('data', (chunk) => {
  startupCode = String(chunk).match(/E[A-Z]{3,30}/)?.[0] ?? startupCode;
});

async function request(
  path,
  { body, cookie, origin = baseURL, ip = testIP, headers = {} } = {},
) {
  return fetch(`${baseURL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'x-vercel-forwarded-for': ip,
      ...headers,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
}
async function fixture(action, extra = {}) {
  const response = await request('/api/__verify/auth', {
    body: { action, run, ...extra },
    headers: { 'X-Expected-Database-Fingerprint': fingerprint },
  });
  const result = await response.json();
  assert.equal(
    response.status,
    200,
    `Fixture ${action} failed: ${JSON.stringify(result)}`,
  );
  return result;
}
async function login(role) {
  const response = await request('/api/auth/sign-in/email', {
    body: { email: `${prefix}${role}@example.test`, password },
  });
  assert.equal(response.status, 200, `${role} login failed`);
  const cookies = response.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (cookie) => /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie),
    ),
  );
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}
let ready = false;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(
      child.exitCode,
      null,
      `Local Node server exited before startup (${startupCode})`,
    );
    try {
      const response = await request('/api/health');
      ready =
        response.ok &&
        response.headers.get('X-Auth-Runtime-Verifier') === 'true';
    } catch {
      /* Node server is starting. */
    }
    if (ready) break;
    await setTimeout(250);
  }
  assert.ok(ready, 'Local Node server did not become ready');
  assert.equal(
    (
      await request('/api/__verify/auth', {
        body: { action: 'seed', run, password },
        headers: { 'X-Expected-Database-Fingerprint': 'incorrect' },
      })
    ).status,
    400,
  );
  assert.deepEqual(await fixture('seed', { password }), {
    credentialsMatch: true,
    passwordsHashed: true,
  });
  assert.equal((await request('/api/session')).status, 401);
  assert.equal(
    (
      await request('/api/session', {
        cookie: 'better-auth.session_token=forged',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/api/auth/sign-up/email', {
        body: {
          name: 'Visitor',
          email: `${prefix}visitor@example.test`,
          password,
        },
      })
    ).status,
    404,
  );
  const staffCookie = await login('staff');
  const adminCookie = await login('admin');
  for (const [cookie, role] of [
    [staffCookie, 'staff'],
    [adminCookie, 'admin'],
  ]) {
    const response = await request('/api/session', { cookie });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.role, role);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const account = {
    name: 'Runtime created',
    email: `${prefix}created@example.test`,
    password,
    role: 'staff',
  };
  assert.equal(
    (await request('/api/auth/admin/create-user', { body: account })).status,
    401,
  );
  assert.equal(
    (
      await request('/api/auth/admin/create-user', {
        body: account,
        cookie: staffCookie,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/auth/admin/create-user', {
        body: { ...account, role: 'owner' },
        cookie: adminCookie,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/auth/admin/create-user', {
        body: account,
        cookie: adminCookie,
        origin: 'https://untrusted.example.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/auth/sign-out', {
        body: {},
        cookie: staffCookie,
        origin: 'https://untrusted.example.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/api/auth/admin/create-user', {
        body: account,
        cookie: adminCookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/api/auth/sign-in/email', {
        body: { email: account.email, password },
      })
    ).status,
    200,
  );
  await fixture('demote');
  assert.equal(
    (
      await request('/api/auth/admin/create-user', {
        body: { ...account, email: `${prefix}denied@example.test` },
        cookie: adminCookie,
      })
    ).status,
    403,
  );
  await fixture('expire');
  assert.equal(
    (await request('/api/session', { cookie: staffCookie })).status,
    401,
  );
  assert.equal(
    (await request('/api/auth/sign-out', { body: {}, cookie: adminCookie }))
      .status,
    200,
  );
  assert.equal(
    (await request('/api/session', { cookie: adminCookie })).status,
    401,
  );
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request('/api/auth/sign-in/email', {
      body: {
        email: `${prefix}staff@example.test`,
        password: 'invalid-password',
      },
      ip: failureIP,
    });
    if (response.status !== 401) {
      const body = await response.text();
      const markers = [
        ...new Set(
          body.match(
            /CPU|resource limit|hanging|exception|internal|cancelled|canceled|database|auth|overload/gi,
          ) ?? [],
        ),
      ];
      assert.fail(
        `Wrong-password attempt ${attempt + 1}: HTTP ${response.status}, markers ${JSON.stringify(markers)}`,
      );
    }
  }
  const limited = await request('/api/auth/sign-in/email', {
    body: { email: `${prefix}staff@example.test`, password },
    ip: failureIP,
  });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('Retry-After'));
  console.log(
    'PASS: Better Auth + Drizzle/Neon in Node.js; login, sessions, roles, admin account creation, CSRF, expiry, logout, and database-backed rate limits',
  );
} finally {
  try {
    if (ready)
      await fixture('cleanup').catch(() =>
        console.error(
          'Runtime fixture cleanup failed; inspect test fixtures before retrying.',
        ),
      );
  } finally {
    if (child.exitCode === null && child.signalCode === null && child.pid)
      process.kill(-child.pid, 'SIGTERM');
    await exited;
  }
}
