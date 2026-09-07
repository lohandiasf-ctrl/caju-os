import { requireApiUser } from '@/lib/server/firebase-auth';
import { jiraSyncSummary, processJiraSyncJobs } from '@/lib/server/jira-sync';
import { isJiraConfigured } from '@/lib/server/jira';

const roles = ['gerencia', 'coordenador', 'analista'] as const;

export async function GET(request: Request) {
  try {
    await requireApiUser(request, [...roles]);
    return Response.json({ configured: isJiraConfigured(), ...(await jiraSyncSummary()) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível consultar a integração.' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await requireApiUser(request, [...roles]);
    const results = await processJiraSyncJobs(20);
    return Response.json({ processed: results.length, results, ...(await jiraSyncSummary()) });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível repetir as sincronizações.' }, { status: 500 }); }
}
