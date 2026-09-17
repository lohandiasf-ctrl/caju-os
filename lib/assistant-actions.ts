// Escrita assistida no Jira: propor → confirmar → auditar.
//
// O assistente nunca escreve direto. Ele PROPÕE uma ação de uma lista fechada;
// a pessoa vê exatamente o que vai mudar e confirma; só então o servidor
// executa. Tudo fica registrado para a coordenação e a gerência auditarem.
//
// Este arquivo é a parte pura: o que pode ser proposto, como se lê a proposta
// do modelo e como ela é descrita para quem vai confirmar. Nada aqui chama o
// Jira nem o banco.

export const ACTION_KINDS = ['comment', 'transition', 'schedule'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

// Etapas que a escrita assistida pode pedir. É de propósito menor que a lista
// completa do fluxo: cancelar, validar e resolver continuam só na mão, porque
// fecham o chamado e mexem em financeiro.
export const ALLOWED_TRANSITIONS = ['scheduling', 'scheduled', 'operational_preparation', 'in_service', 'technical_pending', 'awaiting_spare'] as const;

export const TRANSITION_LABELS: Record<string, string> = {
  scheduling: 'Pendente de agendamento',
  scheduled: 'Agendado',
  operational_preparation: 'Direcionado',
  in_service: 'Técnico em campo',
  technical_pending: 'Pendência técnica',
  awaiting_spare: 'Aguardando spare',
};

export type AssistantAction =
  | { kind: 'comment'; ticketKey: string; body: string }
  | { kind: 'transition'; ticketKey: string; status: string }
  | { kind: 'schedule'; ticketKey: string; scheduledDateTime: string };

export const MAX_COMMENT_LENGTH = 2000;

export class ActionError extends Error {}

// O modelo responde texto; a ação vem num bloco JSON. Ler é deliberadamente
// rígido: qualquer campo fora do previsto derruba a proposta em vez de virar
// uma escrita torta no Jira.
export function parseAction(raw: unknown, ticketKey: string): AssistantAction {
  if (!raw || typeof raw !== 'object') throw new ActionError('O assistente não propôs uma ação válida.');
  const input = raw as Record<string, unknown>;
  const kind = input.kind;
  if (typeof kind !== 'string' || !(ACTION_KINDS as readonly string[]).includes(kind)) {
    throw new ActionError('Ação desconhecida. O assistente só pode comentar, mudar a etapa ou agendar.');
  }
  if (kind === 'comment') {
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    if (body.length < 3) throw new ActionError('O comentário proposto está vazio.');
    if (body.length > MAX_COMMENT_LENGTH) throw new ActionError(`O comentário passa de ${MAX_COMMENT_LENGTH} caracteres.`);
    return { kind, ticketKey, body };
  }
  if (kind === 'transition') {
    const status = typeof input.status === 'string' ? input.status.trim() : '';
    if (!(ALLOWED_TRANSITIONS as readonly string[]).includes(status)) {
      throw new ActionError('Essa etapa não pode ser aplicada pelo assistente. Use o fluxo do chamado.');
    }
    return { kind, ticketKey, status };
  }
  const scheduledDateTime = typeof input.scheduledDateTime === 'string' ? input.scheduledDateTime.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledDateTime)) {
    throw new ActionError('A data e hora propostas não estão no formato AAAA-MM-DDTHH:MM.');
  }
  return { kind: 'schedule', ticketKey, scheduledDateTime };
}

// O texto que a pessoa lê antes de confirmar. Precisa dizer exatamente o que
// vai acontecer — confirmar no escuro não é confirmação.
export function describeAction(action: AssistantAction): string {
  if (action.kind === 'comment') return `Adicionar um comentário interno em ${action.ticketKey}.`;
  if (action.kind === 'transition') return `Mover ${action.ticketKey} para “${TRANSITION_LABELS[action.status] ?? action.status}” no Jira.`;
  return `Definir a data e hora do agendamento de ${action.ticketKey} para ${formatDateTime(action.scheduledDateTime)}.`;
}

export function formatDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]} às ${match[4]}:${match[5]}` : value;
}

// Extrai o bloco JSON da resposta do modelo, que costuma vir cercado de texto
// ou de cerca de markdown. Sem bloco, não há ação — e isso não é erro: é o
// assistente respondendo sem propor escrita.
export function extractActionBlock(answer: string): unknown | null {
  const fenced = answer.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const candidate = fenced?.[1] ?? answer.match(/\{[\s\S]*"kind"[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { return null; }
}

// O texto que sobra depois de tirar o bloco JSON: é o que a pessoa lê.
export function stripActionBlock(answer: string): string {
  return answer
    .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, '')
    .replace(/\{[\s\S]*"kind"[\s\S]*\}/g, '')
    .trim();
}

export type ActionStatus = 'pending' | 'applied' | 'failed' | 'cancelled';

// Uma proposta só pode ser confirmada uma vez, e só enquanto está pendente.
// Sem isso, um clique repetido comenta duas vezes no Jira.
export function canConfirm(status: string, createdAt: string, now = Date.now()): { ok: boolean; reason?: string } {
  if (status === 'applied') return { ok: false, reason: 'Esta ação já foi aplicada.' };
  if (status === 'cancelled') return { ok: false, reason: 'Esta ação foi cancelada.' };
  if (status === 'failed') return { ok: false, reason: 'Esta ação falhou. Peça uma nova sugestão.' };
  if (status !== 'pending') return { ok: false, reason: 'Esta ação não está mais pendente.' };
  const age = now - Date.parse(createdAt);
  if (!Number.isFinite(age)) return { ok: false, reason: 'Proposta inválida.' };
  // Passou muito tempo: o chamado pode ter mudado desde a sugestão.
  if (age > EXPIRY_MS) return { ok: false, reason: 'A sugestão expirou. Peça uma nova.' };
  return { ok: true };
}

export const EXPIRY_MS = 30 * 60 * 1000;

// Quem audita. Escrever é de quem opera; auditar é da coordenação e da gerência.
export const AUDIT_ROLES = ['gerencia', 'coordenador'] as const;

export function canAudit(role: string | null | undefined) {
  return Boolean(role && (AUDIT_ROLES as readonly string[]).includes(role));
}
