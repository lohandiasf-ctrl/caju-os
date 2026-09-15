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

// Pure parsing for app/api/whatsapp/bridge-webhook, kept apart from the D1
// writes so it can be unit tested.

export type BridgeMessage = {
  wamid: string; contactPhone: string; contactName: string | null; conversationName: string | null;
  ticketKeys: string | null; senderJid: string | null; direction: 'incoming' | 'outgoing';
  messageType: string; body: string | null; mediaId: string | null; occurredAt: string;
};

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
  };
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
