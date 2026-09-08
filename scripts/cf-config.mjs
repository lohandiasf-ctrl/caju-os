// Shared helper: reads the Cloudflare account-specific values that are created
// AFTER `wrangler login` + `wrangler d1 create`. These are environment-specific
// and secret-adjacent, so they live in the gitignored `.cloudflare.json`, never
// in version control.
//
// Expected shape of .cloudflare.json:
// {
//   "d1_database_name": "caju-os-prod",
//   "d1_database_id": "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx"
// }

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = root;
export const CF_CONFIG_PATH = resolve(root, '.cloudflare.json');
export const DIST_WRANGLER_PATH = resolve(root, 'dist/server/wrangler.json');

export function loadCfConfig() {
  let raw;
  try {
    raw = readFileSync(CF_CONFIG_PATH, 'utf8');
  } catch {
    throw new Error(
      `Missing ${CF_CONFIG_PATH}.\n` +
        'Create it after `wrangler login` and `wrangler d1 create caju-os-prod`:\n' +
        '{\n  "d1_database_name": "caju-os-prod",\n  "d1_database_id": "<id from wrangler d1 create>"\n}\n',
    );
  }
  const cfg = JSON.parse(raw);
  if (!cfg.d1_database_id || !cfg.d1_database_name) {
    throw new Error(`${CF_CONFIG_PATH} must set both "d1_database_id" and "d1_database_name".`);
  }
  return cfg;
}
