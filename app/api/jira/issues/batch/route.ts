import { getDb } from '@/db';
import { operationalAudit, ticketSnapshots } from '@/db/schema';
import { bulkIneligibleReason, BULK_STATUS_LABEL, canBulkTransition, isBulkEligible, MAX_BULK_TICKETS, type BulkStatus } from '@/lib/bulk-actions';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';
import { enqueueJiraSync, shouldQueueJiraError } from '@/lib/server/jira-sync';

// Chamados processados ao mesmo tempo: agiliza um lote de 40 sem estourar o rate limit do Jira.
const CONCURRENCY = 4;

type BatchResult = { key: string; ok: boolean; queued?: boolean; error?: string };

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    if (!canBulkTransition(user.role)) {
      return Response.json({ error: 'Seu perfil não pode alterar a etapa dos chamados.' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const status: BulkStatus | null = body.status === 'scheduled' || body.status === 'in_service' ? body.status : null;
    const keys = Array.from(new Set(
      (Array.isArray(body.keys) ? body.keys : [])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^FSA-\d+$/.test(value)),
    ));
    const technicianData = typeof body.technicianData === 'string' ? body.technicianData.trim() : '';
    const scheduledDateTime = typeof body.scheduledDateTime === 'string' ? body.scheduledDateTime.trim() : '';

    if (!status) return Response.json({ error: 'Ação em lote inválida.' }, { status: 400 });
    if (!keys.length) return Response.json({ error: 'Selecione ao menos um chamado válido.' }, { status: 400 });
    if (keys.length > MAX_BULK_TICKETS) return Response.json({ error: `Altere no máximo ${MAX_BULK_TICKETS} chamados por vez.` }, { status: 400 });
    if (status === 'scheduled') {
      if (!technicianData || !scheduledDateTime) return Response.json({ error: 'Informe o técnico e a data/hora do atendimento.' }, { status: 400 });
      if (Number.isNaN(Date.parse(scheduledDateTime))) return Response.json({ error: 'A data/hora informada é inválida.' }, { status: 400 });
    }

    const fields = status === 'scheduled' ? { technicianData, scheduledDateTime } : {};
    const label = BULK_STATUS_LABEL[status];
    const db = getDb();

    const results = await mapWithConcurrency(keys, CONCURRENCY, async (key): Promise<BatchResult> => {
      let eligible = false;
      try {
        const before = await getJiraIssue(key);
        if (!isBulkEligible(before.status, status)) return { key, ok: false, error: bulkIneligibleReason(before.status, status) };
        eligible = true;
        await db.insert(ticketSnapshots).values({
          ticketKey: key,
          actorEmail: user.email,
          reason: `Antes da alteração em lote para ${label}`,
          snapshot: JSON.stringify({ status: before.status, fields: before.operationalFields }),
          createdAt: new Date().toISOString(),
        });
        // Grava técnico e data antes da transição, como na rota de um chamado só.
        if (status === 'scheduled') await updateJiraIssue(key, fields);
        await transitionJiraIssue(key, status, fields);
        const after = await getJiraIssue(key);
        const now = new Date().toISOString();
        await db.insert(operationalAudit).values({
          ticketKey: key,
          action: `Jira alterado em lote para ${label}`,
          actorEmail: user.email,
          details: JSON.stringify({
            collaborator: user.email,
            origin: 'sistema',
            reason: `Alteração em lote (${keys.length} chamados)`,
            changedAt: now,
            before: { status: before.status, fields: before.operationalFields },
            after: { status: after.status, fields: after.operationalFields },
          }),
          createdAt: now,
        });
        return { key, ok: true };
      } catch (error) {
        // Jira fora do ar não trava o fluxo (WORKFLOW_RULES, regra 5) — mas só
        // enfileira quando a etapa de origem já foi conferida.
        if (eligible && shouldQueueJiraError(error)) {
          if (status === 'scheduled') await enqueueJiraSync(key, 'update', fields, user.email);
          await enqueueJiraSync(key, 'transition', { status, ...fields }, user.email);
          return { key, ok: false, queued: true, error: 'Jira indisponível. A alteração foi guardada e será repetida automaticamente.' };
        }
        return { key, ok: false, error: error instanceof JiraError ? error.message : 'Não foi possível atualizar este chamado no Jira.' };
      }
    });

    return Response.json({ ok: results.some((item) => item.ok || item.queued), results });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha na alteração em lote', error);
    return Response.json({ error: 'Não foi possível executar a alteração em lote.' }, { status: 500 });
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}
