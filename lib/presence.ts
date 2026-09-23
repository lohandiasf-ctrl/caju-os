// Disponibilidade da equipe (status dos colegas). Os valores são os mesmos
// aceitos por /api/colleagues e gravados em db/schema.ts — aqui só se decide
// como cada um é mostrado e agrupado. Sem imports: os testes rodam com
// strip-types.

export const presenceStatuses = [
  'Online',
  'Ocupado',
  'Ausente',
  'Não perturbe',
  'Almoçando',
  'Pausa de 15 minutos',
  'Offline',
] as const;

export type PresenceStatus = (typeof presenceStatuses)[number];

/** Grupo de leitura rápida: quem dá para chamar agora, quem está ocupado, quem saiu por pouco tempo, quem está fora. */
export type PresenceGroup = 'available' | 'busy' | 'away' | 'offline';

/** Tom semântico (token de cor) + forma do indicador, para nunca depender só da cor. */
export type PresenceMeta = {
  group: PresenceGroup;
  tone: 'success' | 'danger' | 'warning' | 'muted';
  glyph: 'check' | 'minus' | 'clock' | 'ring';
};

export const presenceMeta: Record<PresenceStatus, PresenceMeta> = {
  Online: { group: 'available', tone: 'success', glyph: 'check' },
  Ocupado: { group: 'busy', tone: 'danger', glyph: 'minus' },
  'Não perturbe': { group: 'busy', tone: 'danger', glyph: 'minus' },
  Ausente: { group: 'away', tone: 'warning', glyph: 'clock' },
  Almoçando: { group: 'away', tone: 'warning', glyph: 'clock' },
  'Pausa de 15 minutos': { group: 'away', tone: 'warning', glyph: 'clock' },
  Offline: { group: 'offline', tone: 'muted', glyph: 'ring' },
};

export const presenceGroupLabel: Record<PresenceGroup, string> = {
  available: 'Online',
  busy: 'Ocupados',
  away: 'Ausentes ou em pausa',
  offline: 'Offline',
};

const groupOrder: Record<PresenceGroup, number> = { available: 0, busy: 1, away: 2, offline: 3 };

export function presenceOf(status: string | null | undefined): PresenceMeta {
  return presenceMeta[(status ?? 'Offline') as PresenceStatus] ?? presenceMeta.Offline;
}

/** Contagem por grupo, na ordem de leitura (online primeiro). */
export function presenceSummary(people: Array<{ status: string }>) {
  const counts: Record<PresenceGroup, number> = { available: 0, busy: 0, away: 0, offline: 0 };
  for (const person of people) counts[presenceOf(person.status).group] += 1;
  return counts;
}

/** Online → ocupados → ausentes → offline; dentro do grupo, pelo nome. Não muda a lista original. */
export function sortByPresence<T extends { status: string; displayName?: string | null; email: string }>(people: T[]) {
  const name = (person: T) => (person.displayName || person.email).toLocaleLowerCase('pt-BR');
  return [...people].sort((a, b) =>
    groupOrder[presenceOf(a.status).group] - groupOrder[presenceOf(b.status).group]
    || name(a).localeCompare(name(b), 'pt-BR'));
}
