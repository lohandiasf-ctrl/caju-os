import { env } from 'cloudflare:workers';
import {
  buildMessages, parseAnswer, queueContext, ticketContext, ticketKeysIn, validQuestion,
  type AssistantTask,
} from '@/lib/assistant';
import { toAssistantIssue } from '@/lib/server/assistant-issue';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, isJiraConfigured, searchJiraIssues, JiraError } from '@/lib/server/jira';
import { enforceRateLimit } from '@/lib/server/rate-limit';

// Assistente de chamados. Somente leitura: lê o Jira, responde em texto, nunca
// escreve. Usa o Workers AI (binding `AI`), o mesmo da leitura da RAT.
//
// Modelos em ordem de preferência; o primeiro que responder texto vence. O
// fallback existe porque um modelo pode estar indisponível no momento — a
// resposta é conveniência e nunca deve derrubar a tela.
const MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
];
const TASKS: AssistantTask[] = ['summary', 'next_step', 'queue'];
const QUEUE_SIZE = 60;
// Teto para as FSAs citadas na pergunta (a pergunta tem 400 caracteres).
const ASKED_LIMIT = 30;

type Runner = { run: (model: string, input: unknown) => Promise<unknown> };

export async function POST(request: Request) {
  try {
    // Mesmo alcance das telas de chamado: quem opera, usa.
    await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    // O modelo custa; limite por IP evita rajada acidental (e clique repetido).
    enforceRateLimit(request, 'assistant', { limit: 20, windowMs: 60_000 });

    if (!isJiraConfigured()) {
      return Response.json({ error: 'A integração do Jira não está configurada.' }, { status: 503 });
    }
    const body = await request.json().catch(() => null) as { task?: string; ticketKey?: string; question?: string; status?: string; query?: string } | null;
    const task = body?.task as AssistantTask;
    if (!TASKS.includes(task)) {
      return Response.json({ error: 'Tarefa inválida.' }, { status: 400 });
    }

    let context: string;
    if (task === 'queue') {
      if (!validQuestion(body?.question)) {
        return Response.json({ error: 'Escreva a pergunta (de 3 a 400 caracteres).' }, { status: 400 });
      }
      // A fila é relida no servidor: o contexto do modelo nunca vem do cliente.
      // As FSAs citadas na pergunta são buscadas à parte, porque podem estar
      // fora da fila (outro status, ou além dos mais recentes).
      const asked = ticketKeysIn(body.question, ASKED_LIMIT);
      const [queue, named] = await Promise.all([
        searchJiraIssues({ status: body?.status, query: body?.query, maxResults: QUEUE_SIZE, withAttachments: true }),
        asked.length
          ? searchJiraIssues({ keys: asked, maxResults: asked.length, withAttachments: true }).then((result) => result.issues).catch(() => [])
          : Promise.resolve([]),
      ]);
      const issues = [...named, ...queue.issues.filter((issue) => !named.some((item) => item.key === issue.key))];
      if (!issues.length) {
        return Response.json({ error: 'Nenhum chamado na fila para consultar.' }, { status: 404 });
      }
      // Os chamados citados vêm primeiro e nunca entram no corte da fila.
      context = queueContext(issues, QUEUE_SIZE + named.length);
    } else {
      if (typeof body?.ticketKey !== 'string' || !body.ticketKey.trim()) {
        return Response.json({ error: 'Informe o chamado.' }, { status: 400 });
      }
      context = ticketContext(toAssistantIssue(await getJiraIssue(body.ticketKey)));
    }

    const ai = (env as unknown as { AI?: Runner }).AI;
    if (!ai) {
      return Response.json({ error: 'O assistente não está disponível neste ambiente.' }, { status: 503 });
    }
    const messages = buildMessages(task, context, body?.question);
    for (const model of MODELS) {
      let raw: unknown;
      try {
        raw = await ai.run(model, { messages, max_tokens: 700, temperature: 0.2 });
      } catch (aiError) {
        console.error(`Assistente falhou em ${model}`, aiError);
        continue;
      }
      const answer = parseAnswer(raw);
      if (answer) return Response.json({ answer, model });
    }
    return Response.json({ error: 'O assistente não conseguiu responder agora. Tente de novo em instantes.' }, { status: 503 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Assistente', error);
    return Response.json({ error: 'Não foi possível consultar o assistente.' }, { status: 500 });
  }
}
