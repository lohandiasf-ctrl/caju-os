import { operationDate, previousOperationDate, validQuestion } from '@/lib/assistant';
import { cleanHistory, systemInstruction, toolsFor } from '@/lib/assistant-tools';
import { assistantToolRunner } from '@/lib/server/assistant-data';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { canUseWhatsapp } from '@/lib/navigation';
import { askWorkersAi, WorkersAiError } from '@/lib/server/workers-ai-assistant';
import { isJiraConfigured, JiraError } from '@/lib/server/jira';
import { enforceRateLimit } from '@/lib/server/rate-limit';

// Ação que a tela deve abrir depois da resposta. O servidor não executa nada:
// quem agenda é a pessoa, no diálogo de sempre, escolhendo o técnico.
type PreparedAction =
  | { tipo: 'agendar'; chamados: string[]; quando: string }
  | { tipo: 'whatsapp'; contato: string; nome: string; texto: string };

// Assistente geral. Diferente de `/api/assistant` (que responde sobre uma fila
// já carregada), aqui a pergunta pode ser qualquer uma: o modelo consulta o
// sistema pelas ferramentas de `lib/assistant-tools.ts` até saber responder.
//
// SOMENTE LEITURA. Nenhuma ferramenta escreve no Jira ou no banco.
export async function POST(request: Request) {
  try {
    // Mesmo alcance do assistente da fila: quem opera, usa.
    const person = await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    // Uma pergunta pode consultar varias ferramentas. Limite curto aqui
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
    const run = assistantToolRunner({ canReadWhatsapp: canUseWhatsapp(person.role) });
    let prepared: PreparedAction | null = null;
    const { answer, model, used } = await askWorkersAi({
      systemInstruction: systemInstruction(operationDate(now), previousOperationDate(now)),
      question: body!.question!.trim(),
      history: cleanHistory(body?.history),
      // Conversa de WhatsApp só para quem já a vê na tela.
      tools: toolsFor(canUseWhatsapp(person.role)),
      runTool: async (name, args) => {
        const result = await run(name, args);
        // A ação preparada volta à tela num campo próprio: é ela que abre o
        // diálogo de agendamento já preenchido. O texto do modelo continua
        // sendo só texto.
        const acao = (result as { acao?: unknown } | null)?.acao;
        if ((name === 'preparar_agendamento' || name === 'preparar_mensagem_whatsapp') && acao) prepared = acao as PreparedAction;
        return result;
      },
    });
    // `used` diz quais consultas o modelo fez — é o que permite conferir uma
    // resposta estranha sem ter que reproduzir a pergunta.
    return Response.json({ answer, model, used, prepared });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof WorkersAiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Assistente geral', error);
    return Response.json({ error: 'Não foi possível consultar o assistente.' }, { status: 500 });
  }
}
