// Números do bento da Visão geral. Tudo derivado do que a tela já carrega
// (chamados do Jira + /api/operational-dashboard) — nenhum endpoint novo.
// Funções puras para os testes; a página só chama e desenha.

// Sem import de valor de outro módulo: os testes rodam com strip-types, que não
// resolve caminho sem extensão. O parser de data do Jira entra por parâmetro.
type ParseDate = (value?: string | null) => Date | null;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export type DashboardTicket = {
  id: string;
  status: string;
  technician?: string;
  updatedAt?: string;
  scheduledAt?: string;
  partnerTriggeredAtRaw?: string;
};

export type StatusCounts = {
  open: number;
  inField: number;
  scheduled: number;
  pendingSchedule: number;
  awaitingSpare: number;
  withTechnician: number;
};

export function statusCounts(tickets: DashboardTicket[]): StatusCounts {
  const count = (status: string) => tickets.filter((ticket) => ticket.status === status).length;
  return {
    open: tickets.length,
    inField: count('Técnico em campo'),
    scheduled: count('Agendado'),
    pendingSchedule: count('Pendente de agendamento'),
    awaitingSpare: count('Aguardando spare'),
    withTechnician: tickets.filter((ticket) => ticket.technician?.trim()).length,
  };
}

/** % dos fluxos ativos sem SLA atrasado. `null` sem fluxo ativo (nada a medir). */
export function slaOnTimePercent(metrics: { active: number; overdue: number } | null | undefined) {
  if (!metrics || metrics.active <= 0) return null;
  const onTime = Math.max(0, metrics.active - Math.max(0, metrics.overdue));
  return Math.round((onTime / metrics.active) * 100);
}

export function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

export type DayActivity = {
  key: string;
  date: Date;
  label: string;
  /** chamados com atendimento agendado para o dia */
  scheduled: number;
  /** chamados com parceiro acionado no dia */
  triggered: number;
  /** chamados distintos com qualquer movimento no dia (atualização, agenda, acionamento) */
  moved: number;
};

const shortDay = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

export function formatShortDay(date: Date) {
  return shortDay.format(date).replace('.', '').replace(' de ', ' ');
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Uma entrada por dia, de `start` por `days` dias. Conta chamados distintos por
 * dia em cada categoria. É um retrato da fila atual (o Jira devolve os chamados
 * ativos), não um histórico completo da operação.
 */
export function dailyActivity(tickets: DashboardTicket[], start: Date, days: number, parseDate: ParseDate): DayActivity[] {
  const first = startOfDay(start);
  const buckets = new Map<string, { scheduled: Set<string>; triggered: Set<string>; moved: Set<string> }>();
  const entries: DayActivity[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(first);
    date.setDate(first.getDate() + offset);
    const key = dayKey(date);
    buckets.set(key, { scheduled: new Set(), triggered: new Set(), moved: new Set() });
    entries.push({ key, date, label: formatShortDay(date), scheduled: 0, triggered: 0, moved: 0 });
  }
  for (const ticket of tickets) {
    const scheduled = parseDate(ticket.scheduledAt);
    const triggered = parseDate(ticket.partnerTriggeredAtRaw);
    const updated = parseDate(ticket.updatedAt);
    if (scheduled) buckets.get(dayKey(scheduled))?.scheduled.add(ticket.id);
    if (triggered) buckets.get(dayKey(triggered))?.triggered.add(ticket.id);
    for (const date of [scheduled, triggered, updated]) if (date) buckets.get(dayKey(date))?.moved.add(ticket.id);
  }
  return entries.map((entry) => {
    const bucket = buckets.get(entry.key)!;
    return { ...entry, scheduled: bucket.scheduled.size, triggered: bucket.triggered.size, moved: bucket.moved.size };
  });
}

export function daysAgo(now: Date, days: number) {
  const date = startOfDay(now);
  date.setDate(date.getDate() - days);
  return date;
}

// ── Variação "vs. ontem" ─────────────────────────────────────────────────
// Não existe série histórica no servidor. O navegador guarda um retrato por
// dia (localStorage) e compara com o último dia anterior visto. Sem retrato
// anterior, não há badge — melhor nada do que um número inventado.

export type KpiValues = Record<string, number>;
export type KpiSnapshotStore = { previous?: { day: string; values: KpiValues }; current?: { day: string; values: KpiValues } };

export function rollSnapshot(store: KpiSnapshotStore | null | undefined, today: string, values: KpiValues): KpiSnapshotStore {
  const safe = store ?? {};
  if (!safe.current || safe.current.day === today) return { previous: safe.previous, current: { day: today, values } };
  return { previous: safe.current, current: { day: today, values } };
}

/** Variação percentual arredondada; `null` quando não há base para comparar. */
export function deltaPercent(current: number, previous: number | undefined) {
  if (previous === undefined || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function parseSnapshotStore(raw: string | null): KpiSnapshotStore | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as KpiSnapshotStore;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
