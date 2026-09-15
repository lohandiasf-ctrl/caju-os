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
  scheduledAt?: string;
  technician?: string;
  allegedDefect?: string | null;
};

export const MAX_BULK_TICKETS = 40;

const sharedTicketUrl = (key: string) => `https://app.cajutech.net/?ticket=${encodeURIComponent(key)}`;

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
  return tickets.map(formatMessageSummary).join('\n\n');
}

export function ticketsToClipboardHtml(tickets: BulkTicket[], format: ClipboardFormat) {
  if (format !== 'message') return undefined;
  return tickets.map(formatMessageSummaryHtml).join('<br><br>');
}

function sheetCell(value: string) {
  return value.replace(/[\t\r\n]+/g, ' ').trim();
}

function formatMessageSummary(ticket: BulkTicket) {
  const { subject, problem } = messageParts(ticket);
  return [
    `${ticket.id} · ${ticket.rawStatus}`,
    '',
    sharedTicketUrl(ticket.id),
    '',
    [storeCode(ticket), ticket.city].filter(Boolean).join(' - '),
    '',
    subject || ticket.title,
    '',
    `Resumo do problema "${problem || ticket.title}"`,
  ].join('\n');
}

function messageParts(ticket: BulkTicket) {
  const parsed = splitTicketTitle(ticket.title);
  return { subject: parsed.subject || ticket.title, problem: ticket.allegedDefect?.trim() || parsed.problem || 'Não informado' };
}

function splitTicketTitle(title: string) {
  const parts = title.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return { subject: parts[1], problem: parts.slice(2).join(' | ') };
  const source = parts.length === 2 ? parts[1] : title;
  return splitSubjectAndAllegedDefect(source);
}

function splitSubjectAndAllegedDefect(value: string) {
  const clean = value.trim();
  const pieces = clean.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (pieces.length >= 3) return { subject: pieces.slice(0, -2).join(' - '), problem: pieces.slice(-2).join(' - ') };
  if (pieces.length === 2) return { subject: pieces[0], problem: pieces[1] };
  return { subject: clean, problem: 'Não informado' };
}

function storeCode(ticket: BulkTicket) {
  const fromStore = ticket.store.match(/[A-Z]?\d+/i)?.[0];
  const fromTitle = ticket.title.match(/(?:loja|codigo da loja|código da loja)\s+([A-Z]?\d+)/i)?.[1];
  return fromStore || fromTitle || ticket.store;
}

function formatMessageSummaryHtml(ticket: BulkTicket) {
  const { subject, problem } = messageParts(ticket);
  const url = sharedTicketUrl(ticket.id);
  return [
    `<b>${escapeHtml(ticket.id)} · ${escapeHtml(ticket.rawStatus)}</b>`,
    '',
    `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`,
    '',
    escapeHtml([storeCode(ticket), ticket.city].filter(Boolean).join(' - ')),
    '',
    escapeHtml(subject || ticket.title),
    '',
    `<b>Resumo do problema</b> &quot;${escapeHtml(problem || ticket.title)}&quot;`,
  ].join('<br>');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
