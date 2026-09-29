import { dispatchMode, offerTicket, ticketOffer } from '@/lib/server/dispatch';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Oferta de um chamado pelo WhatsApp, na tela do chamado (gerência e
// coordenação). GET: a oferta mais recente e quantos receberam. POST: oferece
// o chamado aos técnicos da cidade, ou reenvia a oferta que ainda vale.

const KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'analista']);
    const key = decodeURIComponent((await params).key).toUpperCase();
    if (!KEY.test(key)) return Response.json({ error: 'Chamado inválido.' }, { status: 400 });
    return Response.json({ mode: dispatchMode(), offer: await ticketOffer(key) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível consultar a oferta.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireApiUser(request, ['gerencia', 'coordenador', 'analista']);
    const key = decodeURIComponent((await params).key).toUpperCase();
    if (!KEY.test(key)) return Response.json({ error: 'Chamado inválido.' }, { status: 400 });
    // Anexos (outros FSAs da mesma cidade) e valor: só na oferta manual, pela tela do chamado.
    const body = await request.json().catch(() => ({})) as { extra?: unknown; value?: unknown };
    const extra = Array.isArray(body.extra) ? body.extra.filter((k): k is string => typeof k === 'string') : [];
    const value = typeof body.value === 'string' ? body.value : null;
    const result = await offerTicket(key, user.email, new Date(), { extra, value });
    if ('error' in result) return Response.json(result, { status: 409 });
    return Response.json({ ...result, offer: await ticketOffer(key) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('dispatch ticket offer failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'Não foi possível oferecer o chamado.' }, { status: 500 });
  }
}
