import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';

const { developmentEnv } = await import('./development-env.ts');
const env = developmentEnv('http://127.0.0.1:8789');
const fingerprint = createHash('sha256').update(env.DATABASE_URL).digest('hex');
const baseUrl = 'http://127.0.0.1:8789';
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'tests/runtime/serve.ts', 'database', '8789'],
  {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, ...env },
  },
);
const exited = once(child, 'exit');
let startupCode = '';
child.stderr.on('data', (chunk) => {
  startupCode = String(chunk).match(/E[A-Z]{3,30}/)?.[0] ?? startupCode;
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(
      child.exitCode,
      null,
      `Local Node server exited before becoming ready (${startupCode})`,
    );
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok;
    } catch {
      // Wait for Node.js startup, without retrying SQL or exposing diagnostics.
    }
    if (ready) break;
    await setTimeout(250);
  }
  assert.ok(ready, 'Local Node server did not become ready');

  const mismatch = await fetch(`${baseUrl}/api/__verify/database`, {
    headers: { 'X-Expected-Database-Fingerprint': 'incorrect' },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(mismatch.status, 400, 'Mismatched credentials must refuse SQL');

  const response = await fetch(`${baseUrl}/api/__verify/database`, {
    headers: { 'X-Expected-Database-Fingerprint': fingerprint },
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200, 'Node database verification failed');
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
    'PASS: development bindings, SELECT 1, HTTP batch transaction, failure recovery, and expected interactive-transaction rejection in Node.js',
  );
} finally {
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    process.kill(-child.pid, 'SIGTERM');
  }
  await exited;
}
