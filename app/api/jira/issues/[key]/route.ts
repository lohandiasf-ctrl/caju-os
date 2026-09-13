import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';
import { getDb } from '@/db';
import { operationalAudit, operationalWorkflows, technicians, ticketSnapshots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { enqueueJiraSync, shouldQueueJiraError } from '@/lib/server/jira-sync';

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    await requireApiUser(request);
    const { key } = await context.params;
    return Response.json(await getJiraIssue(key), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao consultar chamado do Jira', error);
    return Response.json({ error: 'Falha inesperada ao consultar o Jira.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  let queueActor = '';
  let queueBody: Record<string, unknown> = {};
  try {
    const user = await requireApiUser(request);
    queueActor = user.email;
    const { key } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    queueBody = body;
    const { status, changeReason, changeOrigin, ...fields } = body;
    if (typeof status === 'string' && !['gerencia', 'coordenador', 'n1', 'analista'].includes(user.role)) return Response.json({ error: 'Seu perfil pode preencher dados e evidências, mas não alterar a etapa do Jira.' }, { status: 403 });
    const editableFields = { ...fields };
    const before = await getJiraIssue(key);
    await getDb().insert(ticketSnapshots).values({ ticketKey: key, actorEmail: user.email, reason: 'Antes da alteração direta no Jira', snapshot: JSON.stringify({ status: before.status, fields: before.operationalFields }), createdAt: new Date().toISOString() });
    // Persist scheduling and technician fields before running Jira workflow validators.
    if (Object.keys(editableFields).length) await updateJiraIssue(key, editableFields, { allowNoop: typeof status === 'string' });
    if (typeof status === 'string') await transitionJiraIssue(key, status, fields);
    if (typeof status !== 'string' && !Object.keys(fields).length) throw new JiraError('Nenhuma alteração foi informada.', 400);
    const after = await getJiraIssue(key);
    const now = new Date().toISOString();
    if (status === 'scheduled' || typeof fields.scheduledDateTime === 'string') {
      const date = after.operationalFields?.scheduledDateTime;
      const scheduledAt = typeof date === 'string' && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null;
      if (scheduledAt) {
        const existing = await getDb().select().from(operationalWorkflows).where(eq(operationalWorkflows.ticketKey, key)).get();
        const technicianText = String(after.operationalFields?.technicianData ?? '');
        const cpf = technicianText.match(/CPF:\s*([0-9.\-]+)/i)?.[1].replace(/\D/g, '') ?? '';
        const name = technicianText.match(/(?:Nome completo|Nome):\s*([^\r\n]+)/i)?.[1].trim().toLocaleLowerCase('pt-BR') ?? '';
        const candidates = await getDb().select({ id: technicians.id, name: technicians.name, cpf: technicians.cpf }).from(technicians).all();
        const matches = candidates.filter((item) => cpf
          ? String(item.cpf ?? '').replace(/\D/g, '') === cpf
          : name && item.name.trim().toLocaleLowerCase('pt-BR') === name);
        const technicianId = matches.length === 1 ? matches[0].id : existing?.technicianId ?? null;
        if (existing) await getDb().update(operationalWorkflows).set({ scheduledAt, scheduledByEmail: user.email, technicianId, updatedAt: now }).where(eq(operationalWorkflows.id, existing.id));
        else await getDb().insert(operationalWorkflows).values({ ticketKey: key, status: 'scheduled', scheduledAt, scheduledByEmail: user.email, technicianId, createdBy: user.email, createdAt: now, updatedAt: now });
      }
    }
    await getDb().insert(operationalAudit).values({
      ticketKey: key,
      action: typeof status === 'string' ? `Jira alterado para ${status}` : 'Campos do Jira atualizados',
      actorEmail: user.email,
      details: JSON.stringify({ collaborator: user.email, origin: typeof changeOrigin === 'string' && changeOrigin === 'sistema' ? 'sistema' : 'Jira', reason: typeof changeReason === 'string' && changeReason.trim() ? changeReason.trim().slice(0, 500) : 'Edição direta nos detalhes do chamado', changedAt: now, changes: diffJira({ status: before.status, ...before.operationalFields }, { status: after.status, ...after.operationalFields }), before: { status: before.status, fields: before.operationalFields }, after: { status: after.status, fields: after.operationalFields } }),
      createdAt: now,
    });
    return Response.json(after, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (shouldQueueJiraError(error)) {
      const { key } = await context.params;
      const { status, changeReason: _reason, changeOrigin: _origin, ...fields } = queueBody;
      if (Object.keys(fields).length) await enqueueJiraSync(key, 'update', fields, queueActor);
      if (typeof status === 'string') await enqueueJiraSync(key, 'transition', { status, ...fields }, queueActor);
      return Response.json({ queued: true, error: 'O Jira está temporariamente indisponível. A alteração foi guardada e será repetida automaticamente.' }, { status: 202 });
    }
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao atualizar chamado do Jira', error);
    return Response.json({ error: 'Não foi possível atualizar o chamado no Jira.' }, { status: 500 });
  }
}

function diffJira(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.entries(after).flatMap(([field, value]) => {
    const previous = before[field] ?? null;
    const next = value ?? null;
    return String(previous ?? '') === String(next ?? '') ? [] : [{ field, previous, next }];
  });
}
