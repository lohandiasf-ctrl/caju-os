// Agenda de contatos da caixa do WhatsApp: chave de telefone e leitura de vCard.

/**
 * DDD + os 8 últimos dígitos: casa "5581991738635", "558191738635" e
 * "+55 81 99173-8635" (com ou sem o nono dígito). Grupos, "@lid" e números
 * curtos não têm chave.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.includes('@') && !/@(c\.us|s\.whatsapp\.net)$/.test(value)) return null;
  const digits = value.split('@')[0].replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length < 10) return null;
  return national.slice(0, 2) + national.slice(-8);
}

export type VcfContact = { name: string; phone: string };

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) { bytes.push(parseInt(value.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(...new TextEncoder().encode(value[i]));
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

/** Lê um arquivo .vcf (2.1 ou 3.0, com texto em quoted-printable) e devolve um item por telefone. */
export function parseVcf(text: string): VcfContact[] {
  // Linhas quebradas: "=" no fim (quoted-printable) ou continuação começando com espaço.
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.endsWith('=') && /ENCODING=QUOTED-PRINTABLE/i.test(last)) lines[lines.length - 1] = last.slice(0, -1) + raw;
    else if (last !== undefined && /^[ \t]/.test(raw)) lines[lines.length - 1] = last + raw.slice(1);
    else lines.push(raw);
  }
  const contacts: VcfContact[] = [];
  let name = ''; let phones: string[] = []; let inside = false;
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VCARD') { inside = true; name = ''; phones = []; continue; }
    if (upper === 'END:VCARD') {
      if (inside && name) for (const phone of phones) if (phoneKey(phone)) contacts.push({ name, phone });
      inside = false; continue;
    }
    if (!inside) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon); const value = line.slice(colon + 1);
    const field = head.split(';')[0].toUpperCase();
    const decoded = /ENCODING=QUOTED-PRINTABLE/i.test(head) ? decodeQuotedPrintable(value) : value;
    if (field === 'FN') name = decoded.trim();
    else if (field === 'N' && !name) name = decoded.split(';').map((part) => part.trim()).filter(Boolean).join(' ');
    else if (field === 'TEL') phones.push(decoded.trim());
  }
  return contacts;
}
