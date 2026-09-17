import { env } from 'cloudflare:workers';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers, employeeMessages, operationalAudit, operationalWorkflows, shipmentTracking } from '@/db/schema';
import { agentFindings, type AgentFinding } from '@/lib/agent-rules';
import { buildNoticeMessages, fallbackNotice, noticeMessage } from '@/lib/agent-notice';
import { isJiraConfigured, searchJiraIssues } from '@/lib/server/jira';

// Agente de vigilância. Roda no cron, sem ninguém com o app aberto, e avisa a
// equipe por mensagem interna. **Não escreve no Jira**: nada aqui muda etapa,
// campo ou financeiro, então o agente fica fora das regras de fluxo.
//
// A decisão é das regras (`lib/agent-rules.ts`), determinísticas. A IA só
// escreve o texto, e quando ela falha o aviso sai no formato de reserva.
const SYSTEM_SENDER = 'sistema@cajutech.net';
const AGENT_ACTION = 'agente_aviso';
const NOTICE_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;
// Teto por rodada: um erro de regra vira 25 linhas, não 170 mensagens.
const MAX_FINDINGS = 25;
// O mesmo chamado não é cobrado de novo pela mesma regra antes disso.
const REPEAT_HOURS = 20;
// O cron roda a cada 10 minutos, mas ninguém precisa de aviso a cada 10
// minutos: o que aparecer no meio espera a próxima janela.
const QUIET_MINUTES = 60;
const JIRA_PAGE = 100;
const MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
];

type Runner = { run: (model: string, input: unknown) => Promise<unknown> };

// Interruptor sem deploy: `AGENT_MODE=off` no secret do Worker desliga.
function agentOff() {
  return (env as unknown as { AGENT_MODE?: string }).AGENT_MODE?.trim().toLowerCase() === 'off';
}

async function writeNotice(findings: AgentFinding[]): Promise<string> {
  const ai = (env as unknown as { AI?: Runner }).AI;
  if (!ai) return fallbackNotice(findings);
  const messages = buildNoticeMessages(findings);
  for (const model of MODELS) {
    try {
      const raw = await ai.run(model, { messages, max_tokens: 500, temperature: 0.2 }) as { response?: unknown };
      const answer = typeof raw === 'string' ? raw : typeof raw?.response === 'string' ? raw.response : '';
      if (answer.trim()) return answer.trim();
    } catch (error) {
      console.error(`Agente falhou em ${model}`, error);
    }
  }
  return fallbackNotice(findings);
}

// Chamados do Jira que as regras precisam ver: os agendados (para achar
// agendamento vencido) e os em campo com seus anexos (para achar quem está sem
// evidência). Falha do Jira não derruba a rodada — as regras de banco seguem.
async function jiraTickets() {
  if (!isJiraConfigured()) return [];
  const [scheduled, inField] = await Promise.all([
    searchJiraIssues({ status: 'Agendado', maxResults: JIRA_PAGE }).then((result) => result.issues).catch(() => []),
    searchJiraIssues({ status: 'TEC-CAMPO', maxResults: JIRA_PAGE, withAttachments: true }).then((result) => result.issues).catch(() => []),
  ]);
  return [...scheduled, ...inField].map((issue) => ({
    key: issue.key,
    status: issue.status,
    updatedAt: issue.updatedAt,
    scheduledAt: issue.scheduledAt,
    attachmentTypes: issue.attachmentTypes,
  }));
}

export async function POST(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  if (agentOff()) return Response.json({ desligado: true });
  try {
    const db = getDb();
    const now = new Date();
    const nowIso = now.toISOString();
    const since = new Date(now.getTime() - REPEAT_HOURS * 3_600_000).toISOString();

    const [workflows, shipments, recipients, recent, tickets] = await Promise.all([
      db.select({ ticketKey: operationalWorkflows.ticketKey, status: operationalWorkflows.status, createdAt: operationalWorkflows.createdAt, updatedAt: operationalWorkflows.updatedAt }).from(operationalWorkflows).all(),
      db.select({ ticketKey: shipmentTracking.ticketKey, trackingCode: shipmentTracking.trackingCode, status: shipmentTracking.status, expectedAt: shipmentTracking.expectedAt }).from(shipmentTracking).all(),
      db.select({ email: appUsers.email }).from(appUsers)
        .where(and(eq(appUsers.active, true), inArray(appUsers.role, [...NOTICE_ROLES]))).all(),
      db.select({ ticketKey: operationalAudit.ticketKey, details: operationalAudit.details, createdAt: operationalAudit.createdAt }).from(operationalAudit)
        .where(and(eq(operationalAudit.action, AGENT_ACTION), gte(operationalAudit.createdAt, since))).all(),
      jiraTickets(),
    ]);

    const lastNotice = recent.reduce((latest, row) => row.createdAt > latest ? row.createdAt : latest, '');
    if (lastNotice && now.getTime() - Date.parse(lastNotice) < QUIET_MINUTES * 60_000) {
      return Response.json({ avisos: 0, motivo: 'janela de silêncio', at: nowIso });
    }

    const alreadyWarned = new Set(recent.map((row) => {
      const rule = (() => { try { return (JSON.parse(row.details ?? '{}') as { rule?: string }).rule ?? ''; } catch { return ''; } })();
      return `${row.ticketKey}|${rule}`;
    }));

    const findings = agentFindings({ workflows, tickets, shipments, now })
      .filter((finding) => !alreadyWarned.has(`${finding.ticketKey}|${finding.rule}`))
      .slice(0, MAX_FINDINGS);

    if (!findings.length) return Response.json({ avisos: 0, destinatarios: 0, at: nowIso });
    if (!recipients.length) return Response.json({ avisos: 0, destinatarios: 0, motivo: 'ninguém para avisar', at: nowIso });

    const body = noticeMessage(await writeNotice(findings), findings);

    await db.insert(employeeMessages).values(recipients.map((user) => ({
      senderEmail: SYSTEM_SENDER, recipientEmail: user.email, body, createdAt: nowIso,
    })));
    // Auditoria por chamado: é ela que evita repetir o aviso amanhã cedo e o
    // que prova, depois, que o agente avisou (WORKFLOW_RULES, regra 11).
    await db.insert(operationalAudit).values(findings.map((finding) => ({
      ticketKey: finding.ticketKey,
      action: AGENT_ACTION,
      actorEmail: SYSTEM_SENDER,
      details: JSON.stringify({ origin: 'agente', rule: finding.rule, severity: finding.severity, reason: finding.detail }),
      createdAt: nowIso,
    })));

    return Response.json({ avisos: findings.length, destinatarios: recipients.length, at: nowIso });
  } catch (error) {
    return Response.json({ error: 'Falha na rodada do agente.', detail: String(error).slice(0, 200) }, { status: 500 });
  }
}
