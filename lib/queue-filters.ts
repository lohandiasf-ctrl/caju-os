// Filtros de tela da fila de chamados, ajustados pelos sliders das Ações
// rápidas e levados pela URL (`/?view=tickets&parados=5&prioridade=alta`).
// Só filtram o que já está carregado na tela — nenhuma regra de negócio,
// nenhuma consulta nova ao Jira.

export type TicketPriority = 'Alta' | 'Media' | 'Baixa';
export type QueueFilters = { staleDays: number; minPriority: TicketPriority };

export const STALE_DAYS_MAX = 14;
export const NO_QUEUE_FILTERS: QueueFilters = { staleDays: 0, minPriority: 'Baixa' };
export const PRIORITY_STEPS: TicketPriority[] = ['Baixa', 'Media', 'Alta'];
export const PRIORITY_LABEL: Record<TicketPriority, string> = { Baixa: 'Qualquer', Media: 'Média ou alta', Alta: 'Só alta' };

const DAY_MS = 24 * 60 * 60 * 1000;
type ParseDate = (value?: string | null) => Date | null;

export function priorityRank(priority: TicketPriority) {
  return PRIORITY_STEPS.indexOf(priority);
}

export function hasQueueFilters(filters: QueueFilters) {
  return filters.staleDays > 0 || filters.minPriority !== 'Baixa';
}

export function parseQueueFilters(search: string): QueueFilters {
  const params = new URLSearchParams(search);
  const days = Number.parseInt(params.get('parados') ?? '', 10);
  const priority = (params.get('prioridade') ?? '').toLowerCase();
  return {
    staleDays: Number.isFinite(days) ? Math.min(STALE_DAYS_MAX, Math.max(0, days)) : 0,
    minPriority: priority === 'alta' ? 'Alta' : priority === 'media' ? 'Media' : 'Baixa',
  };
}

/** Escreve os filtros em `params` (removendo os que estão no neutro). */
export function writeQueueFilters(params: URLSearchParams, filters: QueueFilters) {
  if (filters.staleDays > 0) params.set('parados', String(filters.staleDays));
  else params.delete('parados');
  if (filters.minPriority !== 'Baixa') params.set('prioridade', filters.minPriority.toLowerCase());
  else params.delete('prioridade');
  return params;
}

export function queueFiltersHref(filters: QueueFilters) {
  const params = writeQueueFilters(new URLSearchParams({ view: 'tickets' }), filters);
  return `/?${params.toString()}`;
}

/**
 * "Parado há N dias" = última atualização no Jira há pelo menos N dias.
 * Chamado sem data de atualização não entra no filtro de parados (não dá para
 * afirmar que está parado).
 */
export function matchesQueueFilters(
  ticket: { updatedAt?: string; priority: TicketPriority },
  filters: QueueFilters,
  now: Date,
  parseDate: ParseDate,
) {
  if (priorityRank(ticket.priority) < priorityRank(filters.minPriority)) return false;
  if (filters.staleDays > 0) {
    const updated = parseDate(ticket.updatedAt);
    if (!updated) return false;
    if (now.getTime() - updated.getTime() < filters.staleDays * DAY_MS) return false;
  }
  return true;
}

export function staleLabel(days: number) {
  return days <= 0 ? 'Qualquer' : days === 1 ? '1 dia ou mais' : `${days} dias ou mais`;
}
