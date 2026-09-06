import { env } from 'cloudflare:workers';

export type JiraIssueSummary = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  labels: string[];
  store: string | null;
  city: string | null;
  scheduledAt: string | null;
  partnerTriggeredAt: string | null;
};

export type JiraAttachmentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  author: string | null;
};

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
    customfield_12036?: unknown;
    customfield_12279?: unknown;
    customfield_12278?: unknown;
    customfield_12413?: unknown;
    customfield_14880?: unknown;
    customfield_11955?: unknown;
    customfield_12316?: unknown;
    customfield_19825?: unknown;
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
  const enhanced = await jiraFetch<JiraSearchResponse>('/rest/api/3/search/jql', {
    method: 'POST',
    body: JSON.stringify(body),
  });
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

export async function searchJiraIssues(options: { query?: string; status?: string; nextPageToken?: string; maxResults?: number }) {
  const cacheKey = JSON.stringify({ q: options.query?.trim() ?? '', s: options.status?.trim() ?? '', c: options.nextPageToken ?? '', m: options.maxResults ?? 50 });
  const cached = issuesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const clauses = [`project = "${jqlString(projectKey)}"`];
  const query = options.query?.trim();
  if (query) {
    if (/^[A-Z][A-Z0-9_]+-\d+$/i.test(query)) clauses.push(`key = "${jqlString(query.toUpperCase())}"`);
    else clauses.push(`text ~ "${jqlString(query)}"`);
  }
  if (options.status?.trim()) {
    clauses.push(`status = "${jqlString(options.status.trim())}"`);
  } else {
    const operationalStatuses = await getOperationalStatusNames(projectKey);
    clauses.push(`status IN (${operationalStatuses.map((status) => `"${jqlString(status)}"`).join(', ')})`);
  }

  const response = await jiraSearch({
      jql: `${clauses.join(' AND ')} ORDER BY updated DESC`,
      fields: ['summary', 'status', 'priority', 'assignee', 'created', 'updated', 'duedate', 'labels', 'customfield_14954', 'customfield_14809', 'customfield_14827', 'customfield_11994', 'customfield_12036', 'customfield_12278'],
      maxResults: Math.min(Math.max(options.maxResults ?? 50, 1), 100),
      ...(options.nextPageToken ? { nextPageToken: options.nextPageToken } : {}),
  });
  if (!(response.issues?.length) && !options.query?.trim() && !options.status?.trim()) {
    throw new JiraError('A integração do Jira está autenticada, mas sem acesso aos chamados do projeto. Atualize a credencial ou a permissão da conta de integração.', 502);
  }

  const value = {
    issues: (response.issues ?? []).map(toSummary),
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
    visitCost1: value('Custo Visita1', 'Custo Visita 1'),
    equipmentTotal: value('Valor Total de Equipamentos'),
    kmTotal: value('Valor total do KM', 'Valor Total do KM'),
    visitCost2: value('Custo Visita2', 'Custo Visita 2'),
    ticketTotal: value('Total do Tickt', 'Total do Ticket'),
    visitNumber: value('Numero de Visita', 'Número de Visita'),
    additionalCosts: value('Detalhes de custos adicionais'),
    technicianData: value('Dados dos Técnicos Nome-CPF-RG-TEL', 'Dados dos Tecnicos Nome-CPF-RG-TEL', 'Dados dos Técnicos') ?? customFieldText(issue.fields.customfield_12279),
    scheduledDateTime: value('Data /Hora Agendamento', 'Data/Hora Agendamento', 'Data Hora Agendamento') ?? customFieldText(issue.fields.customfield_12036),
    defectSummary: value('Resumo do defeito'),
  };
  const attachments: JiraAttachmentSummary[] = (issue.fields.attachment ?? []).flatMap((attachment) => attachment.id && attachment.filename ? [{ id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType ?? 'application/octet-stream', size: attachment.size ?? 0, createdAt: attachment.created ?? '', author: attachment.author?.displayName ?? null }] : []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ...toSummary(issue), store: storeCode, description: adfToText(issue.fields.description), reporter: issue.fields.reporter?.displayName ?? null, issueType: issue.fields.issuetype?.name ?? '', project: issue.fields.project?.name ?? '', jiraUrl: `${requiredEnv('JIRA_BASE_URL').replace(/\/+$/, '')}/browse/${normalizedKey}`, operationalFields, attachments };
}

export async function updateJiraIssue(key: string, input: Record<string, unknown>, options: { allowNoop?: boolean } = {}) {
  const normalizedKey = validIssueKey(key);
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
  ];
  for (const [inputKey, aliases] of mappings) {
    if (input[inputKey] === undefined) continue;
    const fixedId = inputKey === 'scheduledDateTime' ? 'customfield_12036' : inputKey === 'technicianData' ? 'customfield_12279' : undefined;
    const id = fixedId ?? aliases.map((name) => ids.get(normalizeText(name))).find(Boolean);
    if (id) {
      const value = ['visitCost1', 'equipmentTotal', 'kmTotal', 'visitCost2', 'ticketTotal', 'visitNumber'].includes(inputKey)
        ? numericJiraValue(input[inputKey])
        : inputKey === 'scheduledDateTime' ? jiraDateTimeValue(input[inputKey]) : cleanJiraValue(input[inputKey]);
      const requiresAdf = inputKey === 'technicianData' || isAdfDocument(issue.fields[id]);
      fields[id] = requiresAdf && typeof value === 'string' ? textToAdf(value) : value;
    }
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
  await jiraFetch<void>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}`, { method: 'PUT', body: JSON.stringify({ fields }) });
  issuesCache.clear(); financialIssuesCache = null;
  return getJiraIssue(normalizedKey);
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
    const technicianText = cleanJiraValue(input.technicianData) ?? customFieldText(current.fields.customfield_12279);
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
  const body = `Evidências anexadas pelo Caju OS por ${author}: ${files.map((file) => file.name).join(', ')}`;
  await jiraFetch<unknown>(`/rest/servicedeskapi/request/${encodeURIComponent(normalizedKey)}/comment`, { method: 'POST', body: JSON.stringify({ body, public: false }) }).catch(() => null);
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
      body: JSON.stringify({ temporaryAttachmentIds, public: false, additionalComment: { body: `Evidências anexadas pelo Caju OS por ${author}.` } }),
    });
  } catch (error) {
    if (finalizingInternalComment) throw error;
    for (const file of files) {
      const form = new FormData();
      form.append('file', file, file.name);
      await jiraFetch<unknown>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}/attachments`, { method: 'POST', headers: { 'X-Atlassian-Token': 'no-check' }, body: form });
    }
    const body = `Evidências anexadas pelo Caju OS por ${author}: ${files.map((file) => file.name).join(', ')}`;
    await jiraFetch<unknown>(`/rest/servicedeskapi/request/${encodeURIComponent(normalizedKey)}/comment`, { method: 'POST', body: JSON.stringify({ body, public: false }) });
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
      technician: firstTextField(issue.fields, financialFields.technician)
        ?? issue.fields.assignee?.displayName
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
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), Authorization: `Basic ${credential}`, ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { errorMessages?: string[]; errors?: Record<string, string> } | null;
    const jiraMessage = [...(payload?.errorMessages ?? []), ...Object.values(payload?.errors ?? {})].filter(Boolean).join(' ');
    if (response.status === 401) throw new JiraError('Credencial do Jira inválida ou expirada.', 502);
    if (response.status === 403) throw new JiraError('A conta de integração não possui permissão no projeto.', 502);
    if (response.status === 404) throw new JiraError('Chamado não encontrado.', 404);
    throw new JiraError(jiraMessage ? `O Jira recusou a alteração: ${jiraMessage}` : `O Jira respondeu com erro ${response.status}.`, response.status === 400 ? 400 : 502);
  }
  if (response.status === 204 || !response.headers.get('content-type')?.includes('application/json')) return undefined as T;
  return response.json() as Promise<T>;
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
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.trim().slice(0, 100) : parsed.toISOString();
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
  return {
    key: issue.key,
    summary: issue.fields.summary ?? 'Sem título',
    status: issue.fields.status?.name ?? 'Sem status',
    statusCategory: issue.fields.status?.statusCategory?.key ?? 'undefined',
    priority: issue.fields.priority?.name ?? 'Sem prioridade',
    assignee: issue.fields.assignee?.displayName ?? null,
    createdAt: issue.fields.created ?? '',
    updatedAt: issue.fields.updated ?? '',
    dueDate: issue.fields.duedate ?? null,
    labels: issue.fields.labels ?? [],
    store: customFieldText(issue.fields.customfield_14954)
      ?? customFieldText(issue.fields.customfield_14809)
      ?? customFieldText(issue.fields.customfield_14827),
    city: customFieldText(issue.fields.customfield_11994),
    scheduledAt: customFieldText(issue.fields.customfield_12036),
    partnerTriggeredAt: customFieldText(issue.fields.customfield_12278),
  };
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
