import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { whatsappConversations, whatsappMessages } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

const SUPPORT_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireApiUser(request, [...SUPPORT_ROLES]);
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      return Response.json({ error: 'Envio pelo WhatsApp ainda não está configurado: falta o token de acesso da Meta e o Phone Number ID.' }, { status: 503 });
    }
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const body = await request.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 4096) : '';
    if (!text) return Response.json({ error: 'Escreva uma mensagem.' }, { status: 400 });

    const response = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: contactPhone, type: 'text', text: { body: text } }),
    });
    const payload = await response.json() as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!response.ok || !payload.messages?.[0]?.id) {
      // The 24h session-window rule is the most common failure: outside it,
      // only a pre-approved template message is allowed, not free text.
      return Response.json({ error: payload.error?.message || 'O WhatsApp recusou o envio. Fora da janela de 24h, só é possível responder com uma mensagem de modelo aprovada.' }, { status: 502 });
    }

    const now = new Date().toISOString();
    const db = getDb();
    await db.insert(whatsappMessages).values({
      wamid: payload.messages[0].id, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, contactPhone, contactName: null,
      direction: 'outgoing', messageType: 'text', body: text, mediaId: null, deliveryStatus: null, senderEmail: current.email,
      occurredAt: now, createdAt: now,
    });
    await db.insert(whatsappConversations).values({ contactPhone, lastMessageAt: now, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: whatsappConversations.contactPhone, set: { lastMessageAt: now, updatedAt: now } });

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 }); }
}
