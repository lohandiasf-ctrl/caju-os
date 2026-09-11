import { getDb } from '@/db';
import { operationalAudit, ticketSnapshots } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';

const MAX_BATCH_SIZE = 40;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    if (!['gerencia', 'coordenador', 'analista', 'n1'].includes(user.role)) {
      return Response.json({ error: 'Seu perfil não pode agendar chamados.' }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const keys = Array.from(new Set(
      (Array.isArray(body.keys) ? body.keys : [])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^FSA-\d+$/.test(value)),
    ));
    const technicianData = typeof body.technicianData === 'string' ? body.technicianData.trim() : '';
    const scheduledDateTime = typeof body.scheduledDateTime === 'string' ? body.scheduledDateTime.trim() : '';

    if (!keys.length) return Response.json({ error: 'Selecione ao menos um chamado válido.' }, { status: 400 });
    if (keys.length > MAX_BATCH_SIZE) return Response.json({ error: `Agende no máximo ${MAX_BATCH_SIZE} chamados por vez.` }, { status: 400 });
    if (!technicianData || !scheduledDateTime) return Response.json({ error: 'Informe o técnico e a data/hora do atendimento.' }, { status: 400 });
    if (Number.isNaN(Date.parse(scheduledDateTime))) return Response.json({ error: 'A data/hora informada é inválida.' }, { status: 400 });

    const db = getDb();
    const results: Array<{ key: string; ok: boolean; error?: string }> = [];
    for (const key of keys) {
      try {
        const before = await getJiraIssue(key);
        await db.insert(ticketSnapshots).values({
          ticketKey: key,
          actorEmail: user.email,
          reason: 'Antes do agendamento em lote',
          snapshot: JSON.stringify({ status: before.status, fields: before.operationalFields }),
          createdAt: new Date().toISOString(),
        });
        await updateJiraIssue(key, { technicianData, scheduledDateTime });
        await transitionJiraIssue(key, 'scheduled', { technicianData, scheduledDateTime });
        const after = await getJiraIssue(key);
        await db.insert(operationalAudit).values({
          ticketKey: key,
          action: 'Chamado agendado em lote no Jira',
          actorEmail: user.email,
          details: JSON.stringify({
            collaborator: user.email,
            origin: 'sistema',
            reason: 'Agendamento em lote',
            changedAt: new Date().toISOString(),
            before: { status: before.status, fields: before.operationalFields },
            after: { status: after.status, fields: after.operationalFields },
          }),
          createdAt: new Date().toISOString(),
        });
        results.push({ key, ok: true });
      } catch (error) {
        results.push({ key, ok: false, error: error instanceof JiraError ? error.message : 'Não foi possível agendar este chamado no Jira.' });
      }
    }

    return Response.json({ ok: results.some((item) => item.ok), results });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha no agendamento em lote', error);
    return Response.json({ error: 'Não foi possível executar o agendamento em lote.' }, { status: 500 });
  }
}
