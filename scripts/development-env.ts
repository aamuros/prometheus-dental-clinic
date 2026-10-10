import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Operator-only guard shared by synthetic-data tools; never deployed.
export function developmentEnv(origin = 'http://127.0.0.1:4180') {
  const context: unknown = JSON.parse(readFileSync('.neon', 'utf8'));
  assert.ok(
    context &&
      typeof context === 'object' &&
      'projectId' in context &&
      context.projectId === 'muddy-boat-93080753' &&
      'branch' in context &&
      context.branch === 'development',
    'Select the existing Neon development branch',
  );
  const local = parseEnv(readFileSync('.env.local', 'utf8'));
  assert.equal(local.NEON_BRANCH, 'development');
  assert.ok(
    local.DATABASE_URL &&
      local.DATABASE_URL_UNPOOLED &&
      local.BETTER_AUTH_SECRET,
  );
  for (const source of [
    process.env,
    ...(existsSync('.env') ? [parseEnv(readFileSync('.env', 'utf8'))] : []),
  ]) {
    for (const key of [
      'DATABASE_URL',
      'DATABASE_URL_UNPOOLED',
      'BETTER_AUTH_SECRET',
    ]) {
      assert.ok(
        !source[key] || source[key] === local[key],
        'Conflicting server environment',
      );
    }
  }
  const direct = new URL(local.DATABASE_URL_UNPOOLED);
  const pooled = new URL(local.DATABASE_URL);
  assert.equal(
    direct.hostname,
    'ep-young-mud-b3vs4k6p.c-4.ap-southeast-1.aws.neon.tech',
  );
  assert.equal(pooled.hostname, direct.hostname.replace('.c-4', '-pooler.c-4'));
  assert.equal(direct.pathname, '/prometheus_dental_clinic');
  assert.equal(pooled.pathname, direct.pathname);
  assert.equal(direct.searchParams.get('sslmode'), 'require');
  assert.equal(pooled.searchParams.get('sslmode'), 'require');
  const url = new URL(origin);
  assert.equal(url.origin, origin);
  assert.ok(
    url.protocol === 'https:' ||
      (url.protocol === 'http:' && url.hostname === '127.0.0.1'),
  );
  return {
    DATABASE_URL: local.DATABASE_URL,
    DATABASE_URL_UNPOOLED: local.DATABASE_URL_UNPOOLED,
    BETTER_AUTH_SECRET: local.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: origin,
  };
}
