// Agente de vigilância: o que ele considera atrasado.
//
// Parte pura, sem banco e sem IA. Quem decide que um chamado precisa de aviso
// são estas regras — determinísticas e testáveis. A IA entra depois, só para
// escrever o texto do aviso; assim um modelo ruim produz texto ruim, nunca um
// alarme inventado.
//
// O agente não escreve no Jira: ele manda aviso dentro do Caju OS.

export type AgentRule = 'stalled' | 'schedule_overdue' | 'in_service_no_evidence' | 'shipment_late';

export type AgentFinding = {
  ticketKey: string;
  rule: AgentRule;
  // Quanto passou do limite, em horas. Ordena a lista e decide o que é grave.
  overdueHours: number;
  severity: 'warning' | 'critical';
  detail: string;
};

export type AgentWorkflow = {
  ticketKey: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
};

export type AgentTicket = {
  key: string;
  status: string;
  updatedAt: string;
  scheduledAt: string | null;
  attachmentTypes?: string[];
};

export type AgentShipment = {
  ticketKey: string;
  trackingCode: string;
  status: string;
  expectedAt: string | null;
};

// SLA por etapa do workflow, em horas. Mesmos limites que a Inteligência
// operacional mostra na tela — um valor só, para o aviso e o alerta nunca
// discordarem.
export const SLA_HOURS: Record<string, number> = {
  triage: 2,
  scheduling: 4,
  operational_preparation: 4,
  in_service: 12,
  technical_pending: 24,
  awaiting_approval: 24,
  awaiting_spare: 24,
  awaiting_payment: 24,
};

export const CLOSED_WORKFLOW_STATUSES = new Set(['archived', 'resolved', 'cancelled', 'validated']);

// Chamado em campo sem nenhum anexo: a validação depois exige evidência
// (WORKFLOW_RULES, regra 3), então cobrar cedo evita o retrabalho no fim.
const EVIDENCE_GRACE_HOURS = 4;

const HOUR = 3_600_000;

function hoursSince(value: string | null | undefined, now: number): number | null {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? (now - time) / HOUR : null;
}

function inFieldStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /tec-?campo|tecnico em campo|em atendimento/.test(normalized);
}

function scheduledStatus(status: string): boolean {
  return status.trim().toLowerCase() === 'agendado';
}

function delivered(status: string): boolean {
  return /entregue|recebido/i.test(status);
}

function hours(value: number): string {
  return value >= 48 ? `${Math.floor(value / 24)} dias` : `${Math.floor(value)}h`;
}

export function agentFindings(input: {
  workflows: AgentWorkflow[];
  tickets: AgentTicket[];
  shipments: AgentShipment[];
  now?: Date;
}): AgentFinding[] {
  const now = (input.now ?? new Date()).getTime();
  const findings: AgentFinding[] = [];

  // Parado na etapa além do SLA.
  for (const workflow of input.workflows) {
    if (CLOSED_WORKFLOW_STATUSES.has(workflow.status)) continue;
    const since = hoursSince(workflow.updatedAt || workflow.createdAt, now);
    const limit = SLA_HOURS[workflow.status] ?? 24;
    if (since === null || since <= limit) continue;
    const overdueHours = since - limit;
    findings.push({
      ticketKey: workflow.ticketKey,
      rule: 'stalled',
      overdueHours,
      // Dobro do SLA é o ponto em que parar de esperar: já não é atraso, é
      // chamado esquecido.
      severity: since >= limit * 2 ? 'critical' : 'warning',
      detail: `parado em ${workflow.status} há ${hours(since)} (limite ${limit}h)`,
    });
  }

  for (const ticket of input.tickets) {
    // Passou da hora marcada e continua Agendado: ninguém abriu o atendimento.
    if (scheduledStatus(ticket.status)) {
      const late = hoursSince(ticket.scheduledAt, now);
      if (late !== null && late > 0) {
        findings.push({
          ticketKey: ticket.key,
          rule: 'schedule_overdue',
          overdueHours: late,
          severity: late >= 4 ? 'critical' : 'warning',
          detail: `agendado para ${ticket.scheduledAt} e ainda não foi para Técnico em campo (${hours(late)} depois)`,
        });
      }
    }

    // Em campo sem nenhum anexo no Jira. `attachmentTypes` ausente significa
    // que ninguém perguntou pelos anexos — não vale como "sem evidência".
    if (inFieldStatus(ticket.status) && ticket.attachmentTypes && !ticket.attachmentTypes.length) {
      const since = hoursSince(ticket.updatedAt, now);
      if (since !== null && since > EVIDENCE_GRACE_HOURS) {
        findings.push({
          ticketKey: ticket.key,
          rule: 'in_service_no_evidence',
          overdueHours: since - EVIDENCE_GRACE_HOURS,
          severity: since >= SLA_HOURS.in_service ? 'critical' : 'warning',
          detail: `em Técnico em campo há ${hours(since)} sem nenhum anexo — a validação vai travar`,
        });
      }
    }
  }

  for (const shipment of input.shipments) {
    if (delivered(shipment.status)) continue;
    const late = hoursSince(shipment.expectedAt, now);
    if (late === null || late <= 0) continue;
    findings.push({
      ticketKey: shipment.ticketKey,
      rule: 'shipment_late',
      overdueHours: late,
      severity: late >= 48 ? 'critical' : 'warning',
      detail: `spare ${shipment.trackingCode} passou ${hours(late)} da data prevista e está como "${shipment.status}"`,
    });
  }

  // Mais atrasado primeiro: se o teto da rodada cortar, corta o que é menos
  // urgente.
  return findings.sort((a, b) => b.overdueHours - a.overdueHours);
}
