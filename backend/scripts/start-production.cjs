/* Production entrypoint for Render (and any Linux/Windows host without a
 * writable shell). Runs Prisma migrations, optionally seeds once, then starts
 * the compiled API.
 */
const { spawnSync } = require('node:child_process');

const isWindows = process.platform === 'win32';
const npx = isWindows ? 'npx.cmd' : 'npx';

function run(args) {
  const printable = `${npx} ${args.join(' ')}`;
  console.log(`[start] ${printable}`);

  const result = isWindows
    ? spawnSync(printable, { stdio: 'inherit', env: process.env, shell: true })
    : spawnSync(npx, args, { stdio: 'inherit', env: process.env });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}: ${printable}`);
  }
}

try {
  run(['prisma', 'migrate', 'deploy']);

  if (process.env.RUN_DB_SEED === 'true') {
    console.log('[start] RUN_DB_SEED=true -> running idempotent seed');
    run(['tsx', 'prisma/seed.ts']);
  }

  require('../dist/server.js');
} catch (error) {
  console.error('[start] Failed to start production API', error);
  process.exit(1);
}
