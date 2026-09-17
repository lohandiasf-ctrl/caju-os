import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { rovoRequests } from '@/db/schema';
import { ActionError, parseAction } from '@/lib/assistant-actions';
import { canAnswer, parseCallback, secretMatches, CallbackError } from '@/lib/rovo';
import { recordProposal } from '@/lib/server/assistant-actions';
import { enforceRateLimit } from '@/lib/server/rate-limit';

// Volta do Rovo, entregue pela ação "Send web request" da regra de Automation.
//
// Este endpoint é PÚBLICO por necessidade: o Jira não manda token do Firebase.
// A porta é o segredo compartilhado em ROVO_CALLBACK_SECRET, comparado em
// tempo constante. Tudo que chega aqui é tratado como entrada hostil.
export async function POST(request: Request) {
  try {
    enforceRateLimit(request, 'rovo-callback', { limit: 60, windowMs: 60_000 });
    const expected = (env as unknown as { ROVO_CALLBACK_SECRET?: string }).ROVO_CALLBACK_SECRET;
    if (!expected) {
      return Response.json({ error: 'Callback não configurado.' }, { status: 503 });
    }
    if (!secretMatches(request.headers.get('x-rovo-secret'), expected)) {
      return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const payload = parseCallback(await request.json().catch(() => null));
    const db = getDb();
    const row = await db.select().from(rovoRequests).where(eq(rovoRequests.id, payload.requestId)).get();
    if (!row) return Response.json({ error: 'Pergunta não encontrada.' }, { status: 404 });

    // Retentativa da regra de Automation não pode responder duas vezes.
    const allowed = canAnswer(row.status, row.createdAt);
    if (!allowed.ok) return Response.json({ error: allowed.reason }, { status: 409 });

    const answeredAt = new Date().toISOString();
    if (payload.failed) {
      await db.update(rovoRequests)
        .set({ status: 'failed', error: payload.answer || 'O Rovo não conseguiu responder.', answeredAt })
        .where(eq(rovoRequests.id, payload.requestId));
      return Response.json({ ok: true });
    }

    // Se o Rovo propôs uma ação, ela NÃO é aplicada aqui. Vira uma proposta
    // pendente, com as mesmas travas do assistente local: lista fechada,
    // confirmação de quem perguntou, e auditoria.
    let actionId: string | null = null;
    let actionWarning: string | null = null;
    if (payload.action) {
      if (!row.ticketKey) {
        actionWarning = 'O Rovo propôs uma ação, mas a pergunta não era sobre um chamado.';
      } else {
        try {
          const action = parseAction(payload.action, row.ticketKey);
          actionId = (await recordProposal(action, row.askedBy, 'rovo')).id;
        } catch (error) {
          if (!(error instanceof ActionError)) throw error;
          actionWarning = error.message;
        }
      }
    }

    await db.update(rovoRequests)
      .set({ status: 'answered', answer: payload.answer, actionId, error: actionWarning, answeredAt })
      .where(eq(rovoRequests.id, payload.requestId));
    return Response.json({ ok: true, actionId });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof CallbackError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Callback do Rovo', error);
    return Response.json({ error: 'Não foi possível registrar a resposta.' }, { status: 500 });
  }
}
