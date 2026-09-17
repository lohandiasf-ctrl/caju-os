import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { rovoRequests } from '@/db/schema';
import { outgoingPayload, validQuestion, MAX_QUESTION } from '@/lib/rovo';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { enforceRateLimit } from '@/lib/server/rate-limit';

// Manda a pergunta ao Rovo pelo webhook de entrada de uma regra de Jira
// Automation. A resposta NÃO vem aqui: volta depois em /api/rovo/callback.
// Ver docs/ROVO_BRIDGE.md para a regra que precisa existir no Jira.
export async function POST(request: Request) {
  try {
    const current = await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    // Cada pergunta consome uma execução de Automation do plano do Jira.
    enforceRateLimit(request, 'rovo-ask', { limit: 10, windowMs: 60_000 });

    const webhookUrl = (env as unknown as { ROVO_WEBHOOK_URL?: string }).ROVO_WEBHOOK_URL;
    if (!webhookUrl) {
      return Response.json({ error: 'A ponte com o Rovo não está configurada. Falta ROVO_WEBHOOK_URL.' }, { status: 503 });
    }
    const body = await request.json().catch(() => null) as { question?: string; ticketKey?: string } | null;
    if (!validQuestion(body?.question)) {
      return Response.json({ error: `Escreva a pergunta (de 3 a ${MAX_QUESTION} caracteres).` }, { status: 400 });
    }
    const ticketKey = typeof body?.ticketKey === 'string' && body.ticketKey.trim() ? body.ticketKey.trim().toUpperCase() : null;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    // A linha nasce ANTES do disparo: se o webhook responder rápido demais, o
    // callback não pode chegar a uma pergunta que ainda não existe.
    await getDb().insert(rovoRequests).values({ id, question: body!.question!.trim(), ticketKey, askedBy: current.email, status: 'pending', createdAt });

    const callbackUrl = new URL('/api/rovo/callback', request.url).toString();
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outgoingPayload({ requestId: id, question: body!.question!, ticketKey, askedBy: current.email, callbackUrl })),
      signal: AbortSignal.timeout(10_000),
    }).catch((reason) => { console.error('Webhook do Rovo', reason); return null; });

    if (!upstream || !upstream.ok) {
      const error = upstream ? `O Jira recusou a pergunta (HTTP ${upstream.status}).` : 'Não foi possível falar com o Jira.';
      await getDb().update(rovoRequests).set({ status: 'failed', error, answeredAt: new Date().toISOString() }).where(eq(rovoRequests.id, id));
      return Response.json({ error }, { status: 502 });
    }
    return Response.json({ id, status: 'pending' });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Pergunta ao Rovo', error);
    return Response.json({ error: 'Não foi possível enviar a pergunta ao Rovo.' }, { status: 500 });
  }
}
