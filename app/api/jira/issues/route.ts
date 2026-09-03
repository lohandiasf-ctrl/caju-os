import { requireApiUser } from '@/lib/server/firebase-auth';
import { JiraError, searchJiraIssues } from '@/lib/server/jira';

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'n1', 'analista']);
    const url = new URL(request.url);
    const data = await searchJiraIssues({ query: url.searchParams.get('q') ?? undefined, status: url.searchParams.get('status') ?? undefined, nextPageToken: url.searchParams.get('cursor') ?? undefined, maxResults: Number(url.searchParams.get('limit') ?? 50) });
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao consultar chamados do Jira', error);
    return Response.json({ error: 'Falha inesperada ao consultar o Jira.' }, { status: 500 });
  }
}
