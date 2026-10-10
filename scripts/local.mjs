import { spawn } from 'node:child_process';

const preview = process.argv.includes('--preview');
const children = [
  spawn(
    process.execPath,
    [
      '--env-file-if-exists=.env.local',
      '--env-file-if-exists=.env',
      '--import',
      'tsx',
      ...(!preview ? ['--watch'] : []),
      'server/local.ts',
      ...(preview ? ['--preview'] : []),
    ],
    { stdio: 'inherit', detached: process.platform !== 'win32' },
  ),
  ...(!preview
    ? [
        spawn(
          process.execPath,
          ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)],
          {
            stdio: 'inherit',
            detached: process.platform !== 'win32',
          },
        ),
      ]
    : []),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      // A sibling may already have exited; stop the remaining process groups.
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
