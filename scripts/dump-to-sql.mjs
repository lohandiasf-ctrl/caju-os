// Converts the production dump captured from the live OpenAI Sites deployment
// into INSERT statements for the self-hosted Cloudflare D1 database.
//
//   node scripts/dump-to-sql.mjs <caju-live-dump-full.json>
//
// Writes .wrangler-data.sql (gitignored). Apply with:
//   npx wrangler d1 execute caju-os-prod --remote --file=.wrangler-data.sql
//
// Tables are emitted in FK-safe order (technicians before operational_workflows,
// chat_groups before its members/messages).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './cf-config.mjs';

const dumpPath = process.argv[2];
if (!dumpPath) throw new Error('usage: node scripts/dump-to-sql.mjs <dump.json>');

const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
const ep = dump.endpoints;
const exp = ep['/api/admin/export'].data;

const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

const out = [];
let totalRows = 0;

function emit(table, rows, columns) {
  if (!rows?.length) {
    out.push(`-- ${table}: 0 rows`);
    return;
  }
  out.push(`-- ${table}: ${rows.length} rows`);
  // D1 rejects oversized statements (SQLITE_TOOBIG), and row width varies a lot
  // between tables, so batch by serialised byte budget rather than row count.
  const MAX_STATEMENT_BYTES = 40_000;
  const prefix = `INSERT OR REPLACE INTO ${table} (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES\n  `;
  let batch = [];
  let bytes = 0;
  const flush = () => {
    if (!batch.length) return;
    out.push(prefix + batch.join(',\n  ') + ';');
    batch = [];
    bytes = 0;
  };
  for (const r of rows) {
    const tuple = `(${columns.map((c) => lit(r[c])).join(', ')})`;
    if (batch.length && bytes + tuple.length > MAX_STATEMENT_BYTES) flush();
    batch.push(tuple);
    bytes += tuple.length + 4;
  }
  flush();
  totalRows += rows.length;
  out.push('');
}

// Maps an API record (camelCase) onto snake_case columns, keeping only `cols`.
function rowsOf(records, cols, extra = () => ({})) {
  return (records ?? []).map((rec) => {
    const mapped = {};
    for (const [k, v] of Object.entries(rec)) mapped[snake(k)] = v;
    Object.assign(mapped, extra(rec));
    const row = {};
    for (const c of cols) row[c] = mapped[c] ?? null;
    return row;
  });
}

const now = new Date().toISOString();

// ---- 1. technicians (must precede operational_workflows) -------------------
const TECH = ['id', 'technician_external_id', 'technician_code', 'name', 'cpf', 'email', 'phone',
  'pix_key', 'age', 'base_city', 'base_state', 'full_address', 'status', 'source_status', 'approved',
  'onboarding_completed', 'has_vehicle', 'vehicle_type', 'alternative_transport', 'serves_other_cities',
  'extra_cities', 'tools_count', 'available_tools', 'specialties_count', 'specialties', 'created_at'];
emit('technicians', rowsOf(exp.technicians, TECH), TECH);

// ---- 2. app_users ----------------------------------------------------------
// The live API never exposes firebase_uid. requireApiUser() matches on
// firebaseUid OR email and recovers stale UIDs from the verified e-mail, so a
// placeholder is safe: the real UID is picked up on first sign-in.
const USERS = ['firebase_uid', 'email', 'role', 'active', 'created_at', 'updated_at'];
const colleagues = ep['/api/colleagues']?.colleagues ?? [];
emit(
  'app_users',
  colleagues.map((c) => ({
    firebase_uid: `pending:${String(c.email).toLowerCase()}`,
    email: String(c.email).toLowerCase(),
    role: c.role,
    active: 1,
    created_at: now,
    updated_at: now,
  })),
  USERS,
);

// ---- 3. employee_presence --------------------------------------------------
const PRESENCE = ['email', 'display_name', 'phone', 'photo_url', 'status', 'manual_status', 'last_seen_at', 'updated_at'];
emit('employee_presence', rowsOf(colleagues, PRESENCE, (c) => ({ updated_at: c.updatedAt ?? now })), PRESENCE);

// ---- 4. finance_settings ---------------------------------------------------
const FIN = ['key', 'first_ticket_cents', 'additional_ticket_cents', 'updated_by', 'updated_at'];
const fin = ep['/api/finance/rules'];
emit('finance_settings', fin ? rowsOf([fin], FIN) : [], FIN);

// ---- 5. operational_workflows ---------------------------------------------
const WF = ['id', 'ticket_key', 'store_code', 'store_name', 'address', 'city', 'state', 'opened_at',
  'category', 'pdv_number', 'description', 'client_value_cents', 'payout_cents', 'status',
  'technician_id', 'scheduled_at', 'expected_return_at', 'validation_status', 'spare_source',
  'spare_status', 'purchase_status', 'parts_value_cents', 'parts_sale_cents', 'payment_date',
  'paid_value_cents', 'pix_key', 'bank', 'account_holder', 'pix_key_type', 'archived_at',
  'created_by', 'created_at', 'updated_at'];
emit('operational_workflows', rowsOf(exp.workflows, WF), WF);

// ---- 6. operational_audit --------------------------------------------------
const AUDIT = ['id', 'ticket_key', 'action', 'actor_email', 'details', 'created_at'];
emit('operational_audit', rowsOf(exp.audit, AUDIT), AUDIT);

// ---- 7. employee_activity --------------------------------------------------
const ACT = ['id', 'email', 'event', 'context', 'duration_seconds', 'created_at'];
emit('employee_activity', rowsOf(exp.activities, ACT), ACT);

// ---- 8. voice_call_history -------------------------------------------------
const CALLS = ['id', 'session_id', 'owner_email', 'direction', 'kind', 'peer_names', 'status',
  'started_at', 'ended_at', 'duration_seconds'];
emit('voice_call_history', rowsOf(exp.calls, CALLS), CALLS);

// ---- 9. chat groups, members, messages ------------------------------------
const groups = ep['/api/chat-groups']?.groups ?? [];
const GROUPS = ['id', 'name', 'created_by', 'created_at', 'updated_at'];
emit('chat_groups', rowsOf(groups, GROUPS), GROUPS);

const MEMBERS = ['id', 'group_id', 'email', 'member_role', 'joined_at'];
const MSGS = ['id', 'group_id', 'sender_email', 'body', 'ticket_id', 'attachment_name',
  'attachment_type', 'attachment_data', 'created_at'];
const allMembers = [];
const allMsgs = [];
for (const g of groups) {
  const payload = ep[`/api/chat-groups/${g.id}/messages`];
  // members come back on the messages payload (the /members route is POST-only)
  allMembers.push(...(payload?.members ?? g.members ?? []));
  allMsgs.push(...(payload?.messages ?? []));
}
emit('chat_group_members', rowsOf(allMembers, MEMBERS), MEMBERS);
emit('chat_group_messages', rowsOf(allMsgs, MSGS), MSGS);

// ---- 10. technician_reviews ------------------------------------------------
const REVIEWS = ['id', 'technician_id', 'author_email', 'rating', 'comment', 'created_at'];
const allReviews = [];
for (const [path, body] of Object.entries(ep)) {
  if (!path.includes('/reviews')) continue;
  allReviews.push(...(Array.isArray(body) ? body : body?.reviews ?? []));
}
emit('technician_reviews', rowsOf(allReviews, REVIEWS), REVIEWS);

// ---- 11. communication_preferences ----------------------------------------
const PREFS = ['email', 'desktop_messages', 'desktop_calls', 'sound_messages', 'sound_calls',
  'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end', 'updated_at'];
const prefs = ep['/api/communication-preferences']?.preferences;
emit('communication_preferences', prefs ? rowsOf([prefs], PREFS, () => ({ updated_at: now })) : [], PREFS);

const header = `-- Generated by scripts/dump-to-sql.mjs from ${dumpPath}\n-- Source export: ${dump.extractedAt}\n\n`;
const outPath = join(REPO_ROOT, '.wrangler-data.sql');
writeFileSync(outPath, header + out.join('\n'));
console.log(`Wrote ${outPath}`);
console.log(`Total rows: ${totalRows}`);
