// Applies the versioned Drizzle migrations in drizzle/ to the REMOTE
// (self-hosted) Cloudflare D1 database.
//
// Wrangler 4.92's `d1 migrations apply` does not honour `migrations_dir` from a
// `-c` JSON config, so the reliable path for the initial bring-up is to
// concatenate the migrations into one file (scripts/build-init-sql.mjs) and
// feed it to `wrangler d1 execute --file`. The generated file also seeds
// wrangler's `d1_migrations` table so later `wrangler d1 migrations apply`
// runs (with a proper config) treat these as already applied.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadCfConfig, REPO_ROOT } from './cf-config.mjs';

const cfg = loadCfConfig();

let res = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'build-init-sql.mjs')], {
  stdio: 'inherit',
  cwd: REPO_ROOT,
});
if (res.status !== 0) process.exit(res.status ?? 1);

const args = [
  'wrangler',
  'd1',
  'execute',
  cfg.d1_database_name,
  '--remote',
  '--file=.wrangler-init.sql',
];
console.log(`> npx ${args.join(' ')}`);
res = spawnSync('npx', args, { stdio: 'inherit', cwd: REPO_ROOT, shell: process.platform === 'win32' });
process.exit(res.status ?? 1);
