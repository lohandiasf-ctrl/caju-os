// "Lohan": shown above outgoing messages in the inbox and signed into the
// WhatsApp message itself, so both read the same. Só o primeiro nome — o cargo
// fica de fora de propósito, inclusive do que o contato recebe.
export function whatsappSenderLabel(email: string, displayName: string | null | undefined) {
  return (displayName || email.split('@')[0]).trim().split(/\s+/)[0];
}

export function signWhatsappText(label: string, text: string) {
  return text ? `*${label}*\n${text}` : `*${label}*`;
}
