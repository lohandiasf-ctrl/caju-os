import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { bridgeConfigured, bridgeFetch, recordOutgoing, WHATSAPP_SUPPORT_ROLES } from '@/lib/server/whatsapp-bridge';

export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireApiUser(request, [...WHATSAPP_SUPPORT_ROLES]);
    const useBridge = bridgeConfigured();
    if (!useBridge && (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID)) {
      return Response.json({ error: 'Envio pelo WhatsApp ainda não está configurado: falta o token de acesso da Meta e o Phone Number ID (ou o bridge não-oficial).' }, { status: 503 });
    }
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const body = await request.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 4096) : '';
    if (!text) return Response.json({ error: 'Escreva uma mensagem.' }, { status: 400 });

    let wamid: string;
    let phoneNumberId: string;
    if (useBridge) {
      const response = await bridgeFetch('/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: contactPhone, text }),
      });
      const payload = await response.json().catch(() => null) as { wamid?: string; error?: string } | null;
      if (!response.ok || !payload?.wamid) {
        return Response.json({ error: payload?.error || 'O bridge do WhatsApp recusou o envio. Confira se ele está rodando e conectado.' }, { status: 502 });
      }
      wamid = payload.wamid;
      phoneNumberId = 'bridge';
    } else {
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
      wamid = payload.messages[0].id;
      phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID!;
    }

    await recordOutgoing({ wamid, phoneNumberId, contactPhone, messageType: 'text', body: text, mediaId: null, senderEmail: current.email });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 }); }
}
