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
