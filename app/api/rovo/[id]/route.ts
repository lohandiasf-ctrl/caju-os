import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { rovoRequests } from '@/db/schema';
import { isExpired } from '@/lib/rovo';
import { requireApiUser } from '@/lib/server/firebase-auth';

// A tela consulta aqui enquanto espera a volta do Rovo.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    const { id } = await context.params;
    const row = await getDb().select().from(rovoRequests).where(eq(rovoRequests.id, id)).get();
    if (!row) return Response.json({ error: 'Pergunta não encontrada.' }, { status: 404 });
    // Pergunta é de quem perguntou; coordenação e gerência enxergam tudo.
    if (row.askedBy !== current.email && !['gerencia', 'coordenador'].includes(current.role)) {
      return Response.json({ error: 'Esta pergunta é de outra pessoa.' }, { status: 403 });
    }

    // Sem resposta e sem tempo: a regra de Automation falhou calada. Marcar na
    // leitura evita deixar a pergunta pendente para sempre — não há cron aqui.
    if (isExpired(row.status, row.createdAt)) {
      const error = 'O Rovo não respondeu a tempo. Verifique a regra de Automation no Jira.';
      await getDb().update(rovoRequests).set({ status: 'expired', error, answeredAt: new Date().toISOString() }).where(eq(rovoRequests.id, id));
      return Response.json({ status: 'expired', error });
    }
    return Response.json({ status: row.status, answer: row.answer, error: row.error, actionId: row.actionId });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Consulta ao Rovo', error);
    return Response.json({ error: 'Não foi possível consultar a resposta.' }, { status: 500 });
  }
}
