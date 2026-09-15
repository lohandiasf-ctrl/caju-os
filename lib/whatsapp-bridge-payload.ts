// WhatsApp groups are named after the FSAs they handle ("FSA-123 / FSA-124
// Loja Centro"). A conversation stores its linked tickets as a comma-separated
// list in whatsapp_conversations.ticket_key.

// Groups often write the prefix once and list the rest bare:
// "(FSA-132030 | 132034 |132035)". Bare numbers right after an FSA count too,
// but only with 3+ digits, so "FSA-132030 | 2 lojas" doesn't link "FSA-2".
const FSA_RUN_PATTERN = /\bFSA\s*[-_:#]?\s*(\d+(?:(?:\s*[|,;/+&]\s*|\s+e\s+|\s+)(?:FSA\s*[-_:#]?\s*)?\d{3,}\b)*)/gi;

export function ticketKeysFromGroupName(name: string | null | undefined): string[] {
  if (!name) return [];
  const keys = [...name.matchAll(FSA_RUN_PATTERN)]
    .flatMap((match) => match[1].match(/\d+/g) ?? [])
    .map((digits) => `FSA-${Number(digits)}`);
  return [...new Set(keys)];
}

export function splitTicketKeys(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map((key) => key.trim()).filter(Boolean);
}

// Kind a WhatsApp file gets in ticket_evidence (the N1 validation store).
// RAT accepts photo or PDF; plain evidence accepts photo or video.
export function ticketEvidenceKind(kind: 'evidence' | 'rat', mimeType: string): 'photo' | 'video' | 'rat' | null {
  if (kind === 'rat') return mimeType === 'application/pdf' || mimeType.startsWith('image/') ? 'rat' : null;
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

// Pure parsing for app/api/whatsapp/bridge-webhook, kept apart from the D1
// writes so it can be unit tested.

export type BridgeMessage = {
  wamid: string; contactPhone: string; contactName: string | null; conversationName: string | null;
  ticketKeys: string | null; senderJid: string | null; direction: 'incoming' | 'outgoing';
  messageType: string; body: string | null; mediaId: string | null; occurredAt: string;
  quotedWamid: string | null; quotedBody: string | null; quotedName: string | null;
};

export type BridgeMessageEvent =
  | { type: 'revoke'; contactPhone: string; wamid: string }
  | { type: 'edit'; contactPhone: string; wamid: string; body: string };

export type BridgeGroup = { jid: string; name: string | null; ticketKeys: string | null; createdAt: string | null };

export function isGroupJid(jid: string) { return jid.endsWith('@g.us'); }

export function parseBridgeMessage(payload: Record<string, unknown>, now: string): BridgeMessage | null {
  const wamid = text(payload.wamid);
  const contactPhone = text(payload.contactPhone);
  if (!wamid || !contactPhone) return null;
  const group = isGroupJid(contactPhone);
  const contactName = text(payload.contactName) || null;
  // In a group contactName is the participant who wrote; the conversation is
  // named after the group subject, never after whoever spoke last.
  const conversationName = text(payload.conversationName) || (group ? null : contactName);
  return {
    wamid, contactPhone, contactName, conversationName,
    // Groups carry their FSAs in the subject; a subject without FSAs leaves
    // the current link alone (null keeps it via COALESCE).
    ticketKeys: group ? ticketKeysFromGroupName(conversationName).join(',') || null : null,
    senderJid: text(payload.senderJid) || null,
    direction: payload.direction === 'outgoing' ? 'outgoing' : 'incoming',
    messageType: text(payload.messageType) || 'text',
    body: text(payload.body) || null,
    mediaId: text(payload.mediaId) || null,
    occurredAt: text(payload.occurredAt) || now,
    quotedWamid: text(payload.quotedWamid) || null,
    quotedBody: text(payload.quotedBody).slice(0, 500) || null,
    quotedName: text(payload.quotedName) || null,
  };
}

// Sender deleted or edited an earlier message.
export function parseBridgeMessageEvent(payload: Record<string, unknown>): BridgeMessageEvent | null {
  const contactPhone = text(payload.contactPhone);
  const wamid = text(payload.wamid);
  if (!contactPhone || !wamid) return null;
  if (payload.type === 'revoke') return { type: 'revoke', contactPhone, wamid };
  const body = text(payload.body);
  if (payload.type === 'edit' && body) return { type: 'edit', contactPhone, wamid, body };
  return null;
}

export function parseBridgeGroups(payload: Record<string, unknown>): BridgeGroup[] {
  if (payload.type !== 'groups' || !Array.isArray(payload.groups)) return [];
  return payload.groups.slice(0, 500).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const jid = text(record.jid);
    if (!jid || !isGroupJid(jid)) return [];
    const name = text(record.subject) || null;
    const createdAt = text(record.createdAt);
    return [{ jid, name, ticketKeys: ticketKeysFromGroupName(name).join(',') || null, createdAt: createdAt && !Number.isNaN(Date.parse(createdAt)) ? createdAt : null }];
  });
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
