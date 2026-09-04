import { requireApiUser } from '@/lib/server/firebase-auth';
import { getFinancialIssues, JiraError } from '@/lib/server/jira';

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const days = Number(new URL(request.url).searchParams.get('days') ?? 180);
    return Response.json({ issues: await getFinancialIssues(days) }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao consultar financeiro no Jira', error);
    return Response.json({ error: 'Falha ao carregar dados financeiros.' }, { status: 500 });
  }
}
