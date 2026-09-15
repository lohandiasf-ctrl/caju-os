// Name for the WhatsApp group of one or more tickets, following the
// operation's pattern:
//   "15/09- 16h - CMÇR/BA - AMERICANAS L1608 - (FSA-132495)"
// date and time of the schedule, the city as its first four consonants plus
// UF, client and store code(s), and the FSAs (prefix written once).
// The dialog lets people edit it before creating the group.

export type GroupNameTicket = { id: string; store?: string | null; city?: string | null; scheduledAt?: string | null };

export const WHATSAPP_GROUP_NAME_MAX = 100;
const TIME_ZONE = 'America/Sao_Paulo';
const UFS = new Set('AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' '));

// "Camaçari" -> "CMÇR". Ç counts as a consonant and is kept.
export function cityTetragram(city: string) {
  const letters = [...city.toLocaleUpperCase('pt-BR')].filter((char) => /\p{L}/u.test(char));
  const consonants = letters.filter((char) => {
    if (char === 'Ç') return true;
    const base = char.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return /^[B-DF-HJ-NP-TV-Z]$/.test(base);
  });
  return consonants.slice(0, 4).map((char) => (char === 'Ç' ? 'Ç' : char.normalize('NFD').replace(/\p{Diacritic}/gu, ''))).join('');
}

// Accepts "Camaçari - BA", "Camaçari/BA", "Camaçari (BA)", "BA - Camaçari",
// "Camaçari, BA" or just "Camaçari".
export function splitCityUf(value: string): { city: string; uf: string | null } {
  const text = value.trim();
  const trailing = /^(.*?)[\s]*[-/,(]\s*([A-Za-z]{2})\)?\s*$/.exec(text);
  if (trailing && UFS.has(trailing[2].toUpperCase())) return { city: trailing[1].trim(), uf: trailing[2].toUpperCase() };
  const leading = /^([A-Za-z]{2})\s*[-/,]\s*(.+)$/.exec(text);
  if (leading && UFS.has(leading[1].toUpperCase())) return { city: leading[2].trim(), uf: leading[1].toUpperCase() };
  return { city: text, uf: null };
}

// "Código da loja: L1608" / "Loja 1608" / "1608" -> "L1608".
export function storeCode(store: string | null | undefined) {
  const match = /([A-Z]?)\s*(\d{2,6})\b/i.exec((store ?? '').replace(/^.*?:\s*/, ''));
  if (!match) return null;
  return `${(match[1] || 'L').toUpperCase()}${match[2]}`;
}

// Participant for a new group: a WhatsApp JID kept as is, or a Brazilian
// phone typed with or without country code ("(73) 98818-1339" -> 5573988181339).
export function participantJid(value: string): string | null {
  const text = value.trim();
  if (/^[\w.:-]+@(s\.whatsapp\.net|lid)$/.test(text)) return text;
  let digits = text.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
}

function scheduleParts(iso: string | null | undefined) {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { date: `${parts.day}/${parts.month}`, time: parts.minute === '00' ? `${Number(parts.hour)}h` : `${Number(parts.hour)}h${parts.minute}` };
}

export function whatsappGroupName(tickets: GroupNameTicket[], client = 'AMERICANAS') {
  if (!tickets.length) return '';
  const scheduled = tickets.map((ticket) => ticket.scheduledAt).filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value)))).sort()[0];
  const when = scheduleParts(scheduled);
  const place = tickets.map((ticket) => ticket.city).find((city) => city && !/não informad|atualizado em/i.test(city));
  const cityUf = place ? splitCityUf(place) : null;
  const stores = [...new Set(tickets.map((ticket) => storeCode(ticket.store)).filter((code): code is string => Boolean(code)))];
  const keys = [...new Set(tickets.map((ticket) => ticket.id.toUpperCase()))].sort((a, b) => (Number(a.replace(/\D/g, '')) || 0) - (Number(b.replace(/\D/g, '')) || 0));
  const fsas = `(${keys.map((key, index) => (index === 0 ? key : key.replace(/^FSA-/, ''))).join(' | ')})`;

  const head = when ? `${when.date}- ${when.time}` : null;
  const location = cityUf ? [cityTetragram(cityUf.city), cityUf.uf].filter(Boolean).join('/') : null;
  const storePart = [client.toUpperCase(), stores.join(' / ')].filter(Boolean).join(' ');
  return [head, location, storePart, fsas].filter(Boolean).join(' - ');
}
