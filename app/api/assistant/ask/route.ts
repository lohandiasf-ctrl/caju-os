import { operationDate, previousOperationDate, validQuestion } from '@/lib/assistant';
import { cleanHistory, systemInstruction, TOOL_SCHEMAS } from '@/lib/assistant-tools';
import { runAssistantTool } from '@/lib/server/assistant-data';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { askGemini, GeminiError } from '@/lib/server/gemini';
import { isJiraConfigured, JiraError } from '@/lib/server/jira';
import { enforceRateLimit } from '@/lib/server/rate-limit';

// Assistente geral. Diferente de `/api/assistant` (que responde sobre uma fila
// já carregada), aqui a pergunta pode ser qualquer uma: o modelo consulta o
// sistema pelas ferramentas de `lib/assistant-tools.ts` até saber responder.
//
// SOMENTE LEITURA. Nenhuma ferramenta escreve no Jira ou no banco.
export async function POST(request: Request) {
  try {
    // Mesmo alcance do assistente da fila: quem opera, usa.
    await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    // Uma pergunta gasta várias chamadas ao Gemini (uma por rodada de
    // consulta), e o plano gratuito tem cota por minuto. Limite curto aqui
    // evita queimar a cota de todo mundo num clique repetido.
    enforceRateLimit(request, 'assistant-ask', { limit: 8, windowMs: 60_000 });

    if (!isJiraConfigured()) {
      return Response.json({ error: 'A integração do Jira não está configurada.' }, { status: 503 });
    }
    const body = await request.json().catch(() => null) as { question?: string; history?: unknown } | null;
    if (!validQuestion(body?.question)) {
      return Response.json({ error: 'Escreva a pergunta (de 3 a 400 caracteres).' }, { status: 400 });
    }

    const now = new Date();
    const { answer, model, used } = await askGemini({
      systemInstruction: systemInstruction(operationDate(now), previousOperationDate(now)),
      question: body!.question!.trim(),
      history: cleanHistory(body?.history),
      tools: TOOL_SCHEMAS,
      runTool: runAssistantTool,
    });
    // `used` diz quais consultas o modelo fez — é o que permite conferir uma
    // resposta estranha sem ter que reproduzir a pergunta.
    return Response.json({ answer, model, used });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof GeminiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Assistente geral', error);
    return Response.json({ error: 'Não foi possível consultar o assistente.' }, { status: 500 });
  }
}
