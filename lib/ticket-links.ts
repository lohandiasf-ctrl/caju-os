const PUBLIC_TICKET_BASE = "https://operacoes.cajutech.net/";
const JIRA_BROWSE_BASE = "https://delfia.atlassian.net/browse/";

export function normalizeTicketKey(value: string) {
  return value.trim().toUpperCase().replace(/^FSA-?/, "FSA-");
}

export function isTicketKey(value: string) {
  return /^FSA-\d+$/.test(normalizeTicketKey(value));
}

export function sharedTicketUrl(ticketKey: string) {
  return `${PUBLIC_TICKET_BASE}?ticket=${encodeURIComponent(normalizeTicketKey(ticketKey))}`;
}

// Link do chamado no Jira: é o que a validação no grupo SUP espera receber.
export function jiraTicketUrl(ticketKey: string) {
  return `${JIRA_BROWSE_BASE}${encodeURIComponent(normalizeTicketKey(ticketKey))}`;
}
