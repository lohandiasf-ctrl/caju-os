// Ponte Caju OS ↔ Rovo.
//
// O Rovo não aceita chamada direta: não existe endpoint público de chat. O
// caminho suportado é dar a volta pelo Jira Automation:
//
//   Caju OS  --POST-->  webhook de entrada (regra de Automation)
//                         -> ação "Use Rovo agent"
//                         -> {{agentResponse}}
//                         -> "Send web request" --> callback no Caju OS
//
// Ou seja: é ASSÍNCRONO. A pergunta sai, a tela espera, a resposta volta por
// outra porta. Este arquivo é a parte pura — o que sai, o que pode entrar de
// volta e quando desistir. Nada aqui faz rede nem banco.

export const MAX_QUESTION = 1000;
// Depois disso a pessoa já fechou a tela; a regra de Automation pode ter
// falhado calada (limite de execução do plano, agente removido, erro na regra).
export const TIMEOUT_MS = 2 * 60 * 1000;

export type RovoStatus = 'pending' | 'answered' | 'failed' | 'expired';

export function validQuestion(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= MAX_QUESTION;
}

// O que o Caju OS manda ao webhook do Jira. Os nomes viram smart values na
// regra: {{webhookData.question}}, {{webhookData.requestId}} etc.
export function outgoingPayload(input: {
  requestId: string; question: string; ticketKey: string | null; askedBy: string; callbackUrl: string;
}) {
  return {
    requestId: input.requestId,
    question: input.question.trim(),
    ticketKey: input.ticketKey,
    askedBy: input.askedBy,
    callbackUrl: input.callbackUrl,
  };
}

export class CallbackError extends Error {
  // Propriedade declarada no corpo: o test runner roda TypeScript em modo
  // strip-only, que não aceita parameter properties no construtor.
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type RovoCallback = { requestId: string; answer: string; action: unknown | null; failed: boolean };

// O que o Jira devolve. Tratado como entrada hostil: a regra de Automation é
// configurada fora daqui e {{agentResponse}} é texto gerado por modelo.
export function parseCallback(raw: unknown): RovoCallback {
  if (!raw || typeof raw !== 'object') throw new CallbackError('Corpo inválido.');
  const input = raw as Record<string, unknown>;
  const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new CallbackError('requestId inválido.');
  const failed = input.failed === true || input.failed === 'true';
  const answer = typeof input.answer === 'string' ? input.answer.trim() : '';
  if (!failed && !answer) throw new CallbackError('Resposta vazia.');
  return {
    requestId,
    // Corta resposta gigante: o que vem do agente é texto livre.
    answer: answer.slice(0, 8000),
    action: input.action && typeof input.action === 'object' ? input.action : null,
    failed,
  };
}

// Comparação do segredo em tempo constante. `===` em string vaza o tamanho do
// prefixo comum pelo tempo de execução, e este endpoint é público por
// necessidade — o Jira não manda token do Firebase.
export function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

// Uma pergunta só recebe resposta uma vez: o "Send web request" da Automation
// pode repetir numa retentativa da regra.
export function canAnswer(status: string, createdAt: string, now = Date.now()): { ok: boolean; reason?: string } {
  if (status !== 'pending') return { ok: false, reason: 'Esta pergunta já foi respondida.' };
  const age = now - Date.parse(createdAt);
  if (!Number.isFinite(age)) return { ok: false, reason: 'Pergunta inválida.' };
  if (age > TIMEOUT_MS) return { ok: false, reason: 'A pergunta expirou antes da resposta.' };
  return { ok: true };
}

export function isExpired(status: string, createdAt: string, now = Date.now()) {
  return status === 'pending' && now - Date.parse(createdAt) > TIMEOUT_MS;
}
