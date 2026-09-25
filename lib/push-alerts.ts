// Avisos push escolhíveis (app do celular). Regras puras, sem imports de
// servidor, para os testes rodarem com strip-types; quem busca a fila, grava o
// que já foi avisado e envia é app/api/push/alerts/route.ts.
//
// Cada aviso dispara quando o chamado CRUZA o limite, dentro de uma janela
// (padrão 30 min; a rotina roda a cada 10). Assim a primeira execução não
// dispara uma enxurrada com todo o atraso acumulado, e a tabela
// push_alerts_sent garante um aviso só por chamado e situação.

/** Regras de SLA do fluxo operacional; a rota passa as de lib/operational-sla.ts. */
export type SlaRules = { closed: Set<string>; hoursOf: (status: string) => number; label: Record<string, string> };

export const ALERT_KINDS = {
  message: { label: 'Mensagens diretas', hint: 'Quando um colega te manda mensagem.', ops: false, default: true },
  group: { label: 'Mensagens de grupo', hint: 'Nos grupos de que você participa.', ops: false, default: true },
  task: { label: 'Tarefas delegadas', hint: 'Tarefa vencida ou pedido de andamento.', ops: false, default: true },
  sla_overdue: { label: 'SLA estourado', hint: 'Chamado passou do prazo da etapa em que está.', ops: true, default: true },
  scheduling_overdue: { label: 'Sem agendamento há mais de 2 h', hint: 'Chamado pendente de agendamento há mais de 2 horas.', ops: true, default: true },
  schedule_missed: { label: 'Passou do horário agendado', hint: 'Agendado, 30 min depois do horário e ainda sem técnico em campo.', ops: true, default: true },
  new_ticket: { label: 'Chamado novo na fila', hint: 'Cada chamado que entra na fila operacional.', ops: true, default: false },
} as const;

export type AlertKind = keyof typeof ALERT_KINDS;
export const ALERT_KIND_LIST = Object.keys(ALERT_KINDS) as AlertKind[];
export type AlertPrefs = Record<AlertKind, boolean>;

/** Perfis que recebem os avisos da fila (os técnicos não têm acesso ao Jira). */
export const OPS_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

export const SCHEDULING_LIMIT_MS = 2 * 3_600_000;
export const SCHEDULE_GRACE_MS = 30 * 60_000;
export const ALERT_WINDOW_MS = 30 * 60_000;
/** Mais que isto de um mesmo tipo numa rodada vira um aviso só, com o total. */
export const SUMMARY_AFTER = 3;

export function prefsWithDefaults(stored: unknown): AlertPrefs {
  const raw = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  return Object.fromEntries(ALERT_KIND_LIST.map((k) => [k, typeof raw[k] === 'boolean' ? raw[k] : ALERT_KINDS[k].default])) as AlertPrefs;
}

export function parsePrefs(json: string | null | undefined): AlertPrefs {
  try { return prefsWithDefaults(json ? JSON.parse(json) : null); } catch { return prefsWithDefaults(null); }
}

export type QueueIssue = {
  key: string; summary: string; status: string; createdAt: string;
  scheduledAt: string | null; store: string | null; city: string | null; technicianName: string | null;
};
export type WorkflowRow = { ticketKey: string; status: string; createdAt: string; updatedAt: string };
export type Alert = { kind: AlertKind; ticketKey: string; dedupe: string; title: string; body: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const time = (v: string | null | undefined) => { const t = v ? Date.parse(v) : Number.NaN; return Number.isFinite(t) ? t : null; };
/** Cruzou `at` agora há pouco: entre (agora − janela) e agora. */
const crossed = (at: number | null, now: number, windowMs: number) => at !== null && at <= now && at > now - windowMs;

function where(issue: Pick<QueueIssue, 'store' | 'city' | 'summary'> | undefined) {
  if (!issue) return '';
  const store = issue.store ? (/^[A-Z]?\d+$/i.test(issue.store) ? `Loja ${issue.store}` : issue.store) : '';
  return [store, issue.city].filter(Boolean).join(' · ');
}

function hhmm(ms: number, timeZone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

export function detectAlerts(issues: QueueIssue[], workflows: WorkflowRow[], sla: SlaRules, now: number, windowMs = ALERT_WINDOW_MS): Alert[] {
  const alerts: Alert[] = [];
  const byKey = new Map(issues.map((i) => [i.key, i]));

  for (const issue of issues) {
    const status = norm(issue.status);
    const created = time(issue.createdAt);
    const place = where(issue);

    if (crossed(created, now, windowMs)) {
      alerts.push({
        kind: 'new_ticket', ticketKey: issue.key, dedupe: `new_ticket:${issue.key}`,
        title: `Chamado novo · ${issue.key}`, body: [place, issue.summary].filter(Boolean).join(' — '),
      });
    }

    // Aproximação: o Jira não informa desde quando está na etapa; usa a abertura,
    // que é quando o chamado costuma entrar em "pendente de agendamento".
    if (status.includes('agendamento') && created !== null && crossed(created + SCHEDULING_LIMIT_MS, now, windowMs)) {
      alerts.push({
        kind: 'scheduling_overdue', ticketKey: issue.key, dedupe: `scheduling_overdue:${issue.key}`,
        title: `Sem agendamento há 2 h · ${issue.key}`, body: `${place ? `${place} — ` : ''}aberto às ${hhmm(created)} e ainda sem agendamento.`,
      });
    }

    const scheduled = time(issue.scheduledAt);
    if (status === 'agendado' && scheduled !== null && crossed(scheduled + SCHEDULE_GRACE_MS, now, windowMs)) {
      alerts.push({
        kind: 'schedule_missed', ticketKey: issue.key, dedupe: `schedule_missed:${issue.key}:${issue.scheduledAt}`,
        title: `Horário passou · ${issue.key}`,
        body: `${place ? `${place} — ` : ''}agendado para ${hhmm(scheduled)}${issue.technicianName ? ` com ${issue.technicianName}` : ''} e ainda não está em campo.`,
      });
    }
  }

  // SLA: a mesma regra do painel operacional (horas por etapa desde a última mudança).
  for (const w of workflows) {
    if (sla.closed.has(w.status) || w.status === 'scheduled') continue;
    const opened = time(w.updatedAt) ?? time(w.createdAt);
    if (opened === null) continue;
    const hours = sla.hoursOf(w.status);
    if (!crossed(opened + hours * 3_600_000, now, windowMs)) continue;
    const place = where(byKey.get(w.ticketKey));
    alerts.push({
      kind: 'sla_overdue', ticketKey: w.ticketKey, dedupe: `sla_overdue:${w.ticketKey}:${w.status}:${w.updatedAt || w.createdAt}`,
      title: `SLA estourado · ${w.ticketKey}`,
      body: `${place ? `${place} — ` : ''}em ${sla.label[w.status] ?? w.status} há mais de ${hours} h.`,
    });
  }
  return alerts;
}

const SUMMARY_TEXT: Record<AlertKind, (n: number) => string> = {
  message: (n) => `${n} mensagens novas`,
  group: (n) => `${n} mensagens nos grupos`,
  task: (n) => `${n} avisos de tarefas`,
  sla_overdue: (n) => `${n} chamados estouraram o SLA`,
  scheduling_overdue: (n) => `${n} chamados sem agendamento há mais de 2 h`,
  schedule_missed: (n) => `${n} chamados passaram do horário agendado`,
  new_ticket: (n) => `${n} chamados novos na fila`,
};

export type Note = { title: string; body: string; data: Record<string, string> };

/** Avisos de uma pessoa, já filtrados pelas preferências; muitos do mesmo tipo viram um só. */
export function notesFor(alerts: Alert[], prefs: AlertPrefs): Note[] {
  const notes: Note[] = [];
  for (const kind of ALERT_KIND_LIST) {
    if (!prefs[kind]) continue;
    const list = alerts.filter((a) => a.kind === kind);
    if (list.length > SUMMARY_AFTER) {
      notes.push({ title: `Caju OS · ${ALERT_KINDS[kind].label}`, body: `${SUMMARY_TEXT[kind](list.length)}: ${list.slice(0, 4).map((a) => a.ticketKey).join(', ')}${list.length > 4 ? '…' : ''}`, data: { kind } });
    } else {
      for (const a of list) notes.push({ title: a.title, body: a.body, data: { kind, url: `/ticket/${a.ticketKey}` } });
    }
  }
  return notes;
}
