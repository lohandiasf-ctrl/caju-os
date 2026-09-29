// Conversões puras entre o OpenWA e o formato da ponte antiga do Caju OS
// (caju-os-web/whatsapp-bridge). Sem rede nem disco, para poder testar.

/** Só dígitos e "@": "+55 (81) 9917-3863" → "5581991738635@c.us". */
export function jidFor(raw) {
  const to = String(raw ?? '').trim();
  if (!to) return null;
  if (to.endsWith('@s.whatsapp.net')) return `${to.slice(0, -'@s.whatsapp.net'.length)}@c.us`;
  if (to.includes('@')) return to;
  const digits = to.replace(/\D/g, '');
  return digits ? `${digits}@c.us` : null;
}

export const isGroup = (jid) => String(jid ?? '').endsWith('@g.us');

/** Como o Caju OS guarda o contato: dígitos para pessoas; grupos e "@lid" ficam inteiros. */
export function contactPhoneOf(jid) {
  const j = String(jid ?? '').trim();
  if (!j) return '';
  if (j.endsWith('@c.us')) return j.slice(0, -'@c.us'.length);
  if (j.endsWith('@s.whatsapp.net')) return j.slice(0, -'@s.whatsapp.net'.length);
  return j;
}

/** Status do OpenWA → o que a tela de WhatsApp do Caju OS entende. */
export function connectionStatus(openwaStatus) {
  switch (openwaStatus) {
    case 'ready': return 'open';
    case 'qr_ready': return 'qr';
    case 'initializing': case 'authenticating': return 'connecting';
    default: return 'logged_out';
  }
}

const TYPES = { text: 'text', chat: 'text', image: 'image', video: 'video', audio: 'audio', voice: 'audio', ptt: 'audio', document: 'document', sticker: 'sticker', location: 'location', contact: 'contact', vcard: 'contact' };
export function messageTypeOf(type) { return TYPES[String(type ?? '').toLowerCase()] ?? null; }

/** Nome do arquivo seguro para o disco. */
export const safeId = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '');

const epochToIso = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
};

/**
 * Mensagem do OpenWA (`message.received` / `message.sent`) → payload do
 * /api/whatsapp/bridge-webhook. Devolve null para o que o Caju OS ignora
 * (status/stories, tipos sem conteúdo, reações).
 */
export function bridgeMessage(event, data, { groupSubject } = {}) {
  if (!data || typeof data !== 'object') return null;
  const outgoing = event === 'message.sent' || data.fromMe === true;
  if (data.kind === 'status' || data.isStatusBroadcast || data.kind === 'broadcast' || data.kind === 'channel') return null;
  const type = messageTypeOf(data.type);
  if (!type) return null;
  const wamid = String(data.id?._serialized ?? data.id ?? '').trim();
  let chat = String(data.chatId ?? (outgoing ? data.to : data.from) ?? '').trim();
  if (!wamid || !chat) return null;
  // Quem o WhatsApp só endereça por "@lid": usa o telefone quando o OpenWA o resolve.
  const resolved = String(data.senderPhone ?? '').replace(/\D/g, '');
  if (chat.endsWith('@lid') && resolved.length >= 10) chat = `${resolved}@c.us`;
  const group = isGroup(chat);
  const pushName = data.contact?.pushName || data.contact?.name || data.notifyName || null;
  const sender = group ? (data.author || data.senderId || data.participant || null) : (outgoing ? null : chat);
  const quoted = data.quotedMessage;
  const body = typeof data.body === 'string' && data.body.trim() ? data.body.trim() : null;
  return {
    wamid,
    contactPhone: contactPhoneOf(chat),
    // Em grupo, contactName é quem escreveu; a conversa leva o nome do grupo.
    contactName: outgoing ? null : pushName,
    conversationName: group ? (groupSubject ?? null) : (outgoing ? null : pushName),
    senderJid: sender,
    direction: outgoing ? 'outgoing' : 'incoming',
    messageType: type,
    body: type === 'location' && data.location ? `https://maps.google.com/?q=${data.location.latitude},${data.location.longitude}` : body,
    mediaId: null, // preenchido depois de guardar a mídia
    occurredAt: epochToIso(data.timestamp) ?? new Date().toISOString(),
    quotedWamid: quoted?.id ? String(quoted.id) : null,
    quotedBody: typeof quoted?.body === 'string' ? quoted.body.slice(0, 500) : null,
    quotedName: null,
  };
}

/** `message.revoked` / `message.edited` → evento de apagar ou editar. */
export function bridgeMessageEvent(event, data) {
  if (!data) return null;
  if (event === 'message.revoked') {
    const wamid = String(data.revokedId ?? data.id ?? '').trim();
    const chat = String(data.chatId ?? data.from ?? data.to ?? '').trim();
    return wamid && chat ? { type: 'revoke', contactPhone: contactPhoneOf(chat), wamid } : null;
  }
  if (event === 'message.edited') {
    const wamid = String(data.messageId ?? '').trim();
    const chat = String(data.chatId ?? '').trim();
    const body = typeof data.body === 'string' ? data.body.trim() : '';
    return wamid && chat && body ? { type: 'edit', contactPhone: contactPhoneOf(chat), wamid, body } : null;
  }
  return null;
}

/** Lista de grupos do OpenWA → {type:'groups'} do Caju OS (nome do grupo carrega os FSAs). */
export function bridgeGroups(list) {
  const items = Array.isArray(list) ? list : (list?.data ?? list?.items ?? list?.groups ?? []);
  return {
    type: 'groups',
    groups: items.flatMap((g) => {
      const jid = String(g?.id?._serialized ?? g?.id ?? g?.jid ?? '').trim();
      if (!isGroup(jid)) return [];
      return [{ jid, subject: g.name ?? g.subject ?? null, createdAt: epochToIso(g.creation ?? g.createdAt) }];
    }),
  };
}

/** Lista genérica do OpenWA (array solto ou envelope) → array. */
export function itemsOf(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? payload?.items ?? payload?.contacts ?? payload?.groups ?? [];
}

/** Payload de mídia recebida → { mimetype, fileName, base64 | omitted }. */
export function mediaOf(data) {
  const m = data?.media;
  if (!m) return null;
  return { mimetype: m.mimetype || 'application/octet-stream', fileName: m.filename ?? null, base64: m.data ?? null, omitted: Boolean(m.omitted) };
}

/** Qual endpoint de envio de mídia usar, pelo tipo do arquivo (mesma regra da ponte antiga). */
export function sendKind(mimetype, voice) {
  if (voice) return 'audio';
  if (mimetype.startsWith('image/') && mimetype !== 'image/svg+xml') return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}
