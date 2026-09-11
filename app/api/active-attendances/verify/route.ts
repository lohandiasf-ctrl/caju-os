import { normalizeFsaKeys } from '@/lib/active-attendances';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { JiraError } from '@/lib/server/jira';
import { verifyIssues } from '@/app/api/active-attendances/route';

export async function POST(request: Request) {
  try {
    await requireApiUser(request);
    const body = (await request.json()) as { ticketKeys?: unknown };
    const ticketKeys = normalizeFsaKeys(body.ticketKeys);
    if (!ticketKeys.length) {
      return Response.json({ error: 'Digite uma FSA no formato FSA-12345.', valid: [], invalid: [] }, { status: 400 });
    }
    if (ticketKeys.length > 20) {
      return Response.json({ error: 'Adicione no máximo 20 FSAs por vez.', valid: [], invalid: ticketKeys }, { status: 400 });
    }
    return Response.json(await verifyIssues(ticketKeys));
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Não foi possível verificar as FSAs no Jira.' }, { status: 500 });
  }
}
