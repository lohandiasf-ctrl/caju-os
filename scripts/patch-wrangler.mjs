// Post-build step for self-hosted Cloudflare deploys.
//
// The build emits dist/server/wrangler.json with a PLACEHOLDER D1 database_id
// (00000000-0000-4000-8000-000000000000), because the real id is
// account-specific and must not be committed. This script swaps in the real
// values from the gitignored .cloudflare.json.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadCfConfig, DIST_WRANGLER_PATH, REPO_ROOT } from './cf-config.mjs';

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

// Non-secret runtime config the Worker reads off `env`. JIRA_API_TOKEN is
// deliberately excluded: it goes in via `wrangler secret put` so it is never
// written into the deployed config or any file on disk here.
const VARS_FROM_ENV = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_PROJECT_KEY'];
const SECRET_ONLY = [
  'JIRA_API_TOKEN',
  'GOOGLE_MAPS_API_KEY',
  'SPARES_SYNC_PUSH_URL',
  'SPARES_SYNC_PUSH_URL_ORIGINAL',
  'SPARES_SYNC_PULL_URL',
  'SPARES_SYNC_TOKEN',
  'TRACKINGMORE_API_KEY',
];

const cfg = loadCfConfig();

function readEnvLocal() {
  let raw;
  try {
    raw = readFileSync(join(REPO_ROOT, '.env.local'), 'utf8');
  } catch {
    return {};
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

let wrangler;
try {
  wrangler = JSON.parse(readFileSync(DIST_WRANGLER_PATH, 'utf8'));
} catch {
  throw new Error(
    `${DIST_WRANGLER_PATH} not found. Run "npm run build" first.`,
  );
}

const d1 = wrangler.d1_databases;
if (!Array.isArray(d1) || d1.length === 0) {
  throw new Error(
    'dist/server/wrangler.json has no d1_databases entry to patch.',
  );
}

let patched = 0;
for (const entry of d1) {
  if (
    entry.database_id === PLACEHOLDER_ID ||
    entry.database_name === 'site-creator-d1'
  ) {
    entry.database_id = cfg.d1_database_id;
    entry.database_name = cfg.d1_database_name;
    patched += 1;
  }
}

if (patched === 0) {
  console.warn(
    'patch-wrangler: no placeholder D1 binding found; leaving D1 binding unchanged.',
  );
} else {
  console.log(
    `patch-wrangler: set D1 binding "${d1[0].binding}" -> ${cfg.d1_database_name} (${cfg.d1_database_id}).`,
  );
}

// --- worker name -------------------------------------------------------------
// The Sites plugin emits the generic "sites-project"; the Worker name decides
// the *.workers.dev hostname, so give it the product's name.
const workerName = cfg.worker_name ?? 'caju-os';
if (wrangler.name !== workerName) {
  console.log(
    `patch-wrangler: worker name "${wrangler.name}" -> "${workerName}".`,
  );
  wrangler.name = workerName;
  if (wrangler.topLevelName) wrangler.topLevelName = workerName;
}

// --- Workers AI --------------------------------------------------------------
// Used by /api/rat/extract to read the technician's report. Declared here as
// well as in vite.config.ts: this file has the last word on what ships.
wrangler.ai = { binding: 'AI' };
console.log('patch-wrangler: Workers AI binding -> AI.');

// --- scheduled handler -------------------------------------------------------
// The generated entry exports only `fetch`. Swap in a wrapper that also exports
// `scheduled`, so delegated-task follow-ups fire without anyone opening the app.
const distDir = dirname(DIST_WRANGLER_PATH);
copyFileSync(
  join(REPO_ROOT, 'scripts', 'worker-entry.js'),
  join(distDir, 'worker-entry.js'),
);
copyFileSync(
  join(REPO_ROOT, 'scripts', 'security-headers.mjs'),
  join(distDir, 'security-headers.mjs'),
);
wrangler.main = 'worker-entry.js';
wrangler.triggers = { crons: ['*/10 * * * *'] };
console.log('patch-wrangler: scheduled handler wired (cron */10 * * * *).');

// --- custom domain (DNS cutover) ---------------------------------------------
// Opt in by adding "custom_domain": "operacoes.cajutech.net" to .cloudflare.json.
// Deploying with this set makes Cloudflare repoint the hostname's DNS record at
// this Worker, replacing whatever it pointed to before.
if (cfg.custom_domain) {
  // Wrangler cannot always infer the zone from the hostname (API error 10082),
  // so state it explicitly. Defaults to the registrable domain; override with
  // "zone_name" in .cloudflare.json for multi-label TLDs such as .com.br.
  const zoneName =
    cfg.zone_name ?? cfg.custom_domain.split('.').slice(-2).join('.');
  wrangler.routes = [
    { pattern: cfg.custom_domain, custom_domain: true, zone_name: zoneName },
  ];
  // Adding a route makes wrangler default workers_dev to false, which takes the
  // *.workers.dev URL offline. Keep it up: it is the staging URL and the safety
  // net while the custom domain is being verified.
  wrangler.workers_dev = true;
  console.log(
    `patch-wrangler: CUSTOM DOMAIN -> ${cfg.custom_domain} (zone ${zoneName}). THIS REPOINTS LIVE DNS.`,
  );
  console.log(
    'patch-wrangler: workers_dev kept enabled so the *.workers.dev URL stays reachable.',
  );
} else {
  console.log(
    'patch-wrangler: no custom_domain set; deploying to *.workers.dev only.',
  );
}

// --- non-secret vars ---------------------------------------------------------
const envLocal = readEnvLocal();
wrangler.vars ??= {};
const applied = [];
const missing = [];
for (const name of VARS_FROM_ENV) {
  const value = cfg.vars?.[name] ?? envLocal[name];
  if (value) {
    wrangler.vars[name] = value;
    applied.push(name);
  } else {
    missing.push(name);
  }
}
if (applied.length)
  console.log(`patch-wrangler: vars -> ${applied.join(', ')}`);
if (missing.length)
  console.warn(`patch-wrangler: WARNING missing vars: ${missing.join(', ')}`);
console.log(
  `patch-wrangler: set separately as secrets (wrangler secret put): ${SECRET_ONLY.join(', ')}`,
);

writeFileSync(DIST_WRANGLER_PATH, `${JSON.stringify(wrangler, null, 2)}\n`);
