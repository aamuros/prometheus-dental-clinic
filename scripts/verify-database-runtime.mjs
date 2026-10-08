import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { parseEnv } from 'node:util';

const context = JSON.parse(readFileSync('.neon', 'utf8'));
const env = parseEnv(readFileSync('.env.local', 'utf8'));
assert.equal(
  context.branch,
  'development',
  'Select development before verifying',
);
assert.equal(
  env.NEON_BRANCH,
  'development',
  'Pull development credentials first',
);
assert.ok(env.DATABASE_URL, 'Missing runtime database credentials');
assert.ok(env.DATABASE_URL_UNPOOLED, 'Missing migration database credentials');

// Detect overriding credential sources before starting any database request.
for (const override of [
  process.env,
  ...['.env', '.dev.vars']
    .filter(existsSync)
    .map((path) => parseEnv(readFileSync(path, 'utf8'))),
]) {
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    assert.ok(
      !override[key] || override[key] === env[key],
      'Database override mismatch',
    );
  }
}
const fingerprint = createHash('sha256').update(env.DATABASE_URL).digest('hex');
const baseUrl = 'http://127.0.0.1:8789';
const child = spawn(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    'tests/runtime/database-worker.ts',
    '--config',
    'wrangler.jsonc',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    '8789',
    '--inspector-port',
    '0',
    '--assets',
    'dist/client',
    '--log-level',
    'error',
    '--show-interactive-dev-session',
    'false',
  ],
  { detached: true, stdio: 'ignore' },
);
const exited = once(child, 'exit');

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(
      child.exitCode,
      null,
      'Local Worker exited before becoming ready',
    );
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok;
    } catch {
      // Wait for workerd startup, without retrying SQL or exposing diagnostics.
    }
    if (ready) break;
    await setTimeout(250);
  }
  assert.ok(ready, 'Local Worker did not become ready');

  const mismatch = await fetch(`${baseUrl}/api/__verify/database`, {
    headers: { 'X-Expected-Database-Fingerprint': 'incorrect' },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(mismatch.status, 400, 'Mismatched credentials must refuse SQL');

  const response = await fetch(`${baseUrl}/api/__verify/database`, {
    headers: { 'X-Expected-Database-Fingerprint': fingerprint },
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, 'Worker database verification failed');
  assert.deepEqual(await response.json(), {
    credentialsMatch: true,
    selectOne: true,
    batchValues: [1, 2],
    batchSharesTransaction: true,
    failedBatchRejected: true,
    recoveredAfterFailure: true,
    interactiveTransactionsUnsupported: true,
  });
  console.log(
    'PASS: development bindings, SELECT 1, HTTP batch transaction, failure recovery, and expected interactive-transaction rejection in workerd',
  );
} finally {
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    process.kill(-child.pid, 'SIGTERM');
  }
  await exited;
}
