import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('loads emitted ESM in plain Node and serves health and session without a database', () => {
  // Vitest resolves extensionless source imports; Node must load emitted .js.
  const output = join(process.cwd(), 'output');
  mkdirSync(output, { recursive: true });
  const directory = mkdtempSync(join(output, 'vercel-runtime-'));
  try {
    execFileSync(process.execPath, [
      'node_modules/typescript/bin/tsc',
      '--project',
      'tsconfig.vercel.json',
      '--noEmit',
      'false',
      '--outDir',
      directory,
    ]);
    const entry = pathToFileURL(join(directory, 'api/index.js')).href;
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import assert from 'node:assert/strict';
          import handler from ${JSON.stringify(entry)};
          globalThis.fetch = () => { throw new Error('Unexpected network access'); };
          const health = await handler.fetch(new Request('https://clinic.example/api/health'));
          assert.equal(health.status, 200);
          assert.deepEqual(await health.json(), { status: 'ok' });
          const session = await handler.fetch(new Request('https://clinic.example/api/session'));
          assert.equal(session.status, 401);
          assert.deepEqual(await session.json(), { error: 'Authentication required' });
          console.log('Node ESM API verified');
        `,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://test:test@example.test/clinic',
          BETTER_AUTH_SECRET: 'runtime-test-secret-with-at-least-32-characters',
          BETTER_AUTH_URL: 'https://clinic.example',
        },
      },
    );
    expect(result).toContain('Node ESM API verified');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 15_000);
