// WhatsApp groups are named after the FSAs they handle ("FSA-123 / FSA-124
// Loja Centro"). A conversation stores its linked tickets as a comma-separated
// list in whatsapp_conversations.ticket_key.

const FSA_PATTERN = /\bFSA\s*[-_:#]?\s*(\d+)\b/gi;

export function ticketKeysFromGroupName(name: string | null | undefined): string[] {
  if (!name) return [];
  const keys = [...name.matchAll(FSA_PATTERN)].map((match) => `FSA-${Number(match[1])}`);
  return [...new Set(keys)];
}

export function splitTicketKeys(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map((key) => key.trim()).filter(Boolean);
}
