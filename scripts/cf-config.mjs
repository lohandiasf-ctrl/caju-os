// Shared helper: reads the Cloudflare account-specific values that are created
// AFTER `wrangler login` + `wrangler d1 create`. These are environment-specific
// and secret-adjacent, so locally they live in the gitignored `.cloudflare.json`,
// never in version control. In Cloudflare Workers Builds (the automatic deploy
// on every push to main) that file does not exist, so the same values come from
// build variables instead — see configFromEnv().
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

// All required in build-variable mode: without the domain the deploy would drop
// the operacoes.cajutech.net route, and without the Jira vars `wrangler deploy`
// would wipe JIRA_* from the live Worker.
export const BUILD_VARIABLES = [
  'D1_DATABASE_NAME',
  'D1_DATABASE_ID',
  'CUSTOM_DOMAIN',
  'ZONE_NAME',
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_PROJECT_KEY',
];

export function configFromEnv(env) {
  if (!env.D1_DATABASE_ID) return null;
  const missing = BUILD_VARIABLES.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing build variables: ${missing.join(', ')}. See docs/DEPLOYMENT.md.`);
  }
  return {
    d1_database_name: env.D1_DATABASE_NAME,
    d1_database_id: env.D1_DATABASE_ID,
    custom_domain: env.CUSTOM_DOMAIN,
    zone_name: env.ZONE_NAME,
    vars: {
      JIRA_BASE_URL: env.JIRA_BASE_URL,
      JIRA_EMAIL: env.JIRA_EMAIL,
      JIRA_PROJECT_KEY: env.JIRA_PROJECT_KEY,
    },
  };
}

export function loadCfConfig() {
  let raw;
  try {
    raw = readFileSync(CF_CONFIG_PATH, 'utf8');
  } catch {
    const fromEnv = configFromEnv(process.env);
    if (fromEnv) return fromEnv;
    throw new Error(
      `Missing ${CF_CONFIG_PATH} and no build variables (${BUILD_VARIABLES.join(', ')}).\n` +
        'Locally, create it after `wrangler login` and `wrangler d1 create caju-os-prod`:\n' +
        '{\n  "d1_database_name": "caju-os-prod",\n  "d1_database_id": "<id from wrangler d1 create>"\n}\n',
    );
  }
  const cfg = JSON.parse(raw);
  if (!cfg.d1_database_id || !cfg.d1_database_name) {
    throw new Error(`${CF_CONFIG_PATH} must set both "d1_database_id" and "d1_database_name".`);
  }
  return cfg;
}
