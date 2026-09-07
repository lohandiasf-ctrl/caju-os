import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError } from '@/lib/server/jira';
import { jiraSyncSummary } from '@/lib/server/jira-sync';
import { validationRequirements } from '@/lib/operational-rules';

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    await requireApiUser(request);
    const { key } = await context.params;
    const [issue, sync] = await Promise.all([getJiraIssue(key), jiraSyncSummary(key)]);
    const summary = parseSummary(issue.operationalFields.defectSummary);
    const missing = validationRequirements({ status: issue.status, ticketTotal: issue.operationalFields.ticketTotal, attachmentCount: issue.attachments.length, ...summary, pendingSync: sync.pending });
    return Response.json({ ready: missing.length === 0, missing, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Não foi possível validar o chamado.' }, { status: 500 });
  }
}

function parseSummary(value: string | null) {
  const text = value ?? '';
  const take = (start: string, end?: string) => text.match(new RegExp(`${start}:?\\s*([\\s\\S]*?)${end ? `(?=${end}:?)` : '$'}`, 'i'))?.[1]?.trim() ?? '';
  return { identifiedProblem: take('PROBLEMA IDENTIFICADO', 'TESTES FEITOS'), testsPerformed: take('TESTES FEITOS', 'PEÇA A SER TROCADA'), partToReplace: take('PEÇA A SER TROCADA') };
}
