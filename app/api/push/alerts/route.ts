import { env } from 'cloudflare:workers';
import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers, operationalAudit, operationalWorkflows, pushAlertsSent, pushDevices, pushPreferences } from '@/db/schema';
import { CLOSED_WORKFLOW_STATUSES, slaHoursOf, WORKFLOW_STATUS_LABEL } from '@/lib/operational-sla';
import { chunk } from '@/lib/push-message';
import { ALERT_WINDOW_MS, commentAlerts, detectAlerts, notesFor, OPS_ROLES, parsePrefs, type AuditRow, type QueueIssue, type TicketComment } from '@/lib/push-alerts';
import { recentJiraComments, searchJiraIssues } from '@/lib/server/jira';
import { sendPushToEmails } from '@/lib/server/push';

// Chamado pela rotina agendada (scripts/worker-entry.js, a cada 10 min).
// Descobre o que acabou de cruzar um limite na fila (SLA, sem agendamento há
// 2 h, horário agendado que passou, chamado novo) e avisa, uma vez só, quem
// ligou aquele tipo de aviso no app do celular.

const KEEP_DAYS = 30;
/** "Chamado que você movimentou": ação sua gravada na auditoria nestes últimos dias. */
const WATCH_DAYS = 14;
/** Teto de chamados consultados por rodada para comentários novos (cada um é uma chamada ao Jira). */
const MAX_COMMENT_LOOKUPS = 25;
/** D1 aceita até 100 parâmetros por consulta. */
const IN_BATCH = 90;

async function loadQueue(): Promise<QueueIssue[]> {
  const issues: QueueIssue[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await searchJiraIssues({ maxResults: 100, nextPageToken: cursor });
    issues.push(...r.issues);
    if (!r.nextPageToken || r.isLast) break;
    cursor = r.nextPageToken;
  }
  return issues;
}

/**
 * Comentário novo nos chamados que alguém movimentou (auditoria dos últimos
 * 14 dias). Só consulta os comentários dos chamados abertos que o Jira diz
 * terem mudado nesta janela, para não chamar o Jira por chamado a cada rodada.
 */
async function detectComments(db: ReturnType<typeof getDb>, issues: QueueIssue[], recipients: Set<string>, now: Date) {
  const since = new Date(now.getTime() - WATCH_DAYS * 86_400_000).toISOString();
  const audit: AuditRow[] = await db.select({ ticketKey: operationalAudit.ticketKey, actorEmail: operationalAudit.actorEmail, action: operationalAudit.action, createdAt: operationalAudit.createdAt })
    .from(operationalAudit).where(gt(operationalAudit.createdAt, since)).all();
  const watched = new Set(audit.filter((r) => recipients.has(r.actorEmail.toLowerCase())).map((r) => r.ticketKey));
  if (!watched.size) return [];
  const changedSince = now.getTime() - ALERT_WINDOW_MS;
  const candidates = issues
    .filter((i) => watched.has(i.key) && Date.parse((i as QueueIssue & { updatedAt?: string }).updatedAt ?? '') > changedSince)
    .slice(0, MAX_COMMENT_LOOKUPS);
  const comments: TicketComment[] = [];
  for (const issue of candidates) {
    comments.push(...await recentJiraComments(issue.key, 5).catch(() => []));
  }
  const byKey = new Map(issues.map((i) => [i.key, i]));
  const place = (key: string) => {
    const i = byKey.get(key);
    const store = i?.store ? (/^[A-Z]?\d+$/i.test(i.store) ? `Loja ${i.store}` : i.store) : '';
    return [store, i?.city].filter(Boolean).join(' · ');
  };
  return commentAlerts(comments, audit, recipients, now.getTime(), ALERT_WINDOW_MS, place);
}

export async function POST(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const db = getDb();
    const now = new Date();

    // Sem ninguém com o app instalado nos perfis da fila, nem consulta o Jira.
    const devices = await db.selectDistinct({ email: pushDevices.userEmail }).from(pushDevices).where(isNull(pushDevices.disabledAt)).all();
    const users = await db.select({ email: appUsers.email }).from(appUsers)
      .where(and(eq(appUsers.active, true), inArray(appUsers.role, [...OPS_ROLES]))).all();
    const withApp = new Set(devices.map((d) => d.email.toLowerCase()));
    const recipients = users.map((u) => u.email.toLowerCase()).filter((email) => withApp.has(email));
    if (!recipients.length) return Response.json({ recipients: 0, alerts: 0 });

    const [issues, workflows] = await Promise.all([
      loadQueue(),
      db.select({ ticketKey: operationalWorkflows.ticketKey, status: operationalWorkflows.status, createdAt: operationalWorkflows.createdAt, updatedAt: operationalWorkflows.updatedAt })
        .from(operationalWorkflows).all(),
    ]);
    const alerts = detectAlerts(issues, workflows, { closed: CLOSED_WORKFLOW_STATUSES, hoursOf: slaHoursOf, label: WORKFLOW_STATUS_LABEL }, now.getTime());
    alerts.push(...await detectComments(db, issues, new Set(recipients), now));

    // Tira o que já foi avisado e grava o novo ANTES de enviar: se o envio
    // demorar, a próxima rodada não repete.
    const sent = new Set<string>();
    for (const batch of chunk(alerts.map((a) => a.dedupe), IN_BATCH)) {
      const rows = await db.select({ dedupe: pushAlertsSent.dedupe }).from(pushAlertsSent).where(inArray(pushAlertsSent.dedupe, batch)).all();
      rows.forEach((r) => sent.add(r.dedupe));
    }
    const fresh = alerts.filter((a) => !sent.has(a.dedupe));
    if (fresh.length) {
      const nowIso = now.toISOString();
      for (const batch of chunk(fresh, 20)) {
        await db.insert(pushAlertsSent).values(batch.map((a) => ({ dedupe: a.dedupe, kind: a.kind, ticketKey: a.ticketKey, sentAt: nowIso })))
          .onConflictDoNothing().run();
      }
    }

    let notes = 0;
    if (fresh.length) {
      const prefRows = await db.select().from(pushPreferences).where(inArray(pushPreferences.email, recipients)).all();
      const prefs = new Map(prefRows.map((p) => [p.email.toLowerCase(), parsePrefs(p.kinds)]));
      for (const email of recipients) {
        for (const note of notesFor(fresh, prefs.get(email) ?? parsePrefs(null), email)) {
          await sendPushToEmails([email], note);
          notes += 1;
        }
      }
    }

    const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
    await db.delete(pushAlertsSent).where(lt(pushAlertsSent.sentAt, cutoff)).run();

    return Response.json({ recipients: recipients.length, queue: issues.length, alerts: fresh.length, notes, at: now.toISOString() });
  } catch (error) {
    console.error('push alerts', error);
    return Response.json({ error: 'Falha ao varrer avisos.', detail: String(error).slice(0, 200) }, { status: 500 });
  }
}
