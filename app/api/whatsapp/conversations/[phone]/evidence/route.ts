import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { operationalAudit, ticketEvidence, whatsappConversations, whatsappMessages } from '@/db/schema';
import { isAllowedUploadMime, isSafeDataUrl, isSafeUpload } from '@/lib/safe-data-url';
import { JiraError, uploadJiraAttachments } from '@/lib/server/jira';
import { logSecurityEvent } from '@/lib/server/security-log';
import { bridgeFetch, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';
import { splitTicketKeys, ticketEvidenceKind } from '@/lib/whatsapp-bridge-payload';

const EVIDENCE_TYPES = new Set(['image', 'video', 'document']);
const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
// Same cap app/api/n1-tickets/[key] applies to ticket_evidence rows.
const MAX_N1_DATA_URL_LENGTH = 1_800_000;
const MAX_N1_EVIDENCE_BYTES = Math.floor((MAX_N1_DATA_URL_LENGTH - 100) * 3 / 4);
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf',
};

// Attaches a photo, video or document received in a conversation to one of
// the FSAs linked to that conversation, as a Jira attachment (same place as
// "Anexos e evidências" in the ticket details).
export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const user = await requireWhatsappUser(request);
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const body = await request.json().catch(() => null) as { wamid?: unknown; ticketKey?: unknown; kind?: unknown } | null;
    const wamid = typeof body?.wamid === 'string' ? body.wamid : '';
    const ticketKey = typeof body?.ticketKey === 'string' ? body.ticketKey.trim().toUpperCase() : '';
    const kind = body?.kind === 'rat' ? 'rat' : 'evidence';
    if (!wamid || !ticketKey) return Response.json({ error: 'Mensagem e FSA são obrigatórias.' }, { status: 400 });

    const db = getDb();
    const [conversation, message] = await Promise.all([
      db.select({ ticketKey: whatsappConversations.ticketKey }).from(whatsappConversations).where(eq(whatsappConversations.contactPhone, contactPhone)).get(),
      db.select().from(whatsappMessages).where(and(eq(whatsappMessages.wamid, wamid), eq(whatsappMessages.contactPhone, contactPhone))).get(),
    ]);
    if (!conversation || !message) return Response.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
    if (!splitTicketKeys(conversation.ticketKey).includes(ticketKey)) return Response.json({ error: 'Essa FSA não está vinculada a esta conversa.' }, { status: 400 });
    if (!message.mediaId || !EVIDENCE_TYPES.has(message.messageType)) return Response.json({ error: 'Só fotos, vídeos e arquivos podem virar evidência.' }, { status: 400 });
    if (splitTicketKeys(message.evidenceTicketKeys).includes(ticketKey)) return Response.json({ error: `Este arquivo já foi anexado na ${ticketKey}.` }, { status: 409 });

    const upstream = await bridgeFetch(`/media/${message.mediaId.replace(/[^A-Za-z0-9_-]/g, '')}`);
    if (!upstream.ok) return Response.json({ error: 'Arquivo não está mais disponível no WhatsApp.' }, { status: upstream.status === 404 ? 404 : 502 });
    if (Number(upstream.headers.get('Content-Length') ?? 0) > MAX_EVIDENCE_BYTES) return Response.json({ error: 'Arquivo grande demais para o Jira (máximo 25 MB).' }, { status: 400 });
    const mimeType = (upstream.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    const bytes = await upstream.arrayBuffer();
    const headerName = upstream.headers.get('X-File-Name');
    const file = new File([bytes], evidenceFileName(message.messageType === 'document' ? (headerName ? decodeURIComponent(headerName) : message.body) : null, mimeType, message.occurredAt), { type: mimeType });

    if (file.size > MAX_EVIDENCE_BYTES) return Response.json({ error: 'Arquivo grande demais para o Jira (máximo 25 MB).' }, { status: 400 });
    if (!isAllowedUploadMime(mimeType) || !await isSafeUpload(file, MAX_EVIDENCE_BYTES)) {
      logSecurityEvent({ request, user, action: 'attachment_upload_rejected', outcome: 'denied', details: { ticketKey, source: 'whatsapp', wamid, type: mimeType, size: file.size } });
      return Response.json({ error: 'Formato de arquivo não aceito como evidência.' }, { status: 400 });
    }
    const n1Kind = ticketEvidenceKind(kind, mimeType);
    if (kind === 'rat' && !n1Kind) return Response.json({ error: 'RAT precisa ser foto ou PDF.' }, { status: 400 });

    logSecurityEvent({ request, user, action: 'attachment_upload', outcome: 'allowed', details: { ticketKey, source: 'whatsapp', wamid, kind, count: 1, totalBytes: file.size } });
    await uploadJiraAttachments(ticketKey, [file], user.email);

    // Also record it where the N1 validation looks for photo/video/RAT, when
    // it fits that store's size cap; otherwise the Jira attachment stands.
    const now = new Date().toISOString();
    const dataUrl = n1Kind && bytes.byteLength <= MAX_N1_EVIDENCE_BYTES ? `data:${mimeType};base64,${toBase64(bytes)}` : null;
    const storedForN1 = Boolean(n1Kind && dataUrl && isSafeDataUrl(dataUrl, mimeType, MAX_N1_DATA_URL_LENGTH));
    const label = kind === 'rat' ? 'RAT' : 'Evidência';
    await db.batch([
      db.update(whatsappMessages).set({ evidenceTicketKeys: [...splitTicketKeys(message.evidenceTicketKeys), ticketKey].join(',') }).where(eq(whatsappMessages.id, message.id)),
      db.insert(operationalAudit).values({ ticketKey, action: `${label} anexada pelo WhatsApp`, actorEmail: user.email, details: JSON.stringify({ fileName: file.name, wamid, conversation: contactPhone, storedForN1 }), createdAt: now }),
      ...(storedForN1 && n1Kind && dataUrl ? [db.insert(ticketEvidence).values({ ticketKey, kind: n1Kind, name: file.name, mimeType, data: dataUrl, uploadedBy: user.email, createdAt: now })] : []),
    ]);
    return Response.json({ ok: true, ticketKey, kind, fileName: file.name, storedForN1 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao anexar evidência do WhatsApp no Jira', error);
    return Response.json({ error: 'Não foi possível anexar a evidência ao Jira.' }, { status: 500 });
  }
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function evidenceFileName(original: string | null | undefined, mimeType: string, occurredAt: string) {
  const extension = EXTENSIONS[mimeType];
  const clean = (original ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 120);
  if (clean && (!extension || clean.toLowerCase().endsWith(`.${extension}`) || /\.[a-z0-9]{2,5}$/i.test(clean))) return clean;
  const stamp = occurredAt.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return `whatsapp-${stamp}.${extension ?? 'bin'}`;
}
