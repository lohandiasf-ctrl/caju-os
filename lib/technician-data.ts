// Technicians' phone numbers must not go to Jira anymore. Where Jira expects
// something (the TEL line of "Dados dos técnicos", the phone fields), a "."
// takes its place.
export const JIRA_PHONE_PLACEHOLDER = '.';

export function scrubTechnicianPhone(text: string) {
  return text.replace(/^(\s*(?:TEL|Telefone(?: do t[ée]cnico)?)\s*:).*$/gim, `$1 ${JIRA_PHONE_PLACEHOLDER}`);
}
