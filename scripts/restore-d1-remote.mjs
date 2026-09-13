import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadCfConfig } from './cf-config.mjs';

const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
const yes = process.argv.includes('--yes');
if (!fileArg || !yes) {
  console.error('Usage: npm run restore:d1:remote -- --file=backups/d1/file.sql --yes');
  process.exit(1);
}

const file = resolve(fileArg.slice('--file='.length));
if (!existsSync(file)) {
  console.error(`Backup file not found: ${file}`);
  process.exit(1);
}

const database = process.env.D1_DATABASE_NAME || loadCfConfig().d1_database_name;
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['wrangler', 'd1', 'execute', database, '--remote', '--file', file];
const result = spawnSync(command, args, { stdio: 'inherit' });

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`D1 restore executed against ${database} from ${file}`);

