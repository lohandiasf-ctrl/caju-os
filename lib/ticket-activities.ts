export type ActivityTicket = {
  id: string;
  store: string;
  rawStatus: string;
  technician?: string;
  updatedAt?: string;
  scheduledAt?: string;
  partnerTriggeredAtRaw?: string;
};

export type DatedTicketActivity<T extends ActivityTicket> = {
  ticket: T;
  date: Date;
  label: string;
  detail: string;
  tone: 'blue' | 'amber' | 'slate';
};

export function ticketActivities<T extends ActivityTicket>(ticket: T): DatedTicketActivity<T>[] {
  const activities: DatedTicketActivity<T>[] = [];
  const updatedAt = parseTicketDate(ticket.updatedAt);
  const scheduledAt = parseTicketDate(ticket.scheduledAt);
  const triggeredAt = parseTicketDate(ticket.partnerTriggeredAtRaw);
  if (updatedAt) activities.push({ ticket, date: updatedAt, label: 'Chamado atualizado', detail: ticket.rawStatus, tone: 'slate' });
  if (scheduledAt) activities.push({ ticket, date: scheduledAt, label: 'Atendimento agendado', detail: ticket.technician || 'Técnico ainda não atribuído', tone: 'blue' });
  if (triggeredAt) activities.push({ ticket, date: triggeredAt, label: 'Parceiro acionado', detail: ticket.technician || ticket.rawStatus, tone: 'amber' });
  return activities;
}

export function parseTicketDate(value?: string | null) {
  if (!value) return null;
  const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  const date = brazilian ? new Date(Number(brazilian[3]), Number(brazilian[2]) - 1, Number(brazilian[1]), Number(brazilian[4] ?? 0), Number(brazilian[5] ?? 0), Number(brazilian[6] ?? 0)) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dayKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
export function sameDay(first: Date, second: Date) { return dayKey(first) === dayKey(second); }
