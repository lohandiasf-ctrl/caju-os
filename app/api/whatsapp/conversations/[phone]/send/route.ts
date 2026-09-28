import { bridgeConfigured, bridgeFetch, recordOutgoing, requireWhatsappUser, senderLabelFor } from '@/lib/server/whatsapp-bridge';
import { signWhatsappText } from '@/lib/whatsapp-sender';
import { toWhatsappAccount } from '@/lib/whatsapp-accounts';

export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireWhatsappUser(request);
    // A resposta sai pelo número que recebeu a conversa; mandar pelo outro
    // chegaria como mensagem de um desconhecido.
    const account = toWhatsappAccount(new URL(request.url).searchParams.get('account'));
    // O número da API oficial (WHATSAPP_PHONE_NUMBER_ID) é o da distribuição de
    // chamados. Sem o bridge, responder por ele mandaria a mensagem do Suporte ou
    // da Caju de um número que o contato não conhece.
    if (!bridgeConfigured(account)) {
      return Response.json({ error: 'O WhatsApp desta caixa não está conectado. Configure o bridge dela para responder.' }, { status: 503 });
    }
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const body = await request.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 4096) : '';
    if (!text) return Response.json({ error: 'Escreva uma mensagem.' }, { status: 400 });
    // The contact sees who on the team is answering, as a bold first line.
    const signedText = signWhatsappText(await senderLabelFor(current), text);

    const response = await bridgeFetch('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: contactPhone, text: signedText }),
    }, account);
    const payload = await response.json().catch(() => null) as { wamid?: string; error?: string } | null;
    if (!response.ok || !payload?.wamid) {
      return Response.json({ error: payload?.error || 'O bridge do WhatsApp recusou o envio. Confira se ele está rodando e conectado.' }, { status: 502 });
    }
    const wamid = payload.wamid;
    const phoneNumberId = 'bridge';

    await recordOutgoing({ account, wamid, phoneNumberId, contactPhone, messageType: 'text', body: text, mediaId: null, senderEmail: current.email });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 }); }
}
