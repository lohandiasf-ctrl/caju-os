// Prazo (SLA) por etapa do fluxo operacional (operational_workflows.status),
// em horas desde a última mudança. Usado pelo painel operacional
// (app/api/operational-dashboard) e pelos avisos push (lib/push-alerts.ts),
// para os dois dizerem a mesma coisa.

export const CLOSED_WORKFLOW_STATUSES = new Set(['archived', 'resolved', 'cancelled', 'validated']);

// Etapas que não entram no SLA: esperando peça (o prazo é da transportadora,
// não da operação) e agendado (o prazo é a data marcada, não o tempo parado).
export const SLA_EXEMPT_STATUSES = new Set(['awaiting_spare', 'scheduled']);

/** O fluxo conta no "No prazo (SLA)": ativo e numa etapa com prazo da operação. */
export const measuresSla = (status: string) => !CLOSED_WORKFLOW_STATUSES.has(status) && !SLA_EXEMPT_STATUSES.has(status);

export const SLA_HOURS: Record<string, number> = {
  triage: 2, scheduling: 4, operational_preparation: 4, in_service: 12, technical_pending: 24,
  awaiting_approval: 24, awaiting_spare: 24, awaiting_payment: 24,
};

export const slaHoursOf = (status: string) => SLA_HOURS[status] ?? 24;

export const WORKFLOW_STATUS_LABEL: Record<string, string> = {
  triage: 'Triagem', scheduling: 'Pendente de agendamento', scheduled: 'Agendado', operational_preparation: 'Direcionado',
  in_service: 'Técnico em campo', technical_pending: 'Pendência técnica', awaiting_approval: 'Aguardando aprovação',
  awaiting_spare: 'Aguardando spare', awaiting_payment: 'Aguardando pagamento',
};
