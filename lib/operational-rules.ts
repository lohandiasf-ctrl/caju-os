export type ValidationInput = {
  status: string;
  ticketTotal: string | null | undefined;
  attachmentCount: number;
  identifiedProblem?: string | null;
  testsPerformed?: string | null;
  partToReplace?: string | null;
  serviceStartedAt?: string | null;
  serviceEndedAt?: string | null;
  pendingSync?: number;
};

export function normalizedStatus(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function validationRequirements(input: ValidationInput) {
  const missing: string[] = [];
  const status = normalizedStatus(input.status);
  if (!status.includes('tec-campo') && !status.includes('tecnico em campo') && !status.includes('em atendimento')) missing.push('chamado em Técnico em campo');
  if (!(Number(String(input.ticketTotal ?? '').replace(',', '.')) > 0)) missing.push('valores atualizados');
  if (input.attachmentCount < 1) missing.push('ao menos uma evidência');
  if (!input.identifiedProblem?.trim()) missing.push('problema identificado');
  if (!input.testsPerformed?.trim()) missing.push('testes feitos');
  if (!input.partToReplace?.trim()) missing.push('peça a ser trocada');
  if (!input.serviceStartedAt?.trim()) missing.push('data/hora de início');
  if (!input.serviceEndedAt?.trim()) missing.push('data/hora de término');
  if (input.serviceStartedAt?.trim() && input.serviceEndedAt?.trim()) {
    const startedAt = new Date(input.serviceStartedAt).getTime();
    const endedAt = new Date(input.serviceEndedAt).getTime();
    if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt <= startedAt) {
      missing.push('término posterior ao início');
    }
  }
  if ((input.pendingSync ?? 0) > 0) missing.push('sincronização pendente com o Jira');
  return missing;
}

export function retryDelaySeconds(attempts: number) {
  return Math.min(3600, 15 * (2 ** Math.max(0, attempts)));
}

export function isTransientJiraStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
