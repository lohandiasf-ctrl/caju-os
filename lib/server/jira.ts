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
    customfield_14827?: unknown;
    customfield_11994?: unknown;
    customfield_12036?: unknown;
    customfield_12278?: unknown;
  };
};

type JiraSearchResponse = {
  issues?: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
};

export async function searchJiraIssues(options: { query?: string; status?: string; nextPageToken?: string; maxResults?: number }) {
  const projectKey = requiredEnv('JIRA_PROJECT_KEY').toUpperCase();
  const clauses = [`project = "${jqlString(projectKey)}"`, 'resolution = Unresolved'];
  const query = options.query?.trim();
  if (query) {
    if (/^[A-Z][A-Z0-9_]+-\d+$/i.test(query)) clauses.push(`key = "${jqlString(query.toUpperCase())}"`);
    else clauses.push(`text ~ "${jqlString(query)}"`);
  }
  if (options.status?.trim()) clauses.push(`status = "${jqlString(options.status.trim())}"`);

  const response = await jiraFetch<JiraSearchResponse>('/rest/api/3/search/jql', {
    method: 'POST',
    body: JSON.stringify({
      jql: `${clauses.join(' AND ')} ORDER BY updated DESC`,
      fields: ['summary', 'status', 'priority', 'assignee', 'created', 'updated', 'duedate', 'labels', 'customfield_14827', 'customfield_11994', 'customfield_12036', 'customfield_12278'],
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
  const issue = await jiraFetch<JiraIssue>(`/rest/api/3/issue/${encodeURIComponent(normalizedKey)}?fields=summary,description,status,priority,assignee,reporter,created,updated,duedate,labels,issuetype,project,customfield_14827,customfield_11994,customfield_12036,customfield_12278`);
  return { ...toSummary(issue), description: adfToText(issue.fields.description), reporter: issue.fields.reporter?.displayName ?? null, issueType: issue.fields.issuetype?.name ?? '', project: issue.fields.project?.name ?? '', jiraUrl: `${requiredEnv('JIRA_BASE_URL').replace(/\/+$/, '')}/browse/${normalizedKey}` };
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

function requiredEnv(name: 'JIRA_BASE_URL' | 'JIRA_EMAIL' | 'JIRA_API_TOKEN' | 'JIRA_PROJECT_KEY') {
  const value = env[name]?.trim();
  if (!value) throw new JiraError('Integração com o Jira ainda não configurada.', 503);
  return value;
}

function jqlString(value: string) { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

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
    store: customFieldText(issue.fields.customfield_14827),
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

function adfToText(value: unknown): string {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const node = value as { text?: unknown; content?: unknown[] };
  const own = typeof node.text === 'string' ? node.text : '';
  return own + (Array.isArray(node.content) ? node.content.map(adfToText).join('') : '');
}
