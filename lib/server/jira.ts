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
    customfield_14809?: unknown;
    customfield_14827?: unknown;
    customfield_14954?: unknown;
    customfield_11994?: unknown;
    customfield_12036?: unknown;
    customfield_12278?: unknown;
    customfield_12413?: unknown;
    customfield_14880?: unknown;
    customfield_11955?: unknown;
    customfield_12316?: unknown;
    customfield_19825?: unknown;
  };
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
};

type JiraProjectIssueType = {
  statuses?: Array<{ name?: string }>;
};

const OPERATIONAL_STATUSES = [
  'AGENDAMENTO',
  'AGENDAMENTO PEDIDO PELO CLIENTE',
  'Agendado',
  'Aguardando Spare',
  'DIRECIONADO',
  'TEC-CAMPO',
] as const;

let operationalStatusesCache: { expiresAt: number; names: string[] } | null = null;

export async function searchJiraIssues(options: { query?: string; status?: string; nextPageToken?: string; maxResults?: number }) {
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const clauses = [`project = "${jqlString(projectKey)}"`, 'resolution = Unresolved'];
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

  const response = await jiraFetch<JiraSearchResponse>('/rest/api/3/search/jql', {
    method: 'POST',
    body: JSON.stringify({
      jql: `${clauses.join(' AND ')} ORDER BY updated DESC`,
      fields: ['summary', 'status', 'priority', 'assignee', 'created', 'updated', 'duedate', 'labels', 'customfield_14954', 'customfield_14809', 'customfield_14827', 'customfield_11994', 'customfield_12036', 'customfield_12278'],
      maxResults: Math.min(Math.max(options.maxResults ?? 50, 1), 100),
      ...(options.nextPageToken ? { nextPageToken: options.nextPageToken } : {}),
    }),
  });

  return {
    issues: (response.issues ?? []).map(toSummary),
    nextPageToken: response.nextPageToken ?? null,
    isLast: response.isLast ?? !response.nextPageToken,
  };
}

export async function getJiraIssue(key: string) {
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const normalizedKey = key.toUpperCase();
  if (!new RegExp(`^${projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(normalizedKey)) {
    throw new JiraError('Chamado inválido.', 400);
  }
  const issue = await jiraFetch<JiraIssue>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}?fields=summary,description,status,priority,assignee,reporter,created,updated,duedate,labels,issuetype,project,customfield_14954,customfield_14809,customfield_14827,customfield_11994,customfield_12036,customfield_12278`);
  return { ...toSummary(issue), description: adfToText(issue.fields.description), reporter: issue.fields.reporter?.displayName ?? null, issueType: issue.fields.issuetype?.name ?? '', project: issue.fields.project?.name ?? '', jiraUrl: `${requiredEnv('JIRA_BASE_URL').replace(/\/+$/, '')}/browse/${normalizedKey}` };
}

export async function getFinancialIssues(days = 180) {
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const safeDays = Math.min(Math.max(Math.trunc(days), 7), 365);
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const response = await jiraFetch<JiraSearchResponse>('/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify({
        jql: `project = "${jqlString(projectKey)}" AND updated >= -${safeDays}d AND status NOT IN (Cancelado, REJEITADO, INATIVO) ORDER BY updated DESC`,
        fields: ['summary', 'status', 'assignee', 'updated', 'project', 'customfield_14954', 'customfield_11994', 'customfield_12413', 'customfield_14880', 'customfield_11955', 'customfield_12316', 'customfield_19825'],
        maxResults: 100,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    issues.push(...(response.issues ?? []));
    nextPageToken = response.nextPageToken;
  } while (nextPageToken && issues.length < 1000);

  return issues.map((issue) => {
    const total = numberField(issue.fields.customfield_12413);
    const spare = Math.min(total, numberField(issue.fields.customfield_14880));
    return {
      key: issue.key,
      title: issue.fields.summary ?? 'Sem título',
      status: issue.fields.status?.name ?? 'Sem status',
      technician: customFieldText(issue.fields.customfield_11955)
        ?? customFieldText(issue.fields.customfield_12316)
        ?? issue.fields.assignee?.displayName
        ?? 'Não atribuído',
      store: customFieldText(issue.fields.customfield_14954) ?? 'Loja não informada',
      city: customFieldText(issue.fields.customfield_11994) ?? 'Cidade não informada',
      updatedAt: issue.fields.updated ?? '',
      serviceValue: Math.max(0, total - spare),
      spareValue: spare,
      totalValue: total,
      billed: customFieldText(issue.fields.customfield_19825)?.toLowerCase() === 'sim',
    };
  }).filter((issue) => issue.totalValue > 0 || issue.spareValue > 0);
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
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Basic ${credential}`, ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401) throw new JiraError('Credencial do Jira inválida ou expirada.', 502);
    if (response.status === 403) throw new JiraError('A conta de integração não possui permissão no projeto.', 502);
    if (response.status === 404) throw new JiraError('Chamado não encontrado.', 404);
    throw new JiraError(`O Jira respondeu com erro ${response.status}.`, 502);
  }
  return response.json() as Promise<T>;
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
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const field = value as { value?: unknown; name?: unknown; displayName?: unknown };
    for (const candidate of [field.value, field.name, field.displayName]) if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function numberField(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function adfToText(value: unknown): string {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const node = value as { text?: unknown; content?: unknown[] };
  const own = typeof node.text === 'string' ? node.text : '';
  return own + (Array.isArray(node.content) ? node.content.map(adfToText).join('') : '');
}
