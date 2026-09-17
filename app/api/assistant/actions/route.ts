import { env } from 'cloudflare:workers';
import { buildMessages, parseAnswer, ticketContext, type AssistantIssue } from '@/lib/assistant';
import { ActionError, canAudit, extractActionBlock, parseAction, stripActionBlock } from '@/lib/assistant-actions';
import { listAudit, recordProposal } from '@/lib/server/assistant-actions';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, isJiraConfigured, JiraError } from '@/lib/server/jira';
import { enforceRateLimit } from '@/lib/server/rate-limit';

// Escrita assistida: o assistente PROPÕE, a pessoa confirma (em
// /api/assistant/actions/[id]), e tudo fica na auditoria.
const MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
];

const ACTION_PROMPT = `Além de responder, você pode PROPOR uma ação no Jira — nunca executá-la. Uma pessoa vai ler, conferir e confirmar.

Se e somente se houver uma ação claramente necessária, termine a resposta com um bloco JSON, sozinho, em cerca de markdown:
\`\`\`json
{"kind":"comment","body":"texto do comentário interno"}
\`\`\`
As únicas ações possíveis:
- {"kind":"comment","body":"..."} — comentário interno no chamado.
- {"kind":"transition","status":"scheduling|scheduled|operational_preparation|in_service|technical_pending|awaiting_spare"} — mudar a etapa.
- {"kind":"schedule","scheduledDateTime":"AAAA-MM-DDTHH:MM"} — definir data e hora do agendamento.

Se não houver ação evidente, não escreva bloco JSON nenhum. Nunca proponha fechar, validar, cancelar ou resolver um chamado.`;

type Runner = { run: (model: string, input: unknown) => Promise<unknown> };

// Propor uma ação a partir do chamado.
export async function POST(request: Request) {
  try {
    const current = await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    enforceRateLimit(request, 'assistant-action', { limit: 10, windowMs: 60_000 });
    if (!isJiraConfigured()) {
      return Response.json({ error: 'A integração do Jira não está configurada.' }, { status: 503 });
    }
    const body = await request.json().catch(() => null) as { ticketKey?: string } | null;
    if (typeof body?.ticketKey !== 'string' || !body.ticketKey.trim()) {
      return Response.json({ error: 'Informe o chamado.' }, { status: 400 });
    }

    const issue = await getJiraIssue(body.ticketKey);
    const messages = buildMessages('next_step', ticketContext(toAssistantIssue(issue)));
    messages[0].content += `\n\n${ACTION_PROMPT}`;

    const ai = (env as unknown as { AI?: Runner }).AI;
    if (!ai) return Response.json({ error: 'O assistente não está disponível neste ambiente.' }, { status: 503 });

    for (const model of MODELS) {
      let answer = '';
      try { answer = parseAnswer(await ai.run(model, { messages, max_tokens: 700, temperature: 0.2 })); }
      catch (aiError) { console.error(`Escrita assistida falhou em ${model}`, aiError); continue; }
      if (!answer) continue;

      const text = stripActionBlock(answer);
      const block = extractActionBlock(answer);
      if (!block) return Response.json({ answer: text, action: null });
      try {
        const action = parseAction(block, issue.key);
        const proposal = await recordProposal(action, current.email, 'assistant');
        return Response.json({ answer: text, action: { id: proposal.id, description: proposal.description, kind: action.kind, preview: action } });
      } catch (actionError) {
        // Proposta inválida não vira escrita: devolve o texto e avisa.
        if (actionError instanceof ActionError) {
          return Response.json({ answer: text, action: null, actionWarning: actionError.message });
        }
        throw actionError;
      }
    }
    return Response.json({ error: 'O assistente não conseguiu responder agora.' }, { status: 503 });
  } catch (error) {
    return errorResponse(error, 'Não foi possível propor a ação.');
  }
}

// Auditoria: só coordenação e gerência.
export async function GET(request: Request) {
  try {
    const current = await requireApiUser(request, ['gerencia', 'coordenador']);
    if (!canAudit(current.role)) {
      return Response.json({ error: 'A auditoria é restrita à coordenação e à gerência.' }, { status: 403 });
    }
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') ?? 30);
    const actions = await listAudit({
      days: Number.isFinite(days) ? Math.min(Math.max(days, 1), 180) : 30,
      ticketKey: url.searchParams.get('ticket')?.trim() || undefined,
    });
    return Response.json({ actions });
  } catch (error) {
    return errorResponse(error, 'Não foi possível carregar a auditoria.');
  }
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Response) return error;
  if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
  console.error(fallback, error);
  return Response.json({ error: fallback }, { status: 500 });
}

function toAssistantIssue(issue: Awaited<ReturnType<typeof getJiraIssue>>): AssistantIssue {
  return {
    key: issue.key, summary: issue.summary, status: issue.status, priority: issue.priority,
    store: issue.operationalFields.storeName ?? issue.store, city: issue.city,
    createdAt: issue.createdAt, scheduledAt: issue.operationalFields.scheduledDateTime ?? issue.scheduledAt,
    technicianName: issue.technicianName, description: issue.description,
    allegedDefect: issue.operationalFields.allegedDefect, problemCategory: issue.operationalFields.problemCategory,
    equipmentModel: issue.operationalFields.equipmentModel, defectSummary: issue.operationalFields.defectSummary,
    technicianData: issue.operationalFields.technicianData,
    internalComments: (issue.internalComments ?? []).map((comment) => ({ author: comment.author, createdAt: comment.createdAt, body: comment.body })),
  };
}
