import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { jiraSyncJobs, operationalAudit } from '@/db/schema';
import { retryDelaySeconds } from '@/lib/operational-rules';
import { JiraError, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';

type SyncOperation = 'update' | 'transition';

export async function enqueueJiraSync(issueKey: string, operation: SyncOperation, payload: Record<string, unknown>, actorEmail: string, idempotencyKey?: string) {
  const now = new Date().toISOString();
  const key = idempotencyKey ?? crypto.randomUUID();
  await getDb().insert(jiraSyncJobs).values({ issueKey, operation, payload: JSON.stringify(payload), status: 'pending', attempts: 0, idempotencyKey: key, actorEmail, nextAttemptAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing();
  await audit(issueKey, 'Sincronização com Jira adicionada à fila', actorEmail, { operation, idempotencyKey: key });
  return key;
}

export async function processJiraSyncJobs(limit = 10) {
  const db = getDb();
  const now = new Date().toISOString();
  const jobs = await db.select().from(jiraSyncJobs).where(and(inArray(jiraSyncJobs.status, ['pending', 'failed']), lte(jiraSyncJobs.nextAttemptAt, now))).orderBy(asc(jiraSyncJobs.createdAt)).limit(Math.min(25, Math.max(1, limit))).all();
  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  for (const job of jobs) {
    await db.update(jiraSyncJobs).set({ status: 'processing', updatedAt: now }).where(eq(jiraSyncJobs.id, job.id));
    try {
      const payload = JSON.parse(job.payload) as Record<string, unknown>;
      if (job.operation === 'update') await updateJiraIssue(job.issueKey, payload, { allowNoop: true });
      else await transitionJiraIssue(job.issueKey, String(payload.status ?? ''), payload);
      const doneAt = new Date().toISOString();
      await db.update(jiraSyncJobs).set({ status: 'succeeded', attempts: job.attempts + 1, lastError: null, updatedAt: doneAt }).where(eq(jiraSyncJobs.id, job.id));
      await audit(job.issueKey, 'Sincronização com Jira concluída', job.actorEmail, { operation: job.operation, attempts: job.attempts + 1 });
      results.push({ id: job.id, ok: true });
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Falha desconhecida';
      const nextAttemptAt = new Date(Date.now() + retryDelaySeconds(attempts) * 1000).toISOString();
      await db.update(jiraSyncJobs).set({ status: 'failed', attempts, lastError: message, nextAttemptAt, updatedAt: new Date().toISOString() }).where(eq(jiraSyncJobs.id, job.id));
      results.push({ id: job.id, ok: false, error: message });
    }
  }
  return results;
}

export async function jiraSyncSummary(issueKey?: string) {
  const rows = issueKey
    ? await getDb().select().from(jiraSyncJobs).where(eq(jiraSyncJobs.issueKey, issueKey)).orderBy(asc(jiraSyncJobs.createdAt)).all()
    : await getDb().select().from(jiraSyncJobs).orderBy(asc(jiraSyncJobs.createdAt)).all();
  return {
    pending: rows.filter((row) => row.status === 'pending' || row.status === 'processing' || row.status === 'failed').length,
    succeeded: rows.filter((row) => row.status === 'succeeded').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    lastSuccessAt: [...rows].reverse().find((row) => row.status === 'succeeded')?.updatedAt ?? null,
    jobs: rows.slice(-20).reverse(),
  };
}

export function shouldQueueJiraError(error: unknown) {
  return error instanceof JiraError && (error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500);
}

async function audit(ticketKey: string, action: string, actorEmail: string, details: unknown) {
  await getDb().insert(operationalAudit).values({ ticketKey, action, actorEmail, details: JSON.stringify(details), createdAt: new Date().toISOString() });
}
