import { env } from 'cloudflare:workers';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers, operationalWorkflows, pushAlertsSent, pushDevices, pushPreferences } from '@/db/schema';
import { CLOSED_WORKFLOW_STATUSES, slaHoursOf, WORKFLOW_STATUS_LABEL } from '@/lib/operational-sla';
import { chunk } from '@/lib/push-message';
import { detectAlerts, notesFor, OPS_ROLES, parsePrefs, type QueueIssue } from '@/lib/push-alerts';
import { searchJiraIssues } from '@/lib/server/jira';
import { sendPushToEmails } from '@/lib/server/push';

// Chamado pela rotina agendada (scripts/worker-entry.js, a cada 10 min).
// Descobre o que acabou de cruzar um limite na fila (SLA, sem agendamento há
// 2 h, horário agendado que passou, chamado novo) e avisa, uma vez só, quem
// ligou aquele tipo de aviso no app do celular.

const KEEP_DAYS = 30;
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
        for (const note of notesFor(fresh, prefs.get(email) ?? parsePrefs(null))) {
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
