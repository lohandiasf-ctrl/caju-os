import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { employeePresence, operationalAudit } from '@/db/schema';
import { UPDATE_AUDIT_ACTION } from '@/lib/push-alerts';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { addJiraTicketUpdate } from '@/lib/server/jira';
import { authorFullName, ticketUpdateComment, ticketUpdateError } from '@/lib/ticket-update';

const ISSUE_KEY = /^FSA-\d+$/;

// "Atualizar chamado": grava a nota como comentário interno do Jira, assinada
// com nome e sobrenome do perfil de quem escreveu (nunca o e-mail).
export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    const key = (await context.params).key.toUpperCase();
    if (!ISSUE_KEY.test(key)) return Response.json({ error: 'Chamado inválido.' }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === 'string' ? body.text : '';
    const problem = ticketUpdateError(text);
    if (problem) return Response.json({ error: problem }, { status: 400 });

    const profile = await getDb().select({ displayName: employeePresence.displayName })
      .from(employeePresence).where(eq(employeePresence.email, user.email)).get();
    const author = authorFullName(profile?.displayName);
    if (!author) {
      return Response.json({ error: 'Complete seu perfil com nome e sobrenome antes de atualizar o chamado.' }, { status: 409 });
    }

    await addJiraTicketUpdate(key, ticketUpdateComment(text, author));
    const createdAt = new Date().toISOString();
    // Marca quem movimentou o chamado: vale para o aviso de comentário novo e
    // evita avisar a pessoa do próprio comentário. Falhar aqui não desfaz o comentário.
    await getDb().insert(operationalAudit).values({ ticketKey: key, action: UPDATE_AUDIT_ACTION, actorEmail: user.email, details: null, createdAt })
      .run().catch((error: unknown) => console.error('auditoria da atualização', error));
    return Response.json({ ok: true, author, createdAt });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao registrar atualização do chamado', error);
    return Response.json({ error: 'Não foi possível registrar a atualização no Jira. Tente de novo.' }, { status: 502 });
  }
}
