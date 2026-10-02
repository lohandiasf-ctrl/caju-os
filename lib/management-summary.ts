// Números da Visão geral para a gestão: o que atender hoje e nos próximos dias,
// pendências por cidade e cidades sem técnico. Puro (a lista de chamados e as
// cidades com técnico vêm de fora) para os testes.

export type SummaryTicket = { id: string; status: string; city: string; scheduledAt?: string; technician?: string };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** "Itabuna - BA", "Itabuna/BA" ou "Itabuna" → cidade e UF. */
export function cityAndUf(value: string): { city: string; uf: string | null } {
  const m = value.trim().match(/^(.*?)\s*[-/,]\s*([A-Za-z]{2})$/);
  return m ? { city: m[1].trim(), uf: m[2].toUpperCase() } : { city: value.trim(), uf: null };
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export type Summary = {
  today: number; nextDays: number; pending: number; unassigned: number;
  uncoveredCities: Array<{ city: string; uf: string | null; tickets: number }>;
  ufs: string[];
};

export function summarize(tickets: readonly SummaryTicket[], techCities: ReadonlySet<string>, now: Date, uf: string | null): Summary {
  const today = dayStart(now);
  const limit = today + 8 * 86_400_000; // hoje + 7 dias à frente
  const inScope = tickets.filter((t) => !uf || cityAndUf(t.city).uf === uf);
  const out: Summary = { today: 0, nextDays: 0, pending: 0, unassigned: 0, uncoveredCities: [], ufs: [] };
  const uncovered = new Map<string, { city: string; uf: string | null; tickets: number }>();
  for (const t of inScope) {
    const at = t.scheduledAt ? new Date(t.scheduledAt).getTime() : NaN;
    if (Number.isFinite(at)) {
      const d = dayStart(new Date(at));
      if (d === today) out.today += 1;
      else if (d > today && d < limit) out.nextDays += 1;
    }
    if (t.status === 'Pendente de agendamento') {
      out.pending += 1;
      const { city, uf: u } = cityAndUf(t.city);
      // Chamado pendente numa cidade sem nenhum técnico cadastrado = cidade que não conseguimos atender.
      if (city && !techCities.has(fold(city))) {
        const key = `${fold(city)}|${u ?? ''}`;
        const cur = uncovered.get(key) ?? { city, uf: u, tickets: 0 };
        cur.tickets += 1;
        uncovered.set(key, cur);
      }
    }
    if (!t.technician?.trim()) out.unassigned += 1;
  }
  out.uncoveredCities = [...uncovered.values()].sort((a, b) => b.tickets - a.tickets || a.city.localeCompare(b.city, 'pt-BR'));
  out.ufs = [...new Set(tickets.map((t) => cityAndUf(t.city).uf).filter((u): u is string => Boolean(u)))].sort();
  return out;
}

export const foldCity = fold;
