import type { JiraTicket, Status, Ticket } from '../api/types';

/** As cinco etapas do fluxo, na ordem que a operação acompanha. */
export const STATUS_COLUMNS: Status[] = [
  'Pendente de agendamento',
  'Agendado',
  'Técnico em campo',
  'Aguardando spare',
  'Direcionado',
];

export const STATUS_COLOR: Record<Status, string> = {
  'Pendente de agendamento': '#A78BFA',
  Agendado: '#6FA8FF',
  'Técnico em campo': '#5FDBB8',
  'Aguardando spare': '#F5C451',
  Direcionado: '#F07A3F',
};

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Mesma classificação que a web faz em `toTicket` (app/page.tsx): o Jira
 * devolve dezenas de status e a operação enxerga cinco.
 */
export function toTicket(issue: JiraTicket): Ticket {
  const statusText = normalizeText(issue.status);
  const status: Status =
    statusText === 'agendado'
      ? 'Agendado'
      : statusText.includes('agendamento')
        ? 'Pendente de agendamento'
        : statusText.includes('spare')
          ? 'Aguardando spare'
          : statusText === 'direcionado'
            ? 'Direcionado'
            : 'Técnico em campo';

  const priorityText = issue.priority.toLowerCase();
  const priority: Ticket['priority'] =
    priorityText.includes('highest') || priorityText.includes('high') || priorityText.includes('alta')
      ? 'Alta'
      : priorityText.includes('low') || priorityText.includes('baixa')
        ? 'Baixa'
        : 'Media';

  const storeFromTitle = issue.summary.match(/^Loja\s+([^|]+)/i)?.[0]?.trim();

  return {
    id: issue.key,
    title: issue.summary,
    store: issue.store ?? storeFromTitle ?? 'Loja não informada',
    city: issue.city ?? 'Cidade não informada',
    status,
    rawStatus: issue.status,
    priority,
    technician: issue.assignee ?? undefined,
    scheduledAt: issue.scheduledAt ?? undefined,
    updatedAt: issue.updatedAt,
  };
}

export function relativeAge(value?: string) {
  if (!value) return 'sem data';
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return 'sem data';
  const minutes = Math.max(0, Math.floor((Date.now() - date) / 60_000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function formatReais(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
