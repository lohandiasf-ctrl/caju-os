import { getDb } from '@/db';
import { operationalAudit, operationalWorkflows, technicians, ticketSnapshots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { bulkIneligibleReason, BULK_STATUS_LABEL, canBulkTransition, isBulkEligible, MAX_BULK_TICKETS, type BulkStatus } from '@/lib/bulk-actions';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';
import { enqueueJiraSync, shouldQueueJiraError } from '@/lib/server/jira-sync';
import { captureTicketArchive } from '@/lib/server/ticket-archive';

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
    const rawTechnicianId = Number(body.technicianId);
    const scheduledDateTime = typeof body.scheduledDateTime === 'string' ? body.scheduledDateTime.trim() : '';

    if (!status) return Response.json({ error: 'Ação em lote inválida.' }, { status: 400 });
    if (!keys.length) return Response.json({ error: 'Selecione ao menos um chamado válido.' }, { status: 400 });
    if (keys.length > MAX_BULK_TICKETS) return Response.json({ error: `Altere no máximo ${MAX_BULK_TICKETS} chamados por vez.` }, { status: 400 });
    if (status === 'scheduled') {
      if (!technicianData || !scheduledDateTime) return Response.json({ error: 'Informe os dados do técnico e a data/hora do atendimento.' }, { status: 400 });
      if (Number.isNaN(Date.parse(scheduledDateTime))) return Response.json({ error: 'A data/hora informada é inválida.' }, { status: 400 });
    }

    const fields = status === 'scheduled' ? { technicianData, scheduledDateTime } : {};
    const label = BULK_STATUS_LABEL[status];
    const db = getDb();
    // Não é obrigatório escolher um técnico da lista: se não veio id, tenta achar
    // pelo CPF ou nome digitado no texto, igual à edição de um chamado só
    // (app/api/jira/issues/[key]/route.ts). Sem casar, technicianId fica null —
    // a coluna é opcional (db/schema.ts, operationalWorkflows.technicianId).
    let technicianId: number | null = null;
    if (status === 'scheduled') {
      if (Number.isSafeInteger(rawTechnicianId) && rawTechnicianId > 0) {
        const technician = await db.select({ id: technicians.id }).from(technicians).where(eq(technicians.id, rawTechnicianId)).get();
        if (!technician) return Response.json({ error: 'Técnico cadastrado não encontrado.' }, { status: 400 });
        technicianId = technician.id;
      } else {
        const cpf = technicianData.match(/CPF:\s*([0-9.\-]+)/i)?.[1].replace(/\D/g, '') ?? '';
        const name = technicianData.match(/(?:Nome completo|Nome):\s*([^\r\n]+)/i)?.[1].trim().toLocaleLowerCase('pt-BR') ?? '';
        if (cpf || name) {
          const candidates = await db.select({ id: technicians.id, name: technicians.name, cpf: technicians.cpf }).from(technicians).all();
          const matches = candidates.filter((item) => cpf
            ? String(item.cpf ?? '').replace(/\D/g, '') === cpf
            : name && item.name.trim().toLocaleLowerCase('pt-BR') === name);
          if (matches.length === 1) technicianId = matches[0].id;
        }
      }
    }

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
        if (status === 'scheduled') {
          await db.insert(operationalWorkflows).values({
            ticketKey: key, status: 'scheduled', technicianId, scheduledAt: new Date(scheduledDateTime).toISOString(),
            scheduledByEmail: user.email, createdBy: user.email, createdAt: now, updatedAt: now,
          }).onConflictDoUpdate({ target: operationalWorkflows.ticketKey, set: {
            status: 'scheduled', technicianId, scheduledAt: new Date(scheduledDateTime).toISOString(),
            scheduledByEmail: user.email, updatedAt: now,
          } });
        }
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
        const workflow = await db.select().from(operationalWorkflows).where(eq(operationalWorkflows.ticketKey, key)).get();
        await captureTicketArchive(db, {
          ticketKey: key,
          title: after.summary,
          jiraStatus: after.status,
          operationalStatus: workflow?.status ?? status,
          storeName: after.store ?? workflow?.storeName,
          city: after.city ?? workflow?.city,
          snapshot: { jira: after, workflow: workflow ?? null, bulk: { status, keys, technicianId } },
          actorEmail: user.email,
          reason: `Jira alterado em lote: ${label}`,
          capturedAt: now,
        }).catch(() => undefined);
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
