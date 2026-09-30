// Grupo do WhatsApp de um chamado: o que tem o número do FSA no nome e, havendo
// mais de um (visita repetida, reagendamento), o de data mais recente no título.
// Títulos reais: "30/09 às 13:00 - IPTG/MG - AMERICANAS L1069 (FSA-133568 | 133570)".

export type GroupRow = { contactPhone: string; contactName: string | null; lastMessageAt: string };

/** Número do chamado ("FSA-133493" → "133493"). */
export function ticketNumber(key: string): string | null {
  return key.trim().toUpperCase().match(/^[A-Z][A-Z0-9]*-(\d{3,})$/)?.[1] ?? null;
}

/** O nome cita o número inteiro, com ou sem "FSA-" (e não como pedaço de outro número). */
export function namesTicket(name: string | null | undefined, number: string): boolean {
  return new RegExp(`(?<!\\d)${number}(?!\\d)`).test(name ?? '');
}

/** "30/09 às 13:00" → instante (ano mais próximo de `now`); sem data no título → null. */
export function titleDate(name: string | null | undefined, now = new Date()): number | null {
  const m = (name ?? '').match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)(?:\D{0,6}?(\d{1,2})\s*(?:h|:)\s*(\d{2})?)?/i);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const h = Number(m[4] ?? 0);
  const min = Number(m[5] ?? 0);
  if (m[3]) return new Date(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), month - 1, day, h, min).getTime();
  // Sem ano: o ano que deixa a data mais perto de hoje (vale na virada de ano).
  const candidates = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => new Date(y, month - 1, day, h, min).getTime());
  return candidates.reduce((best, t) => (Math.abs(t - now.getTime()) < Math.abs(best - now.getTime()) ? t : best));
}

/** Grupos que citam o chamado, o mais recente primeiro (título com data antes dos sem data; empate pela última mensagem). */
export function ticketGroups(groups: readonly GroupRow[], key: string, now = new Date()): GroupRow[] {
  const number = ticketNumber(key);
  if (!number) return [];
  return groups
    .filter((g) => g.contactPhone.endsWith('@g.us') && namesTicket(g.contactName, number))
    .map((g) => ({ g, at: titleDate(g.contactName, now) }))
    .sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || b.g.lastMessageAt.localeCompare(a.g.lastMessageAt))
    .map((x) => x.g);
}
