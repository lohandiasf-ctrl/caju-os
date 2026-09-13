const PUBLIC_TICKET_BASE = "https://cajutech.net/chamados";

export function normalizeTicketKey(value: string) {
  return value.trim().toUpperCase().replace(/^FSA-?/, "FSA-");
}

export function isTicketKey(value: string) {
  return /^FSA-\d+$/.test(normalizeTicketKey(value));
}

export function sharedTicketUrl(ticketKey: string) {
  return `${PUBLIC_TICKET_BASE}/${encodeURIComponent(normalizeTicketKey(ticketKey))}`;
}

