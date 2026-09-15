// "Lohan · Gerência": shown above outgoing messages in the inbox and signed
// into the WhatsApp message itself, so both read the same. `roleLabel` is the
// display name from roleLabels (lib/permissions), or null.
export function whatsappSenderLabel(email: string, displayName: string | null | undefined, roleLabel: string | null | undefined) {
  const firstName = (displayName || email.split('@')[0]).trim().split(/\s+/)[0];
  return roleLabel ? `${firstName} · ${roleLabel}` : firstName;
}

export function signWhatsappText(label: string, text: string) {
  return text ? `*${label}*\n${text}` : `*${label}*`;
}
