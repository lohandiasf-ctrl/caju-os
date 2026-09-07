import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';
import { getDb } from '@/db';
import { operationalAudit } from '@/db/schema';
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
    const { status, ...fields } = body;
    if (typeof status === 'string' && !['gerencia', 'coordenador', 'n1', 'analista'].includes(user.role)) return Response.json({ error: 'Seu perfil pode preencher dados e evidências, mas não alterar a etapa do Jira.' }, { status: 403 });
    const editableFields = { ...fields };
    const before = await getJiraIssue(key);
    // Persist scheduling and technician fields before running Jira workflow validators.
    if (Object.keys(editableFields).length) await updateJiraIssue(key, editableFields, { allowNoop: typeof status === 'string' });
    if (typeof status === 'string') await transitionJiraIssue(key, status, fields);
    if (typeof status !== 'string' && !Object.keys(fields).length) throw new JiraError('Nenhuma alteração foi informada.', 400);
    const after = await getJiraIssue(key);
    await getDb().insert(operationalAudit).values({ ticketKey: key, action: typeof status === 'string' ? `Jira alterado para ${status}` : 'Campos do Jira atualizados', actorEmail: user.email, details: JSON.stringify({ before: { status: before.status, fields: before.operationalFields }, after: { status: after.status, fields: after.operationalFields } }), createdAt: new Date().toISOString() });
    return Response.json(after, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (shouldQueueJiraError(error)) {
      const { key } = await context.params;
      const { status, ...fields } = queueBody;
      if (Object.keys(fields).length) await enqueueJiraSync(key, 'update', fields, queueActor);
      if (typeof status === 'string') await enqueueJiraSync(key, 'transition', { status, ...fields }, queueActor);
      return Response.json({ queued: true, error: 'O Jira está temporariamente indisponível. A alteração foi guardada e será repetida automaticamente.' }, { status: 202 });
    }
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao atualizar chamado do Jira', error);
    return Response.json({ error: 'Não foi possível atualizar o chamado no Jira.' }, { status: 500 });
  }
}
