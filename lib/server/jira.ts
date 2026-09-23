import { env } from 'cloudflare:workers';
import { extrairRastreioDeTexto, formatarDataExcelOuIso } from '@/lib/assistant';
import { JIRA_PHONE_PLACEHOLDER, scrubTechnicianPhone } from '@/lib/technician-data';
import { splitCityUf } from '@/lib/whatsapp-group-name';

export { extrairRastreioDeTexto, formatarDataExcelOuIso } from '@/lib/assistant';

export function isJiraConfigured() {
  return Boolean(env.JIRA_BASE_URL?.trim() && env.JIRA_EMAIL?.trim() && env.JIRA_API_TOKEN?.trim());
}

export type JiraIssueSummary = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  assignee: string | null;
  technicianName: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  labels: string[];
  store: string | null;
  city: string | null;
  scheduledAt: string | null;
  partnerTriggeredAt: string | null;
  // Só com `withAttachments`: o tipo (MIME) de cada anexo do chamado.
  attachmentTypes?: string[];
  // Valores financeiros do chamado
  visitCost1?: string | null;
  visitCost2?: string | null;
  improductiveCost?: string | null;
  equipmentTotal?: string | null;
  valueR$?: string | null;
  ticketTotal?: string | null;
};

export type JiraAttachmentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  author: string | null;
};

export type JiraInternalComment = { id: string; body: string; author: string | null; createdAt: string };

type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string; statusCategory?: { key?: string } };
    priority?: { name?: string } | null;
    assignee?: { displayName?: string } | null;
    reporter?: { displayName?: string } | null;
    created?: string;
    updated?: string;
    duedate?: string | null;
    labels?: string[];
    issuetype?: { name?: string };
    project?: { key?: string; name?: string };
    attachment?: Array<{ id?: string; filename?: string; mimeType?: string; size?: number; created?: string; author?: { displayName?: string } }>;
    customfield_14809?: unknown;
    customfield_14827?: unknown;
    customfield_14954?: unknown;
    customfield_11994?: unknown;
    customfield_12317?: unknown;
    customfield_12036?: unknown;
    customfield_10702?: unknown;
    customfield_10703?: unknown;
    customfield_12279?: unknown;
    customfield_12316?: unknown;
    customfield_16237?: unknown;
    customfield_11956?: unknown;
    customfield_16238?: unknown;
    customfield_11963?: unknown;
    customfield_12278?: unknown;
    customfield_12413?: unknown;
    customfield_14880?: unknown;
    customfield_11955?: unknown;
    customfield_19825?: unknown;
    customfield_11958?: unknown;
    customfield_12419?: unknown;
    customfield_11959?: unknown;
    customfield_16195?: unknown;
    customfield_14821?: unknown;
    customfield_17468?: unknown;
    customfield_13308?: unknown;
    customfield_13501?: unknown;
    customfield_12806?: unknown;
    customfield_15087?: unknown;
    customfield_15088?: unknown;
    customfield_15089?: unknown;
    customfield_16196?: unknown;
    customfield_12031?: unknown;
    customfield_12032?: unknown;
    customfield_14886?: unknown;
    customfield_12280?: unknown;
    customfield_12844?: unknown;
    customfield_12848?: unknown;
    customfield_18558?: unknown;
    customfield_18559?: unknown;
    customfield_16189?: unknown;
    customfield_16801?: unknown;
    customfield_16800?: unknown;
    customfield_21999?: unknown;
    customfield_22000?: unknown;
    customfield_19646?: unknown;
    customfield_16190?: unknown;
    customfield_16191?: unknown;
    customfield_16192?: unknown;
    customfield_16194?: unknown;
    customfield_12081?: unknown;
  } & Record<string, unknown>;
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  names?: Record<string, string>;
  nextPageToken?: string;
  isLast?: boolean;
};

type JiraProjectIssueType = {
  statuses?: Array<{ name?: string }>;
};

type JiraField = {
  id?: string;
  name?: string;
  schema?: { type?: string; custom?: string };
};

type JiraFieldSearchResponse = {
  isLast?: boolean;
  values?: JiraField[];
};

type JiraNamedIssue = JiraIssue & {
  names?: Record<string, string>;
};

type FinancialFieldIds = {
  total: string[];
  spare: string[];
  technician: string[];
  billed: string[];
};
type FinancialIssue = { key: string; title: string; status: string; technician: string; store: string; city: string; updatedAt: string; serviceValue: number; spareValue: number; totalValue: number; billed: boolean };
export type JiraIssuePreset = 'assignedPartner' | 'spareApproved24h';

const OPERATIONAL_STATUSES = [
  'AGENDAMENTO',
  'AGENDAMENTO PEDIDO PELO CLIENTE',
  'Agendado',
  'Aguardando Spare',
  'DIRECIONADO',
  'TEC-CAMPO',
] as const;

let operationalStatusesCache: { expiresAt: number; names: string[] } | null = null;
let financialFieldsCache: { expiresAt: number; ids: FinancialFieldIds } | null = null;
const issuesCache = new Map<string, { expiresAt: number; value: { issues: JiraIssueSummary[]; nextPageToken: string | null; isLast: boolean } }>();
let financialIssuesCache: { expiresAt: number; value: FinancialIssue[] } | null = null;
// Short-lived edge cache keeps dashboards responsive while webhook sync is added.
const CACHE_TTL_MS = 45_000;

async function jiraSearch(body: { jql: string; fields: string[]; maxResults: number; nextPageToken?: string }) {
  let enhanced: JiraSearchResponse | null = null;
  try {
    enhanced = await jiraFetch<JiraSearchResponse>('/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (body.nextPageToken) throw error;
    return jiraFetch<JiraSearchResponse>('/rest/api/3/search', {
      method: 'POST',
      body: JSON.stringify({ jql: body.jql, fields: body.fields, maxResults: body.maxResults, startAt: 0 }),
    });
  }
  if ((enhanced.issues?.length ?? 0) > 0 || body.nextPageToken) return enhanced;
  try {
    return await jiraFetch<JiraSearchResponse>('/rest/api/3/search', {
      method: 'POST',
      body: JSON.stringify({ jql: body.jql, fields: body.fields, maxResults: body.maxResults, startAt: 0 }),
    });
  } catch {
    return enhanced;
  }
}

function jiraIssuePreset(preset: JiraIssuePreset, projectKey: string) {
  if (preset === 'assignedPartner') {
    return {
      clauses: [
        `project = "${jqlString(projectKey)}"`,
        '"parceiro-atribuido[user picker (single user)]" = currentUser()',
      ],
      orderBy: 'ORDER BY status ASC',
    };
  }
  return {
    clauses: [
      `project = "${jqlString(projectKey)}"`,
      'status = "Aguardando Spare"',
      '"data/hora da aprovação[time stamp]" >= -1d',
    ],
    orderBy: 'ORDER BY "cf[15078]" ASC, "cf[14954]" ASC, "cf[11994]" ASC, key ASC',
  };
}

// `withAttachments` traz a lista de anexos de cada chamado. Fica de fora da
// lista principal: chamado com dezenas de fotos pesa, e a tela não usa isso.
// `keys` busca chamados nomeados, em qualquer status — é o que o assistente
// usa quando a pergunta cita FSAs que podem estar fora da fila operacional.
export async function searchJiraIssues(options: { query?: string; status?: string; preset?: JiraIssuePreset; nextPageToken?: string; maxResults?: number; withAttachments?: boolean; keys?: string[] }) {
  const keys = [...new Set((options.keys ?? []).map((key) => key.toUpperCase()).filter((key) => /^[A-Z][A-Z0-9_]+-\d+$/.test(key)))];
  const cacheKey = JSON.stringify({ q: options.query?.trim() ?? '', s: options.status?.trim() ?? '', p: options.preset ?? '', c: options.nextPageToken ?? '', m: options.maxResults ?? 50, a: options.withAttachments ? 1 : 0, k: keys });
  const cached = issuesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const preset = options.preset ? jiraIssuePreset(options.preset, projectKey) : null;
  const clauses = preset?.clauses ?? [`project = "${jqlString(projectKey)}"`];
  const query = options.query?.trim();
  if (query) {
    if (/^[A-Z][A-Z0-9_]+-\d+$/i.test(query)) clauses.push(`key = "${jqlString(query.toUpperCase())}"`);
    else clauses.push(`text ~ "${jqlString(query)}"`);
  }
  if (keys.length) {
    // Chamado citado pelo nome vale mesmo já resolvido ou cancelado, então
    // aqui não entra filtro de status.
    clauses.push(`key IN (${keys.map((key) => `"${jqlString(key)}"`).join(', ')})`);
  } else if (!preset && options.status?.trim()) {
    clauses.push(`status = "${jqlString(options.status.trim())}"`);
  } else if (!preset) {
    const operationalStatuses = await getOperationalStatusNames(projectKey);
    clauses.push(`status IN (${operationalStatuses.map((status) => `"${jqlString(status)}"`).join(', ')})`);
  }

  const response = await jiraSearch({
      jql: `${clauses.join(' AND ')} ${preset?.orderBy ?? 'ORDER BY updated DESC'}`,
      fields: ['summary', 'status', 'priority', 'assignee', 'created', 'updated', 'duedate', 'labels', 'customfield_14954', 'customfield_14809', 'customfield_14810', 'customfield_14827', 'customfield_11994', 'customfield_12317', 'customfield_12036', 'customfield_12278', 'customfield_12316', 'customfield_11958', 'customfield_12419', 'customfield_11959', 'customfield_14880', 'customfield_16195', 'customfield_14821', 'customfield_12413', 'customfield_14886', 'customfield_15087', 'customfield_16196', ...(options.withAttachments ? ['attachment'] : [])],
      maxResults: Math.min(Math.max(options.maxResults ?? 50, 1), 100),
      ...(options.nextPageToken ? { nextPageToken: options.nextPageToken } : {}),
  });
  if (!(response.issues?.length) && !options.query?.trim() && !options.status?.trim() && !preset) {
    throw new JiraError('A integração do Jira está autenticada, mas sem acesso aos chamados do projeto. Atualize a credencial ou a permissão da conta de integração.', 502);
  }

  const value = {
    issues: (response.issues ?? []).map((issue) => {
      const summary = toSummary(issue);
      return options.withAttachments
        ? { ...summary, attachmentTypes: (issue.fields?.attachment ?? []).map((attachment) => attachment.mimeType ?? '') }
        : summary;
    }).filter((issue): issue is JiraIssueSummary => Boolean(issue)),
    nextPageToken: response.nextPageToken ?? null,
    isLast: response.isLast ?? !response.nextPageToken,
  };
  issuesCache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function getJiraIssue(key: string) {
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const normalizedKey = key.toUpperCase();
  if (!new RegExp(`^${projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(normalizedKey)) {
    throw new JiraError('Chamado inválido.', 400);
  }
  const issue = await jiraFetch<JiraNamedIssue>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}?expand=names&fields=*all`);
  const named = namedValues(issue.fields, issue.names ?? {});
  const value = (...aliases: string[]) => aliases.map((alias) => named.get(normalizeText(alias))).find(Boolean) ?? null;
  const storeCode = value('Código da Loja', 'Codigo da Loja') ?? customFieldText(issue.fields.customfield_14954);
  const operationalFields = {
    storeCode,
    storeName: value('Nome da Loja', 'Loja'),
    contactName: value('Nome Contato', 'Nome do Contato'),
    contactPhone: value('Telefone de Contato', 'Telefone Contato'),
    preferredServiceTime: value('Melhor horário para atendimento técnico', 'Melhor horario para atendimento tecnico'),
    problemCategory: value('Categoria do Problema'),
    equipmentModel: value('Equipamento Marca / Modelo', 'Equipamento Marca/Modelo'),
    pdvNumber: value('Numero do PDV', 'Número do PDV'),
    problemType: value('Tipo de problema'),
    allegedDefect: value('Defeito alegado'),
    visitCost1: value('Custo Visita1', 'Custo Visita 1') ?? customFieldText(issue.fields.customfield_11958),
    equipmentTotal: value('Valor Total de Equipamentos') ?? customFieldText(issue.fields.customfield_14880),
    kmTotal: value('Valor total do KM', 'Valor Total do KM'),
    visitCost2: value('Custo Visita2', 'Custo Visita 2') ?? customFieldText(issue.fields.customfield_12419),
    improductiveCost: value('Custo Improdutiva', 'Custo Visita Improdutiva') ?? customFieldText(issue.fields.customfield_11959),
    valueR$: value('Valor R$', 'Valor (R$)') ?? customFieldText(issue.fields.customfield_16195),
    cost: value('Custo') ?? customFieldText(issue.fields.customfield_14821),
    ticketTotal: value('Total do Tickt', 'Total do Ticket') ?? customFieldText(issue.fields.customfield_12413),
    visitNumber: value('Numero de Visita', 'Número de Visita'),
    additionalCosts: value('Detalhes de custos adicionais', 'Custos Adicionais') ?? customFieldText(issue.fields.customfield_17468) ?? customFieldText(issue.fields.customfield_13308),
    budget: value('Orçamento', 'Orcamento') ?? customFieldText(issue.fields.customfield_13501),
    equipment: value('Equipamento') ?? customFieldText(issue.fields.customfield_15087) ?? customFieldText(issue.fields.customfield_16196),
    serialNumber: value('Número de Série', 'Numero de Serie', 'Nº de Série') ?? customFieldText(issue.fields.customfield_15088) ?? customFieldText(issue.fields.customfield_12031),
    patrimony: value('Patrimônio', 'Patrimonio') ?? customFieldText(issue.fields.customfield_15089) ?? customFieldText(issue.fields.customfield_12032),
    technicianData: value('Dados dos Técnicos Nome-CPF-RG-TEL', 'Dados dos Tecnicos Nome-CPF-RG-TEL', 'Dados dos Técnicos') ?? customFieldText(issue.fields.customfield_12279) ?? technicianFieldsToText(issue.fields),
    scheduledDateTime: value('Data /Hora Agendamento', 'Data/Hora Agendamento', 'Data Hora Agendamento') ?? customFieldText(issue.fields.customfield_12036),
    // These names occur more than once in the Jira configuration. Always read
    // the confirmed IDs first; otherwise a duplicate field can overwrite the
    // time shown after a successful save and incorrectly block validation.
    serviceStartedAt: customFieldText(issue.fields.customfield_10702) ?? value('Data/Hora - Início', 'Data/Hora - Inicio', 'Data Hora - Início', 'Data Hora - Inicio'),
    serviceEndedAt: customFieldText(issue.fields.customfield_10703) ?? value('Data/Hora - Término', 'Data/Hora - Termino', 'Data Hora - Término', 'Data Hora - Termino'),
    defectSummary: value('Resumo do defeito'),
    // --- CAMPOS DE REQUISIÇÃO (REQ / FRESHSERVICE) ---
    chamadoFreshservice: value('Chamado no Freshservice', 'Chamado Freshservice') ?? customFieldText(issue.fields.customfield_14886),
    inReq: value('IN_REQ', 'IN REQ') ?? customFieldText(issue.fields.customfield_12280),
    tituloRequisicao: value('Titulo_da_Requisição', 'Titulo da Requisicao', 'Título da Requisição') ?? customFieldText(issue.fields.customfield_12844),
    statusRequisicao: value('Status_da_Requisição', 'Status da Requisicao', 'Status da Requisição') ?? customFieldText(issue.fields.customfield_12848),
    dataEnvio: formatarDataExcelOuIso(
      value('Data - Envio', 'Data Envio', 'Data de Saída', 'Data de Saida')
      ?? customFieldText(issue.fields.customfield_18558)
      ?? customFieldText(issue.fields.customfield_16800)
      ?? customFieldText(issue.fields.customfield_21999)
    ),
    dataRecebimento: formatarDataExcelOuIso(
      value('Data - Recebimento', 'Data Recebimento', 'Data/hora objeto entregue', 'Data/Hora Objeto Entregue')
      ?? customFieldText(issue.fields.customfield_18559)
      ?? customFieldText(issue.fields.customfield_22000)
    ),
    dataEntrega: formatarDataExcelOuIso(
      value('Data - Recebimento', 'Data Recebimento', 'Data/hora objeto entregue', 'Data/Hora Objeto Entregue')
      ?? customFieldText(issue.fields.customfield_18559)
      ?? customFieldText(issue.fields.customfield_22000)
    ),

    // ──── VALORES FINANCEIROS ────
    valorReais: value('Valor(R$)', 'Valor', 'Valor R$') ?? customFieldText(issue.fields.customfield_16195),
    custoTotal: value('Custo') ?? customFieldText(issue.fields.customfield_14821),
    custosAdicionais: value('Custos adicionais', 'Detalhes de custos adicionais') ?? customFieldText(issue.fields.customfield_17468) ?? customFieldText(issue.fields.customfield_13308),
    custoAuxiliar: value('Custo Auxiliar') ?? customFieldText(issue.fields.customfield_15012),
    orcamento: value('Orçamento', 'Orcamento') ?? customFieldText(issue.fields.customfield_13501),
    detalhesCustos: value('DETALHES DOS CUSTOS', 'Detalhes dos Custos') ?? customFieldText(issue.fields.customfield_12410),
    subTotal: value('Sub_Total', 'Sub Total') ?? customFieldText(issue.fields.customfield_12806),
    rateioPercent: value('Rateio_%', 'Rateio %') ?? customFieldText(issue.fields.customfield_12807),
    pagamentoAntecipado: value('Pagamento Antecipado') ?? customFieldText(issue.fields.customfield_16434),
    descricaoPagamento: value('Descrição de Pagamento', 'Descricao de Pagamento') ?? customFieldText(issue.fields.customfield_16435),

    // ──── EQUIPAMENTO (detalhes) ────
    serialSpareNumber: value('Serial Number/Spare Number', 'Serial Spare Number') ?? customFieldText(issue.fields.customfield_16196),
    tipoEquipamento: value('Tipo de Equipamento') ?? customFieldText(issue.fields.customfield_16197),
    marca: value('Marca') ?? customFieldText(issue.fields.customfield_16198),
    patrimonio: value('Patrimonio', 'Patrimônio') ?? customFieldText(issue.fields.customfield_15089) ?? customFieldText(issue.fields.customfield_12032),
    equipamentoModelo: value('Equipamento / Modelo', 'Equipamento / Modelo') ?? customFieldText(issue.fields.customfield_15088),
    equipamentoCmdb: customFieldText(issue.fields.customfield_15087),
    novoEquipamento: customFieldText(issue.fields.customfield_16155),
    trocaEquipamento: value('Foi feita a troca do equipamento?') ?? customFieldText(issue.fields.customfield_16157),
    reserva: value('Reserva') ?? customFieldText(issue.fields.customfield_16199),
    correcaoPdv: value('Correção PDV', 'Correcao PDV') ?? customFieldText(issue.fields.customfield_16200),
    equipComDefeito: value('Equipamento com defeito') ?? customFieldText(issue.fields.customfield_16214),

    // ──── DATAS EXTRAS ────
    dtChegadaLoja: formatarDataExcelOuIso(value('Data/Hora - Chegada na Loja', 'Data/Hora Chegada na Loja') ?? customFieldText(issue.fields.customfield_14812)),
    dtChegada: formatarDataExcelOuIso(value('Data/Hora - Chegada', 'Data/Hora Chegada') ?? customFieldText(issue.fields.customfield_15013)),
    dtAprovacao: formatarDataExcelOuIso(value('Data/Hora da Aprovação', 'Data/Hora da Aprovacao') ?? customFieldText(issue.fields.customfield_15078)),
    dtReprovacao: formatarDataExcelOuIso(value('Data/Hora da Reprovação', 'Data/Hora da Reprovacao') ?? customFieldText(issue.fields.customfield_16633)),
    dataLimite: formatarDataExcelOuIso(value('Data/Limite', 'Data Limite') ?? customFieldText(issue.fields.customfield_12081)),
    previsaoEntrega: formatarDataExcelOuIso(
      value('Previsão de Entrega', 'Previsao de Entrega')
      ?? customFieldText(issue.fields.customfield_16801)
      ?? customFieldText(issue.fields.customfield_12844)
    ),
    agendamentoSpare: value('Agendamento de Spare') ?? customFieldText(issue.fields.customfield_21932),

    // ──── CATEGORIZAÇÃO ────
    severidade: value('Severidade') ?? customFieldText(issue.fields.customfield_13300),
    tipoSolicitacao: value('Tipo de Solicitação', 'Tipo de Solicitacao') ?? customFieldText(issue.fields.customfield_13302),
    tipoAtendimento: value('Tipo Atendimento', 'Tipo de Atendimento') ?? customFieldText(issue.fields.customfield_11954),
    chamadoDuplicado: value('Chamado Duplicado') ?? customFieldText(issue.fields.customfield_14867),
    aprovacao: value('Aprovação', 'Aprovacao') ?? customFieldText(issue.fields.customfield_14889),
    causaRaiz: value('Causa Raiz') ?? customFieldText(issue.fields.customfield_22813),
    nivelCriticidade: value('Nivel de criticidade', 'Nível de criticidade') ?? customFieldText(issue.fields.customfield_22476),
    nps: value('NPS') ?? customFieldText(issue.fields.customfield_12218),
    impacto: value('Impacto') ?? customFieldText(issue.fields.customfield_12207),
    urgencia: value('Urgência', 'Urgencia') ?? customFieldText(issue.fields.customfield_12208),

    // ──── PESSOAS EXTRAS ────
    responsavelTratativa: value('Responsável pela Tratativa', 'Responsavel pela Tratativa') ?? customFieldText(issue.fields.customfield_12281),
    responsavelResolver: value('Responsável por Resolver', 'Responsavel por Resolver') ?? customFieldText(issue.fields.customfield_12282),
    aprovadorTecnico: value('Aprovador - Tecnico', 'Aprovador - Técnico') ?? customFieldText(issue.fields.customfield_12403),
    responsavelN1: value('Responsável N1', 'Responsavel N1') ?? customFieldText(issue.fields.customfield_25158),
    responsavelN2: value('Responsável N2', 'Responsavel N2') ?? customFieldText(issue.fields.customfield_25159),
    nomeParceiro: value('Nome do Parceiro', 'Nome Parceiro') ?? customFieldText(issue.fields.customfield_15110),

    // ──── LOJA EXTRAS ────
    tipoLoja: value('Tipo de Loja') ?? customFieldText(issue.fields.customfield_14866),
    lojaApelido: value('Loja (Apelido)') ?? customFieldText(issue.fields.customfield_16213),
    regional: value('Regional') ?? customFieldText(issue.fields.customfield_16170),

    // ──── LOGÍSTICA ────
    codigoRastreio: value('Código de Rastreio', 'Codigo de Rastreio', 'Rastreio', 'Objeto')
      ?? customFieldText(issue.fields.customfield_16189)
      ?? customFieldText(issue.fields.customfield_12848),
    enderecoDestino: value('Endereço de Destino', 'Endereco de Destino') ?? customFieldText(issue.fields.customfield_16190),
    cidadeDestino: value('Cidade de Destino') ?? customFieldText(issue.fields.customfield_16192),
    cepDestino: value('CEP de Destino') ?? customFieldText(issue.fields.customfield_16194),
    qtdVolumes: value('Qtd. Volumes', 'Quantidade de Volumes') ?? customFieldText(issue.fields.customfield_19646),

    // ──── PEÇAS USADAS (quantidades) ────
    hd: customFieldText(issue.fields.customfield_15111),
    caboScannerZebra: customFieldText(issue.fields.customfield_15112),
    caboUsb: customFieldText(issue.fields.customfield_15113),
    caboHdmi: customFieldText(issue.fields.customfield_15114),
    caboVga: customFieldText(issue.fields.customfield_15115),
    caboForcaTripolar: customFieldText(issue.fields.customfield_15116),
    fonteInterna: customFieldText(issue.fields.customfield_16140),
    telaPdvTouch: customFieldText(issue.fields.customfield_16142),
    monitorTouch: customFieldText(issue.fields.customfield_16144),
    bateriaCmos: customFieldText(issue.fields.customfield_16145),
    gabinete: customFieldText(issue.fields.customfield_16147),
    fan: customFieldText(issue.fields.customfield_16148),
    cabecaImpressao: customFieldText(issue.fields.customfield_17754),
  };
  const attachments: JiraAttachmentSummary[] = (issue.fields.attachment ?? []).flatMap((attachment) => attachment.id && attachment.filename ? [{ id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType ?? 'application/octet-stream', size: attachment.size ?? 0, createdAt: attachment.created ?? '', author: attachment.author?.displayName ?? null }] : []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const commentPayload = await jiraFetch<{ values?: Array<{ id?: string; body?: unknown; created?: string; author?: { displayName?: string }; public?: boolean }> }>(`/rest/servicedeskapi/request/${encodeURIComponent(normalizedKey)}/comment?internal=true&limit=20`).catch(() => ({ values: [] }));
  const internalComments: JiraInternalComment[] = (commentPayload.values ?? []).filter((comment) => comment.public !== true).map((comment) => ({ id: String(comment.id ?? ''), body: adfToText(comment.body), author: comment.author?.displayName ?? null, createdAt: comment.created ?? '' })).filter((comment) => comment.id && comment.body);

  // Fallback inteligente: se o campo de rastreio estiver vazio, inspeciona comentários e descrição
  if (!operationalFields.codigoRastreio) {
    for (const comment of internalComments) {
      const achou = extrairRastreioDeTexto(comment.body || '');
      if (achou) {
        operationalFields.codigoRastreio = achou;
        break;
      }
    }
    if (!operationalFields.codigoRastreio && (issue.fields as Record<string, unknown>).comment) {
      const comments = ((issue.fields as Record<string, unknown>).comment as { comments?: Array<{ body?: unknown }> })?.comments;
      if (Array.isArray(comments)) {
        for (const c of comments.slice().reverse()) {
          const bodyText = typeof c.body === 'string' ? c.body : adfToText(c.body);
          const achou = extrairRastreioDeTexto(bodyText);
          if (achou) {
            operationalFields.codigoRastreio = achou;
            break;
          }
        }
      }
    }
    if (!operationalFields.codigoRastreio && issue.fields.description) {
      const achou = extrairRastreioDeTexto(adfToText(issue.fields.description));
      if (achou) {
        operationalFields.codigoRastreio = achou;
      }
    }
  }
  return { ...toSummary(issue), store: storeCode, description: adfToText(issue.fields.description), reporter: issue.fields.reporter?.displayName ?? null, issueType: issue.fields.issuetype?.name ?? '', project: issue.fields.project?.name ?? '', jiraUrl: `${requiredEnv('JIRA_BASE_URL').replace(/\/+$/, '')}/browse/${normalizedKey}`, operationalFields, attachments, internalComments };
}

export async function updateJiraIssue(key: string, input: Record<string, unknown>, options: { allowNoop?: boolean } = {}) {
  const normalizedKey = validIssueKey(key);
  input = withoutTechnicianPhone(input);
  const issue = await jiraFetch<JiraNamedIssue>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}?expand=names&fields=*all`);
  const ids = namedIds(issue.names ?? {});
  const fields: Record<string, unknown> = {};
  const mappings: Array<[string, string[]]> = [
    ['storeCode', ['Código da Loja', 'Codigo da Loja']], ['storeName', ['Nome da Loja']], ['contactName', ['Nome Contato', 'Nome do Contato']],
    ['contactPhone', ['Telefone de Contato', 'Telefone Contato']], ['preferredServiceTime', ['Melhor horário para atendimento técnico', 'Melhor horario para atendimento tecnico']],
    ['problemCategory', ['Categoria do Problema']], ['equipmentModel', ['Equipamento Marca / Modelo', 'Equipamento Marca/Modelo']], ['pdvNumber', ['Numero do PDV', 'Número do PDV']],
    ['problemType', ['Tipo de problema']], ['allegedDefect', ['Defeito alegado']], ['visitCost1', ['Custo Visita1', 'Custo Visita 1']],
    ['equipmentTotal', ['Valor Total de Equipamentos']], ['kmTotal', ['Valor total do KM', 'Valor Total do KM']], ['visitCost2', ['Custo Visita2', 'Custo Visita 2']],
    ['ticketTotal', ['Total do Tickt', 'Total do Ticket']], ['visitNumber', ['Numero de Visita', 'Número de Visita']], ['additionalCosts', ['Detalhes de custos adicionais']],
    ['technicianData', ['Dados dos Técnicos Nome-CPF-RG-TEL', 'Dados dos Tecnicos Nome-CPF-RG-TEL', 'Dados dos Técnicos']],
    ['scheduledDateTime', ['Data /Hora Agendamento', 'Data/Hora Agendamento', 'Data Hora Agendamento']],
    ['serviceStartedAt', ['Data/Hora - Início', 'Data/Hora - Inicio', 'Data Hora - Início', 'Data Hora - Inicio']],
    ['serviceEndedAt', ['Data/Hora - Término', 'Data/Hora - Termino', 'Data Hora - Término', 'Data Hora - Termino']],
    ['technicianName', ['Nome do Técnico', 'Nome do Tecnico']], ['technicianPhone', ['Telefone do Técnico', 'Telefone do Tecnico']],
    ['technicianRg', ['RG']], ['technicianCpf', ['CPF/CNPJ Técnico', 'CPF/CNPJ Tecnico']], ['technicianContact', ['Número Contato', 'Numero Contato']],
  ];
  for (const [inputKey, aliases] of mappings) {
    if (input[inputKey] === undefined) continue;
    const fixedIds: Record<string, string> = {
      scheduledDateTime: 'customfield_12036', technicianData: 'customfield_12279', technicianName: 'customfield_12316',
      serviceStartedAt: 'customfield_10702', serviceEndedAt: 'customfield_10703',
      technicianPhone: 'customfield_16237', technicianRg: 'customfield_11956', technicianCpf: 'customfield_16238', technicianContact: 'customfield_11963',
    };
    const fixedId = fixedIds[inputKey];
    const id = fixedId ?? aliases.map((name) => ids.get(normalizeText(name))).find(Boolean);
    if (id) {
      const value = ['visitCost1', 'equipmentTotal', 'kmTotal', 'visitCost2', 'ticketTotal', 'visitNumber'].includes(inputKey)
        ? numericJiraValue(input[inputKey])
        : ['scheduledDateTime', 'serviceStartedAt', 'serviceEndedAt'].includes(inputKey) ? jiraDateTimeValue(input[inputKey]) : cleanJiraValue(input[inputKey]);
      const requiresAdf = inputKey === 'technicianData' || isAdfDocument(issue.fields[id]);
      fields[id] = requiresAdf && typeof value === 'string' ? textToAdf(value) : value;
    }
  }
  if (input.technicianData !== undefined) {
    const technician = parseTechnicianData(cleanJiraValue(input.technicianData));
    // The technician phone field always gets the placeholder, overwriting a
    // phone left by an earlier scheduling. customfield_11963 ("Número
    // Contato") is no longer written here: it's documented as the requester's
    // contact, so a placeholder could erase real data.
    const individualFields: Record<string, string | null> = {
      customfield_12316: technician.name, customfield_16237: JIRA_PHONE_PLACEHOLDER, customfield_11956: technician.rg,
      customfield_16238: technician.cpf,
    };
    for (const [id, value] of Object.entries(individualFields)) if (value) fields[id] = value;
  }
  if (['identifiedProblem', 'testsPerformed', 'partToReplace'].some((name) => input[name] !== undefined)) {
    const id = ids.get(normalizeText('Resumo do defeito'));
    const existing = parseTechnicalSummary(id ? customFieldText(issue.fields[id]) : null);
    if (id) fields[id] = textToAdf(`PROBLEMA IDENTIFICADO: ${cleanJiraValue(input.identifiedProblem) ?? existing.identifiedProblem}\n\nTESTES FEITOS: ${cleanJiraValue(input.testsPerformed) ?? existing.testsPerformed}\n\nPEÇA A SER TROCADA: ${cleanJiraValue(input.partToReplace) ?? existing.partToReplace}`);
  }
  if (!Object.keys(fields).length) {
    if (options.allowNoop) return getJiraIssue(normalizedKey);
    throw new JiraError('Nenhum dos campos alterados existe neste tipo de chamado do Jira.', 400);
  }
  await updateJiraFieldsWithScreenFallback(normalizedKey, fields);
  issuesCache.clear(); financialIssuesCache = null;
  return getJiraIssue(normalizedKey);
}

/**
 * Jira screens vary by request type. The five individual technician fields are
 * useful when exposed, but must never stop scheduling when a screen hides one
 * of them. The workflow-required ADF block and date remain in the request.
 */
async function updateJiraFieldsWithScreenFallback(key: string, initialFields: Record<string, unknown>) {
  const fields = { ...initialFields };
  const optionalTechnicianFields = new Set(['customfield_12316', 'customfield_16237', 'customfield_11956', 'customfield_16238', 'customfield_11963']);
  while (Object.keys(fields).length) {
    try {
      await jiraFetch<void>(`/rest/api/3/issue/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ fields }) });
      return;
    } catch (error) {
      const blocked = error instanceof JiraError
        ? Array.from(error.message.matchAll(/Field ['“”]?([^'“”\s]+)['“”]? cannot be set/gi)).map((match) => match[1])
        : [];
      const removable = blocked.filter((id) => optionalTechnicianFields.has(id) && id in fields);
      if (!removable.length) throw error;
      for (const id of removable) delete fields[id];
    }
  }
  throw new JiraError('O Jira não disponibiliza os campos individuais do técnico para este tipo de chamado.', 400);
}

export async function transitionJiraIssue(key: string, localStatus: string, input: Record<string, unknown> = {}) {
  const normalizedKey = validIssueKey(key);
  const aliases: Record<string, string[]> = {
    triage: ['triagem', 'aberto'], scheduling: ['pendente de agendamento', 'agendamento'], scheduled: ['agendado'], operational_preparation: ['direcionado', 'preparacao operacional'],
    in_service: ['tec-campo', 'tecnico em campo', 'em atendimento', 'em andamento'], technical_pending: ['pendencia tecnica'], validated: ['validado'],
    awaiting_approval: ['aguardando aprovacao'], awaiting_spare: ['aguardando spare'], spare_validated: ['spare validado'], awaiting_payment: ['aguardando pagamento'],
    resolved: ['resolvido', 'concluido', 'finalizado'], archived: ['arquivado', 'resolvido', 'concluido'], cancelled: ['cancelado'],
  };
  const wanted = aliases[localStatus] ?? [];
  if (!wanted.length) throw new JiraError('Etapa inválida.', 400);
  const current = await jiraFetch<JiraIssue>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}?fields=status,customfield_12036,customfield_12279`);
  if (wanted.some((name) => normalizeText(current.fields.status?.name ?? '').includes(normalizeText(name)))) return { changed: false };
  const response = await jiraFetch<{ transitions?: Array<{ id: string; name: string; to?: { name?: string } }> }>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}/transitions`);
  const transition = response.transitions?.find((item) => (localStatus === 'scheduled' && item.id === '9') || wanted.some((name) => [item.name, item.to?.name ?? ''].some((candidate) => normalizeText(candidate).includes(normalizeText(name)))));
  if (!transition) throw new JiraError(`O Jira não permite mudar de “${current.fields.status?.name ?? 'etapa atual'}” para essa etapa.`, 409);
  const transitionFields: Record<string, unknown> = {};
  if (localStatus === 'scheduled') {
    const scheduledDateTime = jiraDateTimeValue(input.scheduledDateTime) ?? current.fields.customfield_12036;
    // Also scrubs an older block already in Jira, since the transition rewrites it.
    const rawTechnicianText = cleanJiraValue(input.technicianData) ?? customFieldText(current.fields.customfield_12279);
    const technicianText = typeof rawTechnicianText === 'string' ? scrubTechnicianPhone(rawTechnicianText) : rawTechnicianText;
    if (!scheduledDateTime || !technicianText) throw new JiraError('Para agendar, selecione um técnico e informe a data/hora do atendimento.', 400);
    transitionFields.customfield_12036 = scheduledDateTime;
    transitionFields.customfield_12279 = typeof technicianText === 'string' ? textToAdf(technicianText) : technicianText;
  }
  await jiraFetch<void>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: transition.id }, ...(Object.keys(transitionFields).length ? { fields: transitionFields } : {}) }) });
  issuesCache.clear();
  return { changed: true };
}

export async function addJiraInternalEvidence(key: string, files: Array<{ name: string; mimeType: string; data: string }>, author: string) {
  const normalizedKey = validIssueKey(key);
  for (const file of files) {
    const match = file.data.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) continue;
    const bytes = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
    const form = new FormData(); form.append('file', new Blob([bytes], { type: file.mimeType }), file.name);
    await jiraFetch<unknown>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}/attachments`, { method: 'POST', headers: { 'X-Atlassian-Token': 'no-check' }, body: form });
  }
}

// Comentário interno escrito pelo Caju OS. Sempre assinado com quem confirmou:
// no Jira a credencial é a da integração, então sem a assinatura o rastro
// pararia em "Caju OS" e a auditoria perderia a pessoa.
export async function addJiraInternalComment(key: string, body: string, author: string) {
  const normalizedKey = validIssueKey(key);
  await jiraFetch<unknown>(`/rest/servicedeskapi/request/${encodeURIComponent(normalizedKey)}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body: `${body}\n\n— Caju OS, confirmado por ${author}`, public: false }),
  });
}

// "Atualizar chamado" (tela do chamado): nota de quem acompanha o atendimento,
// assinada só com nome e sobrenome — sem o e-mail e sem o "confirmado por"
// das ações do assistente. Também é comentário interno (não vai ao cliente).
export async function addJiraTicketUpdate(key: string, body: string) {
  const normalizedKey = validIssueKey(key);
  await jiraFetch<unknown>(`/rest/servicedeskapi/request/${encodeURIComponent(normalizedKey)}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body, public: false }),
  });
}

export async function uploadJiraAttachments(key: string, files: File[], author: string) {
  const normalizedKey = validIssueKey(key);
  let finalizingInternalComment = false;
  try {
    const request = await jiraFetch<{ serviceDeskId?: string }>(`/rest/servicedeskapi/request/${encodeURIComponent(normalizedKey)}`);
    if (!request.serviceDeskId) throw new JiraError('Central de serviços não encontrada.', 404);
    const temporaryAttachmentIds: string[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file, file.name);
      const uploaded = await jiraFetch<{ temporaryAttachments?: Array<{ temporaryAttachmentId?: string }> }>(`/rest/servicedeskapi/servicedesk/${encodeURIComponent(request.serviceDeskId)}/attachTemporaryFile`, { method: 'POST', headers: { 'X-Atlassian-Token': 'no-check', 'X-ExperimentalApi': 'opt-in' }, body: form });
      temporaryAttachmentIds.push(...(uploaded.temporaryAttachments ?? []).flatMap((item) => item.temporaryAttachmentId ? [item.temporaryAttachmentId] : []));
    }
    if (temporaryAttachmentIds.length !== files.length) throw new JiraError('O Jira não confirmou todos os arquivos temporários.', 502);
    finalizingInternalComment = true;
    await jiraFetch<unknown>(`/rest/servicedeskapi/request/${encodeURIComponent(normalizedKey)}/attachment`, {
      method: 'POST',
      body: JSON.stringify({ temporaryAttachmentIds, public: false }),
    });
  } catch (error) {
    if (finalizingInternalComment) throw error;
    for (const file of files) {
      const form = new FormData();
      form.append('file', file, file.name);
      await jiraFetch<unknown>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}/attachments`, { method: 'POST', headers: { 'X-Atlassian-Token': 'no-check' }, body: form });
    }
  }
  return getJiraIssue(normalizedKey);
}

export async function getJiraAttachmentContent(key: string, attachmentId: string, thumbnail = false) {
  const normalizedKey = validIssueKey(key);
  if (!/^\d+$/.test(attachmentId)) throw new JiraError('Anexo inválido.', 400);
  const issue = await jiraFetch<JiraIssue>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}?fields=attachment`);
  const attachment = issue.fields.attachment?.find((item) => item.id === attachmentId);
  if (!attachment?.filename) throw new JiraError('Anexo não encontrado neste chamado.', 404);
  const baseUrl = requiredEnv('JIRA_BASE_URL').replace(/\/+$/, '');
  const credential = btoa(`${requiredEnv('JIRA_EMAIL')}:${requiredEnv('JIRA_API_TOKEN')}`);
  const resource = thumbnail ? 'thumbnail' : 'content';
  const response = await fetch(`${baseUrl}/rest/api/3/attachment/${resource}/${encodeURIComponent(attachmentId)}`, { headers: { Authorization: `Basic ${credential}`, Accept: '*/*' }, redirect: 'follow' });
  if (!response.ok || !response.body) throw new JiraError(`Não foi possível abrir o anexo no Jira (${response.status}).`, 502);
  return { body: response.body, filename: attachment.filename, mimeType: attachment.mimeType ?? response.headers.get('content-type') ?? 'application/octet-stream', size: attachment.size ?? null };
}

export async function getFinancialIssues(days = 180): Promise<FinancialIssue[]> {
  if (financialIssuesCache && financialIssuesCache.expiresAt > Date.now()) return financialIssuesCache.value;
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const safeDays = Math.min(Math.max(Math.trunc(days), 7), 365);
  const financialFields = await getFinancialFieldIds(projectKey);
  const requestedFields = Array.from(new Set([
    'summary', 'status', 'assignee', 'updated', 'project', 'customfield_14954', 'customfield_11994',
    ...financialFields.total, ...financialFields.spare, ...financialFields.technician, ...financialFields.billed,
  ]));
  const valueFieldIds = Array.from(new Set([...financialFields.total, ...financialFields.spare]));
  const valueClause = valueFieldIds
    .map((id) => `cf[${id.replace('customfield_', '')}] IS NOT EMPTY`)
    .join(' OR ');
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const response = await jiraSearch({
        jql: `project = "${jqlString(projectKey)}" AND updated >= -${safeDays}d AND status NOT IN (Cancelado, REJEITADO, INATIVO) AND (${valueClause}) ORDER BY updated DESC`,
        fields: requestedFields,
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
    });
    issues.push(...(response.issues ?? []));
    nextPageToken = response.nextPageToken;
  } while (nextPageToken && issues.length < 1000);

  if (!issues.length) {
    throw new JiraError('A integração do Jira não consegue ler os tickets financeiros. Atualize a credencial ou a permissão da conta de integração.', 502);
  }

  const value = issues.map((issue) => {
    const total = firstPositiveField(issue.fields, financialFields.total);
    const rawSpare = firstPositiveField(issue.fields, financialFields.spare);
    const spare = total > 0 ? Math.min(total, rawSpare) : rawSpare;
    const finalTotal = total > 0 ? total : rawSpare;
    return {
      key: issue.key,
      title: issue.fields.summary ?? 'Sem título',
      status: issue.fields.status?.name ?? 'Sem status',
      technician: customFieldText(issue.fields.customfield_12316)
        ?? firstTextField(issue.fields, financialFields.technician)
        ?? 'Não atribuído',
      store: customFieldText(issue.fields.customfield_14954) ?? 'Loja não informada',
      city: customFieldText(issue.fields.customfield_11994) ?? 'Cidade não informada',
      updatedAt: issue.fields.updated ?? '',
      serviceValue: Math.max(0, finalTotal - spare),
      spareValue: spare,
      totalValue: finalTotal,
      billed: normalizeText(firstTextField(issue.fields, financialFields.billed) ?? '') === 'sim',
    };
  }).filter((issue) => issue.totalValue > 0 || issue.spareValue > 0);
  financialIssuesCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export class JiraError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function jiraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = requiredEnv('JIRA_BASE_URL').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.atlassian\.net$/i.test(baseUrl)) throw new JiraError('URL do Jira inválida.', 500);
  const credential = btoa(`${requiredEnv('JIRA_EMAIL')}:${requiredEnv('JIRA_API_TOKEN')}`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), Authorization: `Basic ${credential}`, ...init?.headers },
    });
  } catch {
    throw new JiraError('Não foi possível conectar ao Jira agora. Tente novamente em instantes.', 502);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { errorMessages?: string[]; errors?: Record<string, string> } | null;
    const jiraMessage = [...(payload?.errorMessages ?? []), ...Object.values(payload?.errors ?? {})].filter(Boolean).join(' ');
    if (response.status === 401) throw new JiraError('Credencial do Jira inválida ou expirada.', 502);
    if (response.status === 403) throw new JiraError('A conta de integração não possui permissão no projeto.', 502);
    if (response.status === 404) throw new JiraError('Chamado não encontrado.', 404);
    throw new JiraError(jiraMessage ? `O Jira recusou a alteração: ${jiraMessage}` : `O Jira respondeu com erro ${response.status}.`, response.status === 400 ? 400 : 502);
  }
  if (response.status === 204 || !response.headers.get('content-type')?.includes('application/json')) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new JiraError('O Jira respondeu em um formato inesperado. Tente atualizar a tela.', 502);
  }
}

function validIssueKey(key: string) {
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const normalized = key.toUpperCase();
  if (!new RegExp(`^${projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(normalized)) throw new JiraError('Chamado inválido.', 400);
  return normalized;
}

function namedValues(fields: Record<string, unknown>, names: Record<string, string>) {
  const values = new Map<string, string>();
  for (const [id, name] of Object.entries(names)) {
    const value = customFieldText(fields[id]);
    if (value) values.set(normalizeText(name), value);
  }
  return values;
}

function namedIds(names: Record<string, string>) {
  const ids = new Map<string, string>();
  for (const [id, name] of Object.entries(names)) if (id.startsWith('customfield_')) ids.set(normalizeText(name), id);
  return ids;
}

function cleanJiraValue(value: unknown) {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, 8000) || null;
}

function numericJiraValue(value: unknown) {
  if (value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[^\d,.-]/g, '');
  const decimalComma = normalized.lastIndexOf(',') > normalized.lastIndexOf('.');
  const parsed = Number(decimalComma ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function jiraDateTimeValue(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim().slice(0, 100);
  // A date/time field represents an appointment in local civil time. Keep the
  // incoming offset instead of serializing it again as UTC, otherwise a browser
  // in a different timezone can make Jira appear to move the saved time.
  const withOffset = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?([+-]\d{2}:?\d{2}|Z)$/);
  if (withOffset) {
    const offset = withOffset[4] === 'Z' ? '+0000' : withOffset[4].replace(':', '');
    return `${withOffset[1]}:${withOffset[2] ?? '00'}.${(withOffset[3] ?? '000').padEnd(3, '0')}${offset}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function withoutTechnicianPhone(input: Record<string, unknown>) {
  const next = { ...input };
  if (typeof next.technicianData === 'string') next.technicianData = scrubTechnicianPhone(next.technicianData);
  if (next.technicianPhone !== undefined) next.technicianPhone = JIRA_PHONE_PLACEHOLDER;
  // Maps to customfield_11963, documented as the requester's contact.
  delete next.technicianContact;
  return next;
}

function parseTechnicianData(value: string | number | null) {
  const text = typeof value === 'string' ? value : '';
  const field = (...labels: string[]) => {
    for (const label of labels) {
      const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]+)`, 'i'));
      if (match?.[1]?.trim()) return match[1].trim().slice(0, 500);
    }
    return null;
  };
  return { name: field('Nome'), phone: field('TEL', 'Telefone'), rg: field('RG'), cpf: field('CPF(?:/CNPJ)?') };
}

function technicianFieldsToText(fields: JiraIssue['fields']) {
  const values = {
    name: customFieldText(fields.customfield_12316), phone: customFieldText(fields.customfield_16237) ?? customFieldText(fields.customfield_11963),
    rg: customFieldText(fields.customfield_11956), cpf: customFieldText(fields.customfield_16238),
  };
  if (!Object.values(values).some(Boolean)) return null;
  return `Nome: ${values.name ?? 'Não informado'}\nCPF: ${values.cpf ?? 'Não informado'}\nRG: ${values.rg ?? 'Não informado'}\nTEL: ${values.phone ?? 'Não informado'}`;
}

function parseTechnicalSummary(value?: string | null) {
  const text = value ?? '';
  const take = (start: string, end?: string) => text.match(new RegExp(`${start}:?\\s*([\\s\\S]*?)${end ? `(?=${end}:?)` : '$'}`, 'i'))?.[1]?.trim() ?? '';
  return { identifiedProblem: take('PROBLEMA IDENTIFICADO', 'TESTES FEITOS'), testsPerformed: take('TESTES FEITOS', 'PEÇA A SER TROCADA'), partToReplace: take('PEÇA A SER TROCADA') };
}

function isAdfDocument(value: unknown): value is { type: 'doc' } {
  return Boolean(value && typeof value === 'object' && (value as { type?: unknown }).type === 'doc');
}

function textToAdf(value: string) {
  return {
    version: 1,
    type: 'doc',
    content: value.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
  };
}

async function getOperationalStatusNames(projectKey: string) {
  if (operationalStatusesCache && operationalStatusesCache.expiresAt > Date.now()) return operationalStatusesCache.names;

  try {
    const issueTypes = await jiraFetch<JiraProjectIssueType[]>(`/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
    const names = Array.from(new Set(issueTypes.flatMap((issueType) => issueType.statuses ?? [])
      .map((status) => status.name?.trim())
      .filter((name): name is string => Boolean(name))
      .filter(isOperationalStatus)));
    if (names.length) {
      operationalStatusesCache = { names, expiresAt: Date.now() + 5 * 60_000 };
      return names;
    }
  } catch {
    // Keep dashboard available if status discovery lacks permission.
  }

  return [...OPERATIONAL_STATUSES];
}

async function getFinancialFieldIds(projectKey: string): Promise<FinancialFieldIds> {
  if (financialFieldsCache && financialFieldsCache.expiresAt > Date.now()) return financialFieldsCache.ids;

  const defaults: FinancialFieldIds = {
    total: ['customfield_12413'],
    spare: ['customfield_14880'],
    technician: ['customfield_11955', 'customfield_12316'],
    billed: ['customfield_19825'],
  };

  try {
    let fields: JiraField[] = [];
    let startAt = 0;
    let isLast = false;
    try {
      while (!isLast && startAt < 1000) {
        const page = await jiraFetch<JiraFieldSearchResponse>(`/rest/api/3/field/search?type=custom&startAt=${startAt}&maxResults=100`);
        fields.push(...(page.values ?? []));
        isLast = page.isLast ?? (page.values?.length ?? 0) < 100;
        startAt += 100;
      }
    } catch {
      fields = [];
    }
    let customFields = fields.filter((field): field is Required<JiraField> => Boolean(field.id?.startsWith('customfield_') && field.name));
    if (!customFields.length) {
      const recent = await jiraSearch({
          jql: `project = "${jqlString(projectKey)}" ORDER BY updated DESC`,
          fields: ['summary'],
          maxResults: 1,
      });
      const key = recent.issues?.[0]?.key;
      if (key) {
        const issue = await jiraFetch<JiraNamedIssue>(`/rest/api/3/issue/${encodeURIComponent(key)}?expand=names&fields=*all`);
        fields = Object.entries(issue.names ?? {}).map(([id, name]) => ({ id, name }));
        customFields = fields.filter((field): field is Required<JiraField> => Boolean(field.id?.startsWith('customfield_') && field.name));
      }
    }
    const matchingIds = (matcher: (name: string) => boolean) => customFields
      .filter((field) => matcher(normalizeText(field.name)))
      .map((field) => field.id);
    const discovered: FinancialFieldIds = {
      total: matchingIds((name) => (name.includes('ticket') || name.includes('chamado')) && (name.includes('total') || name.includes('valor'))),
      spare: matchingIds((name) => (name.includes('spare') || name.includes('equipamento')) && (name.includes('total') || name.includes('valor') || name.includes('custo'))),
      technician: [
        ...matchingIds((name) => name === 'nomedotecnico' || name.includes('nomedotecnico')),
        ...matchingIds((name) => name.includes('tecnic') && (name.includes('respons') || name.includes('campo') || name.includes('atendimento'))),
      ],
      billed: matchingIds((name) => name.includes('faturad') || name.includes('cobrad')),
    };
    const ids = {
      total: uniquePreferred(discovered.total, defaults.total),
      spare: uniquePreferred(discovered.spare, defaults.spare),
      technician: uniquePreferred(discovered.technician, defaults.technician),
      billed: uniquePreferred(discovered.billed, defaults.billed),
    };
    financialFieldsCache = { ids, expiresAt: Date.now() + 5 * 60_000 };
    return ids;
  } catch {
    return defaults;
  }
}

function isOperationalStatus(value: string) {
  const normalized = normalizeText(value);
  return normalized.includes('agend')
    || normalized.includes('spare')
    || normalized.includes('direcion')
    || normalized.includes('campo')
    || normalized.includes('deslocamento')
    || normalized.includes('em rota')
    || (normalized.includes('tecnic') && (normalized.includes('acion') || normalized.includes('atend')));
}

function requiredEnv(name: 'JIRA_BASE_URL' | 'JIRA_EMAIL' | 'JIRA_API_TOKEN' | 'JIRA_PROJECT_KEY') {
  const value = env[name]?.trim();
  if (!value) throw new JiraError('Integração com o Jira ainda não configurada.', 503);
  return value;
}

function jqlString(value: string) { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toSummary(issue: JiraIssue): JiraIssueSummary {
  const fields = issue.fields ?? {};
  return {
    key: issue.key,
    summary: fields.summary ?? 'Sem título',
    status: fields.status?.name ?? 'Sem status',
    statusCategory: fields.status?.statusCategory?.key ?? 'undefined',
    priority: fields.priority?.name ?? 'Sem prioridade',
    assignee: fields.assignee?.displayName ?? null,
    technicianName: customFieldText(fields.customfield_12316),
    createdAt: fields.created ?? '',
    updatedAt: fields.updated ?? '',
    dueDate: fields.duedate ?? null,
    labels: fields.labels ?? [],
    store: customFieldText(fields.customfield_14954)
      ?? customFieldText(fields.customfield_14809)
      ?? customFieldText(fields.customfield_14827),
    city: cityWithUf(customFieldText(fields.customfield_11994), fields.customfield_12317),
    scheduledAt: customFieldText(fields.customfield_12036),
    partnerTriggeredAt: customFieldText(fields.customfield_12278),
    visitCost1: customFieldText(fields.customfield_11958),
    visitCost2: customFieldText(fields.customfield_12419),
    improductiveCost: customFieldText(fields.customfield_11959),
    equipmentTotal: customFieldText(fields.customfield_14880),
    valueR$: customFieldText(fields.customfield_16195),
    ticketTotal: customFieldText(fields.customfield_12413),
  };
}

// The city text field has no UF; "Cidade / UF" (customfield_12317) is a
// cascading select with both levels. Appends the UF when the text lacks one,
// e.g. "Itabuna" -> "Itabuna - BA" (the WhatsApp group name needs it).
function cityWithUf(city: string | null, cascade: unknown): string | null {
  const parts = cascadingValues(cascade);
  const uf = parts.find((part) => /^[A-Z]{2}$/.test(part.toUpperCase()) && part.length === 2)?.toUpperCase() ?? null;
  const cascadeCity = parts.find((part) => part.length > 2) ?? null;
  const base = city ?? cascadeCity;
  if (!base) return null;
  if (!uf || splitCityUf(base).uf) return base;
  return `${base} - ${uf}`;
}

function cascadingValues(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const node = value as { value?: unknown; child?: unknown };
  const own = typeof node.value === 'string' && node.value.trim() ? [node.value.trim()] : [];
  return [...own, ...cascadingValues(node.child)];
}

function customFieldText(value: unknown): string | null {
  if (Array.isArray(value)) {
    const values = value.map(customFieldText).filter((item): item is string => Boolean(item));
    return values.length ? values.join(', ') : null;
  }
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    if (isAdfDocument(value)) return adfToText(value).trim() || null;
    const field = value as { value?: unknown; name?: unknown; displayName?: unknown };
    for (const candidate of [field.value, field.name, field.displayName]) if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function numberField(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/[^\d,.-]/g, '');
    const decimalComma = normalized.lastIndexOf(',') > normalized.lastIndexOf('.');
    const parsed = Number(decimalComma
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object') {
    const field = value as { value?: unknown; amount?: unknown };
    return numberField(field.value ?? field.amount);
  }
  return 0;
}

function firstPositiveField(fields: Record<string, unknown>, ids: string[]) {
  for (const id of ids) {
    const value = numberField(fields[id]);
    if (value > 0) return value;
  }
  return 0;
}

function firstTextField(fields: Record<string, unknown>, ids: string[]) {
  for (const id of ids) {
    const value = customFieldText(fields[id]);
    if (value) return value;
  }
  return null;
}

function uniquePreferred(preferred: string[], fallback: string[]) {
  return Array.from(new Set([...preferred, ...fallback]));
}

function adfToText(value: unknown): string {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const node = value as { type?: unknown; text?: unknown; content?: unknown[] };
  const own = typeof node.text === 'string' ? node.text : '';
  const children = Array.isArray(node.content) ? node.content.map(adfToText).join('') : '';
  return own + children + (node.type === 'paragraph' ? '\n' : '');
}
