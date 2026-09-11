// Regras das ações em lote sobre chamados selecionados no Kanban/lista.
// Módulo puro: usado pela rota /api/jira/issues/batch, pela tela e pelos testes.

export type BulkStatus = 'scheduled' | 'in_service';
export type ClipboardFormat = 'keys' | 'message' | 'sheet';
export type BulkTicket = {
  id: string;
  title: string;
  store: string;
  city: string;
  rawStatus: string;
  schedule?: string;
  technician?: string;
};

export const MAX_BULK_TICKETS = 40;

const TRANSITION_ROLES = new Set(['gerencia', 'coordenador', 'n1', 'analista']);

// Etapa de origem exigida por cada ação: agendar só sai de "Pendente de
// agendamento"; "Técnico em campo" só sai de "Agendado" (WORKFLOW_RULES, regra 2).
const SOURCE_STAGE: Record<BulkStatus, 'scheduling' | 'scheduled'> = {
  scheduled: 'scheduling',
  in_service: 'scheduled',
};

export const BULK_STATUS_LABEL: Record<BulkStatus, string> = {
  scheduled: 'Agendado',
  in_service: 'Técnico em campo',
};

export function canBulkTransition(role: string | null | undefined) {
  return Boolean(role && TRANSITION_ROLES.has(role));
}

function stage(rawStatus: string) {
  const normalized = rawStatus.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized === 'agendado') return 'scheduled';
  if (normalized.includes('agendamento')) return 'scheduling';
  return null;
}

export function isBulkEligible(rawStatus: string, target: BulkStatus) {
  return stage(rawStatus) === SOURCE_STAGE[target];
}

export function bulkIneligibleReason(rawStatus: string, target: BulkStatus) {
  return target === 'scheduled'
    ? `Está em “${rawStatus}”. Só chamados em Pendente de agendamento podem ser agendados em lote.`
    : `Está em “${rawStatus}”. Só chamados Agendados podem ir para Técnico em campo.`;
}

export function ticketsToClipboard(tickets: BulkTicket[], format: ClipboardFormat) {
  if (format === 'keys') return tickets.map((ticket) => ticket.id).join('\n');
  if (format === 'sheet') {
    const header = ['FSA', 'Título', 'Loja', 'Cidade', 'Status', 'Agendamento', 'Técnico'];
    const rows = tickets.map((ticket) => [ticket.id, ticket.title, ticket.store, ticket.city, ticket.rawStatus, ticket.schedule ?? '', ticket.technician ?? '']);
    return [header, ...rows].map((row) => row.map(sheetCell).join('\t')).join('\n');
  }
  return tickets.map((ticket) => [
    `${ticket.id} · ${ticket.rawStatus}`,
    ticket.title,
    [ticket.store, ticket.city].filter(Boolean).join(' · '),
    [ticket.schedule ? `Agendamento: ${ticket.schedule}` : '', ticket.technician ? `Técnico: ${ticket.technician}` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n')).join('\n\n');
}

function sheetCell(value: string) {
  return value.replace(/[\t\r\n]+/g, ' ').trim();
}
