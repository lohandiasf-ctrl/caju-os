# Current State Short

Use this file as the first context stop for Codex and Claude. Read the larger
docs only when the task touches that area.

## Production

- App: https://operacoes.cajutech.net
- Host: Cloudflare Worker `caju-os`
- Database: Cloudflare D1 `caju-os-prod`
- Deploy: push to `main` publishes production through Cloudflare Workers Builds.
- Manual deploy remains available with `npm run deploy` when explicitly needed.

## Current Line

- `main` is the production line.
- Latest known production version endpoint reports `0.1.15`.
- Ticket history is already merged and migrated through
  `drizzle/0025_ticket_history.sql`.
- Active D1 migrations: through `0029_chat_group_message_management.sql`
  applied remotely as of 2026-09-14. `0030_whatsapp_conversations.sql` is
  pending — run `npm run db:migrate:remote` after merging the WhatsApp
  inbox branch.

## Important Local State

- Do not commit secrets: `.env.local`, `.cloudflare.json`, Wrangler auth, tokens.
- Do not commit generated output: `dist`, `.next`, `.vinext`, `.wrangler`,
  `.tar.gz`, `.exe`, logs, tmp/stage folders, `src-tauri/target`.
- The desktop app is Tauri and mostly loads the production web URL. Rebuild the
  installer only when changing `src-tauri`, native permissions, icons, version,
  or native clipboard/window behavior.

## Core Areas

- UI/pages: `app/**`, `components/**`
- API routes: `app/api/**/route.ts`
- Database schema: `db/schema.ts`
- Migrations: `drizzle/*.sql`
- Jira integration: `lib/server/jira.ts`
- Auth/roles: `lib/server/firebase-auth.ts`, `lib/permissions.ts`
- Operational logic: `lib/operational-intelligence.ts`,
  `lib/operational-rules.ts`
- Voice/WebRTC: `lib/voice-chat.ts`, `signaling-server/`
- Tests: `tests/*.test.ts`

## Validation

For code changes, prefer:

```bash
npm test
npx tsc --noEmit
npm run build
```

If only docs or cleanup changed, explain why heavier validation was skipped.

## Read Larger Docs Only When Needed

- Architecture: `docs/ARCHITECTURE.md`
- Jira fields or Jira writes: `docs/JIRA_FIELDS.md`, `docs/jira-custom-fields.md`
- Workflow rules/status movement/validation: `docs/WORKFLOW_RULES.md`
- Deployment, Cloudflare, env, migrations: `docs/DEPLOYMENT.md`
- Known bugs/regressions: `docs/KNOWN_BUGS.md`
- Full historical handoff: `docs/AI_HANDOFF.md`
