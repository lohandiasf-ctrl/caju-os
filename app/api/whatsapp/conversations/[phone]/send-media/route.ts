import { requireApiUser } from '@/lib/server/firebase-auth';
import { bridgeFetch, recordOutgoing, senderLabelFor, WHATSAPP_SUPPORT_ROLES } from '@/lib/server/whatsapp-bridge';
import { signWhatsappText } from '@/lib/whatsapp-sender';

// WhatsApp caps media at 16 MB and documents at 100 MB; stay well under the
// Worker's request limits and the bridge's disk.
const MAX_BYTES = 32 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireApiUser(request, [...WHATSAPP_SUPPORT_ROLES]);
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || !file.size) return Response.json({ error: 'Selecione um arquivo.' }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: 'Arquivo grande demais (máximo 32 MB).' }, { status: 413 });
    const caption = typeof form?.get('caption') === 'string' ? String(form.get('caption')).trim().slice(0, 1024) : '';
    const voice = form?.get('voice') === '1';

    const params = new URLSearchParams({ to: contactPhone, fileName: file.name || 'arquivo' });
    // Sign the caption like text messages. Audio can't carry a caption in
    // WhatsApp, so voice notes and audio files go unsigned.
    const isAudio = voice || file.type.startsWith('audio/');
    const outgoingCaption = isAudio ? caption : signWhatsappText(await senderLabelFor(current), caption);
    if (outgoingCaption) params.set('caption', outgoingCaption);
    if (voice) params.set('voice', '1');
    const response = await bridgeFetch(`/send-media?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: await file.arrayBuffer(),
    });
    const payload = await response.json().catch(() => null) as { wamid?: string; mediaId?: string; messageType?: string; error?: string } | null;
    if (!response.ok || !payload?.wamid) {
      return Response.json({ error: payload?.error || 'O bridge do WhatsApp recusou o arquivo.' }, { status: 502 });
    }

    await recordOutgoing({
      wamid: payload.wamid, phoneNumberId: 'bridge', contactPhone,
      messageType: payload.messageType ?? 'document',
      body: caption || (payload.messageType === 'document' ? file.name : null),
      mediaId: payload.mediaId ?? null, senderEmail: current.email,
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível enviar o arquivo.' }, { status: 500 }); }
}
