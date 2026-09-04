import { requireApiUser } from '@/lib/server/firebase-auth';
import { getFinancialDiagnostics, getFinancialIssues, getJiraFinancialValueDiagnostics, JiraError } from '@/lib/server/jira';

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') ?? 180);
    const issues = await getFinancialIssues(days);
    const diagnostics = url.searchParams.has('diag')
      ? { discovery: getFinancialDiagnostics(), values: await getJiraFinancialValueDiagnostics(days) }
      : undefined;
    return Response.json({ issues, ...(diagnostics ? { diagnostics } : {}) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao consultar financeiro no Jira', error);
    return Response.json({ error: 'Falha ao carregar dados financeiros.' }, { status: 500 });
  }
}
