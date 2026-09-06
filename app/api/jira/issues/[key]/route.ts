import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError, updateJiraIssue } from '@/lib/server/jira';

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
  try {
    await requireApiUser(request);
    const { key } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await updateJiraIssue(key, body), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao atualizar chamado do Jira', error);
    return Response.json({ error: 'Não foi possível atualizar o chamado no Jira.' }, { status: 500 });
  }
}
