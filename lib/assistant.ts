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
  // "Acionado" na operação é o parceiro acionado (customfield_12278), não a
  // abertura do chamado.
  partnerTriggeredAt: string | null;
  technicianName: string | null;
  // Tipo (MIME) de cada anexo do Jira. Toda evidência do Caju OS (N1, WhatsApp,
  // tela do chamado) sobe como anexo, então é aqui que ela aparece.
  attachmentTypes?: string[];
  // Valores financeiros do chamado no Jira
  visitCost1?: string | null;
  visitCost2?: string | null;
  improductiveCost?: string | null;
  equipmentTotal?: string | null;
  valueR$?: string | null;
  ticketTotal?: string | null;
};

export type AssistantIssue = AssistantTicket & {
  description: string;
  allegedDefect: string | null;
  problemCategory: string | null;
  equipmentModel: string | null;
  equipment?: string | null;
  serialNumber?: string | null;
  patrimony?: string | null;
  cost?: string | null;
  additionalCosts?: string | null;
  budget?: string | null;
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

export function formatMoney(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const clean = str.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = Number(clean);
  if (Number.isFinite(num)) {
    return `R$ ${num.toFixed(2).replace('.', ',')}`;
  }
  return str;
}

function line(label: string, value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? `${label}: ${redact(clean)}\n` : '';
}

export function ticketContext(issue: AssistantIssue, maxComments = 6, today = new Date()): string {
  // Sem a data de hoje o modelo não sabe se o agendamento já passou.
  let text = `Hoje é ${operationDate(today)}.\nChamado ${issue.key}\n`;
  text += line('Título', issue.summary);
  text += line('Status', statusLabel(issue.status));
  text += line('Prioridade', issue.priority);
  text += line('Loja', issue.store);
  text += line('Cidade', issue.city);
  text += line('Aberto em', issue.createdAt);
  text += line('Parceiro acionado em', issue.partnerTriggeredAt);
  text += line('Agendado para', issue.scheduledAt);
  text += line('Técnico', issue.technicianName);
  if (issue.attachmentTypes) text += line('Anexos (evidências)', describeAttachments(issue.attachmentTypes));
  text += line('Categoria do problema', issue.problemCategory);
  if (issue.equipmentModel || issue.equipment) text += line('Equipamento', issue.equipmentModel ?? issue.equipment);
  if (issue.serialNumber) text += line('Número de Série', issue.serialNumber);
  if (issue.patrimony) text += line('Patrimônio', issue.patrimony);
  text += line('Defeito alegado', issue.allegedDefect);
  text += line('Resumo do defeito', issue.defectSummary);
  if (issue.visitCost1) text += line('Custo 1ª Visita', formatMoney(issue.visitCost1));
  if (issue.visitCost2) text += line('Custo 2ª Visita', formatMoney(issue.visitCost2));
  if (issue.improductiveCost) text += line('Custo Improdutiva', formatMoney(issue.improductiveCost));
  if (issue.equipmentTotal) text += line('Valor Total Equipamentos', formatMoney(issue.equipmentTotal));
  if (issue.valueR$) text += line('Valor (R$)', formatMoney(issue.valueR$));
  if (issue.cost) text += line('Custo', formatMoney(issue.cost));
  if (issue.ticketTotal) text += line('Total do Chamado', formatMoney(issue.ticketTotal));
  if (issue.additionalCosts) text += line('Custos Adicionais', issue.additionalCosts);
  if (issue.budget) text += line('Orçamento', formatMoney(issue.budget));
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

// Datas do Jira vêm com hora e fuso ("2026-09-16T10:23:00.000-0300"); campos
// de texto podem vir em DD/MM/AAAA. Na fila só o dia interessa, sempre em
// AAAA-MM-DD para o modelo comparar com "Hoje é".
export function onlyDate(value: string | null | undefined): string | null {
  const iso = value?.match(/^\s*(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = value?.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return value?.trim() || null;
}

// Data com hora, para a fila. Só o dia não basta: "quais caíram hoje após as
// 15h?" fazia o assistente consultar de novo e de novo até estourar o limite de
// rodadas, porque a hora não estava em lugar nenhum do contexto. A busca por
// padrões que existia antes entendia horário, então isto é o mínimo.
export function dateAndTime(value: string | null | undefined): string | null {
  const iso = value?.match(/^\s*(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (iso) return `${iso[1]} ${iso[2]}`;
  const br = value?.match(/^\s*(\d{2})\/(\d{2})\/(\d{4})[,\s]+(\d{2}:\d{2})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]} ${br[4]}`;
  // Sem hora no dado: a data sozinha ainda vale.
  return onlyDate(value);
}

// Instante do banco no fuso da operação. As datas do Jira já chegam com
// -0300, mas as do D1 são UTC: a última mensagem do WhatsApp apareceu como
// "2026-09-18T03:02:00.000Z" numa resposta, três horas à frente do que o
// celular de quem perguntou mostrava.
export function operationDateTime(value: string | null | undefined, timeZone = OPERATION_TIMEZONE): string | null {
  const time = Date.parse(value ?? '');
  if (!Number.isFinite(time)) return value?.trim() || null;
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(time));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

// "Hoje" é o hoje de quem está perguntando, não o do servidor. O Worker roda em
// UTC: depois das 21h de Brasília o `toISOString()` já devolve o dia seguinte, e
// o assistente responderia sobre amanhã. Os chamados também são operados neste
// fuso, então é ele que vale.
export const OPERATION_TIMEZONE = 'America/Sao_Paulo';

export function operationDate(now: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD, o mesmo formato das datas do Jira.
  return new Intl.DateTimeFormat('en-CA', { timeZone: OPERATION_TIMEZONE }).format(now);
}

// Modelo pequeno erra contagem numa tabela de 60 linhas. As contagens de hoje
// e de ontem saem prontas daqui; o modelo só escolhe qual delas a pergunta pede.
function dayCounts(tickets: AssistantTicket[], day: string, label: string): string[] {
  const count = (kind: string, pick: (ticket: AssistantTicket) => string | null) => {
    const keys = tickets.filter((ticket) => onlyDate(pick(ticket)) === day).map((ticket) => ticket.key);
    return `- ${kind} ${label} (${day}): ${keys.length}${keys.length ? ` — ${keys.join(', ')}` : ''}`;
  };
  return [
    count('Acionados', (ticket) => ticket.partnerTriggeredAt),
    count('Abertos no Jira', (ticket) => ticket.createdAt),
    count('Agendados para', (ticket) => ticket.scheduledAt),
  ];
}

// O Jira chama de "TEC-CAMPO" o que a tela mostra como "Técnico em campo". O
// assistente responde para quem lê a tela, então usa a palavra da tela. Status
// desconhecido (resolvido, cancelado…) fica como veio.
const STATUS_LABELS: Array<[RegExp, string]> = [
  [/^agendado$/, 'Agendado'],
  [/agendamento/, 'Pendente de agendamento'],
  [/spare/, 'Aguardando spare'],
  [/direcion/, 'Direcionado'],
  [/tec-campo|tecnico em campo|em atendimento/, 'Técnico em campo'],
  [/pendencia/, 'Pendência técnica'],
];

export function statusLabel(status: string): string {
  const normalized = status.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return STATUS_LABELS.find(([pattern]) => pattern.test(normalized))?.[1] ?? status.trim();
}

// FSAs citadas na pergunta. O servidor busca essas no Jira, porque podem estar
// fora da fila operacional (já resolvidos ou cancelados, por exemplo).
export function ticketKeysIn(text: string, limit = 30): string[] {
  return [...new Set((text.toUpperCase().match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []))].slice(0, limit);
}

// "2 fotos, 1 vídeo, 1 PDF" — o modelo lê melhor que uma lista de MIME types.
export function describeAttachments(types: string[]): string {
  if (!types.length) return 'nenhum';
  const tally = { foto: 0, vídeo: 0, PDF: 0, outro: 0 };
  for (const type of types) {
    if (type.startsWith('image/')) tally.foto += 1;
    else if (type.startsWith('video/')) tally.vídeo += 1;
    else if (type === 'application/pdf') tally.PDF += 1;
    else tally.outro += 1;
  }
  const plural: Record<string, string> = { foto: 'fotos', vídeo: 'vídeos', PDF: 'PDFs', outro: 'outros' };
  return Object.entries(tally)
    .filter(([, total]) => total > 0)
    .map(([kind, total]) => `${total} ${total === 1 ? kind : plural[kind]}`)
    .join(', ');
}

// "Quais estão com técnico em campo?" veio com 26 dos 30, e com uma linha
// "Direcionado: não consta" que ninguém pediu. Com os grupos prontos, o modelo
// copia a linha em vez de varrer a tabela.
function statusGroups(tickets: AssistantTicket[]): string[] {
  const byStatus = new Map<string, string[]>();
  for (const ticket of tickets) {
    const label = statusLabel(ticket.status);
    byStatus.set(label, [...(byStatus.get(label) ?? []), ticket.key]);
  }
  return ['Chamados por status nesta lista (já conferidos):',
    ...[...byStatus].map(([status, keys]) => `- ${status}: ${keys.length} — ${keys.join(', ')}`)];
}

// Chamados sem nenhum anexo, por status. Mesma razão das contagens por data:
// "quais em campo estão sem evidência" é filtro duplo, e o modelo pequeno erra.
function withoutAttachments(tickets: AssistantTicket[]): string[] {
  const byStatus = new Map<string, string[]>();
  for (const ticket of tickets) {
    if (!ticket.attachmentTypes || ticket.attachmentTypes.length) continue;
    const label = statusLabel(ticket.status);
    byStatus.set(label, [...(byStatus.get(label) ?? []), ticket.key]);
  }
  if (!byStatus.size) return ['- Sem nenhum anexo: 0'];
  return [...byStatus].map(([status, keys]) => `- Sem nenhum anexo em "${status}": ${keys.length} — ${keys.join(', ')}`);
}

// Agrupamento por valor de 1ª visita quando presente nos chamados listados.
// Evita erro de contagem no modelo quando a operação pergunta "quantos chamados com valor de primeira visita X".
function costGroups(tickets: AssistantTicket[]): string[] {
  const withCost = tickets.filter((ticket) => ticket.visitCost1 != null && String(ticket.visitCost1).trim() !== '');
  if (!withCost.length) return [];
  const byCost = new Map<string, string[]>();
  for (const ticket of withCost) {
    const formatted = formatMoney(ticket.visitCost1) ?? String(ticket.visitCost1).trim();
    byCost.set(formatted, [...(byCost.get(formatted) ?? []), ticket.key]);
  }
  return [
    'Valores de 1ª visita registrados na fila:',
    ...[...byCost].map(([val, keys]) => `- 1ª Visita ${val}: ${keys.length} — ${keys.join(', ')}`),
  ];
}

// Brasil não tem horário de verão desde 2019, então 24h atrás é sempre ontem.
export function previousOperationDate(now: Date = new Date()): string {
  return operationDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

export function queueContext(tickets: AssistantTicket[], limit = 60, today = new Date()): string {
  const listed = tickets.slice(0, limit);
  const rows = listed.map((ticket) => [
    ticket.key,
    statusLabel(ticket.status),
    ticket.priority,
    ticket.store ?? '-',
    ticket.city ?? '-',
    ticket.technicianName ?? 'sem técnico',
    // Abertura no Jira, acionamento do parceiro e visita: três datas
    // diferentes, e a operação pergunta por todas.
    dateAndTime(ticket.createdAt) ?? '-',
    dateAndTime(ticket.partnerTriggeredAt) ?? 'não acionado',
    dateAndTime(ticket.scheduledAt) ?? 'sem agendamento',
    ticket.attachmentTypes ? describeAttachments(ticket.attachmentTypes) : '-',
    redact(ticket.summary),
  ].join(' | '));
  const header = 'FSA | status | prioridade | loja | cidade | técnico | aberto em | acionado em | agendamento | anexos | título';
  const cut = tickets.length > limit ? `\n(${tickets.length - limit} chamados a mais não listados)` : '';
  // O modelo não tem relógio: sem esta linha, "hoje" e "ontem" não significam
  // nada para ele.
  const day = operationDate(today);
  const yesterday = previousOperationDate(today);
  const stamp = `Hoje é ${day}; ontem foi ${yesterday}. As datas abaixo estão no formato AAAA-MM-DD HH:MM, no horário de Brasília; algumas não têm hora.`;
  const costs = costGroups(listed);
  const counts = [
    ...statusGroups(listed),
    '',
    'Contagens prontas nesta lista (já conferidas):',
    ...dayCounts(listed, day, 'hoje'),
    ...dayCounts(listed, yesterday, 'ontem'),
    ...(listed.some((ticket) => ticket.attachmentTypes) ? withoutAttachments(listed) : []),
    ...(costs.length ? ['', ...costs] : []),
  ];
  return [stamp, `${tickets.length} chamados na fila.`, ...counts, '', header, ...rows].join('\n') + cut;
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
Responda SÓ o que foi perguntado: não liste outros status nem escreva "não consta" para status que ninguém pediu.
Pergunta sobre status ("quais estão em X", "quantos estão em X"): copie a linha de X em "Chamados por status", inteira, sem recontar e sem deixar FSA de fora. Se X não aparecer ali, nenhum chamado da lista está nesse status.
Perguntas sobre data ("hoje", "ontem", "esta semana"): a primeira linha do contexto diz a data de hoje. Decida pelo SENTIDO da pergunta, não por palavra exata; as listas abaixo são exemplos:
- Chegada do chamado para a operação — acionado, acionamento, caiu, caíram, colocado, colocaram, entrou, entraram, chegou, chegaram, veio, recebemos, novos → coluna "acionado em".
- Criação no Jira — só quando a pergunta fala em aberto, abertura, criado ou criação → coluna "aberto em".
- Visita marcada — agendado, agendamento, visita, atendimento marcado → coluna "agendamento".
- Se não der para saber qual é, use "acionado em".
Para "hoje" e "ontem", copie a linha certa das "Contagens prontas" (número e FSAs), sem recontar. Para outros períodos, conte pela coluna.
Evidência, foto, vídeo, RAT, anexo, comprovante: use a coluna "anexos" (arquivos anexados ao chamado no Jira). "Sem evidência" = "nenhum". Para "sem evidência" num status, copie a linha "Sem nenhum anexo em ..." das contagens prontas; se o status não aparecer ali, nenhum chamado nele está sem anexo. Status: compare com a coluna "status" sem diferenciar maiúsculas ("técnico em campo" = "Técnico em campo").
Perguntas sobre custos e valores financeiros ("valor da primeira visita", "custo de visita", "chamados com valor X"): se houver contagem em "Valores de 1ª visita registrados na fila", use diretamente essas contagens e cite as FSAs. Caso contrário, use as informações de cada chamado.
Só quando a pergunta for sobre data, diga em poucas palavras qual coluna usou (ex.: "pela data de acionamento"). Em pergunta que não é sobre data, não escreva isso. Cite sempre as FSAs.`,
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

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export function normalizeToolCall(call: unknown, index = 0): ToolCall | null {
  if (!call || typeof call !== 'object') return null;
  const obj = call as {
    id?: unknown;
    type?: unknown;
    name?: unknown;
    arguments?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  };

  const name = typeof obj.function?.name === 'string'
    ? obj.function.name
    : typeof obj.name === 'string'
      ? obj.name
      : '';
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return null;

  let argsStr = '{}';
  const rawArgs = obj.function?.arguments ?? obj.arguments;
  if (typeof rawArgs === 'string') {
    argsStr = rawArgs;
  } else if (rawArgs && typeof rawArgs === 'object') {
    argsStr = JSON.stringify(rawArgs);
  }

  const id = typeof obj.id === 'string' && obj.id.length > 0
    ? obj.id
    : `call_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    type: 'function',
    function: { name, arguments: argsStr },
  };
}

// Modelos do Workers AI (como o GLM-4.7-Flash ou Mistral) podem emitir tool calls
// em tags XML (<tool_call>) ou sintaxe textual direta no corpo da resposta quando
// não usam o envelope OpenAI choices[0].message.tool_calls. Esta função extrai
// essas chamadas, normaliza os argumentos e limpa as tags do texto visível.
export function extractToolCallsFromText(text: string): { cleanedText: string; calls: ToolCall[] } {
  const calls: ToolCall[] = [];
  if (!text) return { cleanedText: '', calls };

  // 1. Tag format: <tool_call>...</tool_call> (ou não fechada no fim do texto)
  const toolCallRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi;
  let cleaned = text.replace(toolCallRegex, (_, body: string) => {
    const raw = body.trim();
    if (!raw) return '';

    // Formato JSON puro dentro da tag: {"name": "...", "arguments": {...}}
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const parsed = JSON.parse(raw) as { name?: string; arguments?: unknown };
        if (typeof parsed.name === 'string') {
          const call = normalizeToolCall(parsed, calls.length);
          if (call) calls.push(call);
          return '';
        }
      } catch {}
    }

    // Formato nome seguido de JSON: "detalhar_chamado\n{...}"
    const jsonMatch = raw.match(/^([a-zA-Z0-9_-]+)\s*(\{[^]*\})$/);
    if (jsonMatch) {
      const call = normalizeToolCall({ name: jsonMatch[1], arguments: jsonMatch[2] }, calls.length);
      if (call) calls.push(call);
      return '';
    }

    // Formato GLM com tags filhas: detalhar_chamado<arg_key>chamado</arg_key><arg_value>FSA-123</arg_value>
    const nameMatch = raw.match(/^([a-zA-Z0-9_-]+)/);
    if (nameMatch) {
      const name = nameMatch[1];
      const args: Record<string, unknown> = {};
      const argRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/gi;
      let m: RegExpExecArray | null;
      let hasArgs = false;
      while ((m = argRegex.exec(raw)) !== null) {
        hasArgs = true;
        const key = m[1].trim();
        const rawVal = m[2].trim();
        try {
          args[key] = JSON.parse(rawVal);
        } catch {
          args[key] = rawVal;
        }
      }
      if (hasArgs || !raw.includes('<arg_key>')) {
        const call = normalizeToolCall({ name, arguments: args }, calls.length);
        if (call) calls.push(call);
        return '';
      }
    }

    return '';
  });

  // 2. Formato Mistral: [TOOL_CALLS] [...]
  const mistralRegex = /\[TOOL_CALLS\]\s*(\[[^]*?\])/gi;
  cleaned = cleaned.replace(mistralRegex, (_, jsonList: string) => {
    try {
      const list = JSON.parse(jsonList);
      if (Array.isArray(list)) {
        for (const item of list) {
          const call = normalizeToolCall(item, calls.length);
          if (call) calls.push(call);
        }
      }
    } catch {}
    return '';
  });

  // 3. Remove resquícios de tags e seus conteúdos para garantir que o usuário nunca veja XML
  cleaned = cleaned
    .replace(/<arg_key>[\s\S]*?<\/arg_key>/gi, '')
    .replace(/<arg_value>[\s\S]*?<\/arg_value>/gi, '')
    .replace(/<\/?(?:tool_call|arg_key|arg_value|tool_response)>/gi, '')
    .trim();

  return { cleanedText: cleaned, calls };
}

// Higieniza qualquer resposta final para assegurar que tags internas de ferramentas
// e seus parâmetros nunca vazem na tela do usuário.
export function sanitizeFinalAnswer(text: string): string {
  if (!text) return '';
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/\[TOOL_CALLS\]\s*\[[^]*?\]/gi, '')
    .replace(/<arg_key>[\s\S]*?<\/arg_key>/gi, '')
    .replace(/<arg_value>[\s\S]*?<\/arg_value>/gi, '')
    .replace(/<\/?(?:tool_call|arg_key|arg_value|tool_response)>/gi, '')
    .trim();
}

// Lê de forma universal a resposta bruta de qualquer modelo do Workers AI,
// suportando formato OpenAI (choices[0].message.tool_calls), formato nativo Cloudflare
// (payload.tool_calls) e tags textuais (como as geradas pelo GLM-4.7-Flash).
export function readAssistantResponse(raw: unknown): { text: string; rawText: string; calls: ToolCall[] } {
  if (!raw || typeof raw !== 'object') return { text: '', rawText: '', calls: [] };
  const payload = raw as {
    choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>;
    response?: unknown;
    result?: { response?: unknown; tool_calls?: unknown };
    tool_calls?: unknown;
  };

  const message = payload.choices?.[0]?.message;
  const initialText = typeof message?.content === 'string'
    ? message.content.trim()
    : typeof payload.response === 'string'
      ? payload.response.trim()
      : typeof payload.result?.response === 'string'
        ? payload.result.response.trim()
        : '';

  const calls: ToolCall[] = [];

  // Formato OpenAI: choices[0].message.tool_calls
  if (Array.isArray(message?.tool_calls)) {
    for (const item of message.tool_calls) {
      const c = normalizeToolCall(item, calls.length);
      if (c) calls.push(c);
    }
  }

  // Formato raiz Cloudflare Workers AI: payload.tool_calls
  if (Array.isArray(payload.tool_calls)) {
    for (const item of payload.tool_calls) {
      const c = normalizeToolCall(item, calls.length);
      if (c) calls.push(c);
    }
  }

  // Formato encapsulado: payload.result.tool_calls
  if (Array.isArray(payload.result?.tool_calls)) {
    for (const item of payload.result.tool_calls) {
      const c = normalizeToolCall(item, calls.length);
      if (c) calls.push(c);
    }
  }

  // Formato textual embutido: <tool_call>...
  const { cleanedText, calls: textCalls } = extractToolCallsFromText(initialText);
  for (const c of textCalls) {
    if (!calls.some((existing) => existing.function.name === c.function.name && existing.function.arguments === c.function.arguments)) {
      calls.push(c);
    }
  }

  return {
    text: cleanedText,
    rawText: initialText,
    calls,
  };
}

// FSAs citadas na resposta viram links para abrir o chamado. A separação fica
// aqui, pura, para o componente só desenhar.
export type AnswerPart = { text: string; ticketKey?: string };

export function splitTicketKeys(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of text.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: match[0], ticketKey: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export const MAX_QUESTION_LENGTH = 400;

export function validQuestion(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.length <= MAX_QUESTION_LENGTH;
}
