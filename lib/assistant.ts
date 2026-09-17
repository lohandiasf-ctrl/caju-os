// Assistente de chamados: resumo, próximo passo e perguntas sobre a fila.
//
// Roda no Workers AI (binding `AI`, o mesmo já usado na leitura da RAT), então
// não há credencial nova nem provedor novo. Este arquivo é a parte pura: monta
// o contexto e o prompt, e lê a resposta. A chamada ao modelo fica na rota.
//
// Regra que atravessa tudo: o assistente é SOMENTE LEITURA. Ele descreve e
// sugere; nada aqui escreve no Jira.

export type AssistantTask = 'summary' | 'next_step' | 'queue';

export type AssistantTicket = {
  key: string;
  summary: string;
  status: string;
  priority: string;
  store: string | null;
  city: string | null;
  createdAt: string;
  scheduledAt: string | null;
  technicianName: string | null;
};

export type AssistantIssue = AssistantTicket & {
  description: string;
  allegedDefect: string | null;
  problemCategory: string | null;
  equipmentModel: string | null;
  defectSummary: string | null;
  technicianData: string | null;
  internalComments: Array<{ author: string | null; createdAt: string; body: string }>;
};

// Dados pessoais não precisam sair daqui para o assistente fazer o trabalho.
// O campo "Dados dos Técnicos" carrega CPF, RG e telefone; descrições e
// comentários também trazem telefone de contato. Tudo isso é mascarado antes
// de virar prompt — o modelo trabalha com o defeito, não com o documento.
export function redact(value: string): string {
  return value
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g, '[RG]')
    .replace(/(?<!\d)(?:\+55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, '[TELEFONE]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[EMAIL]');
}

function line(label: string, value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? `${label}: ${redact(clean)}\n` : '';
}

export function ticketContext(issue: AssistantIssue, maxComments = 6, today = new Date()): string {
  // Sem a data de hoje o modelo não sabe se o agendamento já passou.
  let text = `Hoje é ${onlyDate(today.toISOString())}.\nChamado ${issue.key}\n`;
  text += line('Título', issue.summary);
  text += line('Status', issue.status);
  text += line('Prioridade', issue.priority);
  text += line('Loja', issue.store);
  text += line('Cidade', issue.city);
  text += line('Aberto em', issue.createdAt);
  text += line('Agendado para', issue.scheduledAt);
  text += line('Técnico', issue.technicianName);
  text += line('Categoria do problema', issue.problemCategory);
  text += line('Equipamento', issue.equipmentModel);
  text += line('Defeito alegado', issue.allegedDefect);
  text += line('Resumo do defeito', issue.defectSummary);
  text += line('Descrição', issue.description);
  const comments = issue.internalComments.slice(-maxComments);
  if (comments.length) {
    text += '\nComentários internos (mais antigo primeiro):\n';
    for (const comment of comments) {
      text += `- [${comment.createdAt}] ${comment.author ?? 'sem autor'}: ${redact(comment.body.trim())}\n`;
    }
  }
  return text.trimEnd();
}

// Datas do Jira vêm com hora e fuso ("2026-09-16T10:23:00.000-0300"). Na fila
// só o dia interessa, e a linha fica legível.
export function onlyDate(value: string | null | undefined): string | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : (value?.trim() || null);
}

export function queueContext(tickets: AssistantTicket[], limit = 60, today = new Date()): string {
  const rows = tickets.slice(0, limit).map((ticket) => [
    ticket.key,
    ticket.status,
    ticket.priority,
    ticket.store ?? '-',
    ticket.city ?? '-',
    ticket.technicianName ?? 'sem técnico',
    // Sem a data de abertura o assistente não consegue responder "quantos
    // entraram hoje" — e respondia, corretamente, que não constava.
    onlyDate(ticket.createdAt) ?? '-',
    onlyDate(ticket.scheduledAt) ?? 'sem agendamento',
    redact(ticket.summary),
  ].join(' | '));
  const header = 'FSA | status | prioridade | loja | cidade | técnico | aberto em | agendamento | título';
  const cut = tickets.length > limit ? `\n(${tickets.length - limit} chamados a mais não listados)` : '';
  // O modelo não tem relógio: sem esta linha, "hoje" e "ontem" não significam
  // nada para ele.
  const stamp = `Hoje é ${onlyDate(today.toISOString())}. As datas abaixo estão no formato AAAA-MM-DD.`;
  return [stamp, `${tickets.length} chamados na fila.`, header, ...rows].join('\n') + cut;
}

const BASE = `Você é o assistente de operações do Caju OS, que atende chamados de suporte de TI em lojas de varejo no Brasil.

Regras:
- Responda em português do Brasil, direto, sem saudação e sem repetir a pergunta.
- Use SOMENTE os dados fornecidos. Se algo não estiver ali, diga que não consta — nunca invente FSA, data, peça, valor ou nome.
- Você não altera nada no Jira. Quando sugerir uma ação, deixe claro que é sugestão para uma pessoa executar.`;

const TASKS: Record<AssistantTask, string> = {
  summary: `${BASE}

Tarefa: resumir o chamado para quem vai pegá-lo agora.
Formato: um parágrafo curto (até 4 linhas) com o problema, onde está e o que já aconteceu. Depois, se houver, uma linha "Pendências:" com o que falta.`,
  next_step: `${BASE}

Tarefa: dizer qual é o próximo passo do chamado.
Formato: uma linha "Próximo passo:" com a ação concreta, depois até três marcadores curtos com o porquê, baseados no status, no agendamento e no histórico. Se faltar informação para decidir, diga o que precisa ser verificado antes.`,
  queue: `${BASE}

Tarefa: responder a pergunta da pessoa sobre a fila de chamados listada.
Formato: resposta direta primeiro. Ao citar chamados, use a FSA. Se a pergunta pedir contagem ou ordenação, confira na lista antes de responder. Se a lista não permitir responder, diga isso.
Perguntas sobre data ("hoje", "ontem", "esta semana"): a primeira linha do contexto diz a data de hoje, e cada chamado traz a coluna "aberto em". Conte a partir delas.`,
};

export function buildMessages(task: AssistantTask, context: string, question?: string) {
  const ask = task === 'queue'
    ? `${context}\n\nPergunta: ${redact((question ?? '').trim())}`
    : context;
  return [
    { role: 'system', content: TASKS[task] },
    { role: 'user', content: ask },
  ];
}

// O Workers AI devolve formatos diferentes por modelo; a rota não deve
// adivinhar. Devolve string vazia quando não veio texto aproveitável.
export function parseAnswer(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (!raw || typeof raw !== 'object') return '';
  const payload = raw as { response?: unknown; result?: { response?: unknown } };
  const value = payload.response ?? payload.result?.response;
  return typeof value === 'string' ? value.trim() : '';
}

export const MAX_QUESTION_LENGTH = 400;

export function validQuestion(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.length <= MAX_QUESTION_LENGTH;
}
