import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { configFromEnv, loadCfConfig } from './cf-config.mjs';

function backupConfig() {
  if (process.env.D1_DATABASE_NAME) return configFromEnv(process.env);
  return loadCfConfig();
}

const cfg = backupConfig();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = resolve('backups', 'd1');
const output = resolve(outputDir, `${cfg.d1_database_name}-${stamp}.sql`);
mkdirSync(outputDir, { recursive: true });

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['wrangler', 'd1', 'export', cfg.d1_database_name, '--remote', '--output', output];
const result = spawnSync(command, args, { stdio: 'inherit' });

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`D1 backup written to ${output}`);

