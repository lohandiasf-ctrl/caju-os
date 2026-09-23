import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { employeePresence } from '@/db/schema';
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
    return Response.json({ ok: true, author, createdAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao registrar atualização do chamado', error);
    return Response.json({ error: 'Não foi possível registrar a atualização no Jira. Tente de novo.' }, { status: 502 });
  }
}
