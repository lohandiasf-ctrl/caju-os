import { env } from 'cloudflare:workers';
import { buildRequest, readCandidate, toolResultContent, type GeminiContent, type GeminiPayload } from '@/lib/gemini-protocol';
import type { ToolSchema } from '@/lib/assistant-tools';

// Cliente do Gemini por REST. Sem SDK: o runtime é Cloudflare Workers, e o
// projeto já fala com Jira, TrackingMore e WhatsApp por `fetch` — um SDK só
// traria dependência de Node para dentro do Worker.
//
// O que este módulo tem de diferente do assistente da fila: **chamada de
// função**. O modelo não recebe uma lista pronta; ele pede o que precisa
// (`consultar_chamados`, `detalhar_chamado`...), este arquivo executa e
// devolve. É isso que deixa a pergunta ser qualquer uma.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Ordem de preferência. Nome de modelo muda com o tempo e o plano gratuito não
// cobre todos; 404 aqui não é erro, é "tente o próximo".
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

// Teto de idas e voltas com o modelo. Cada rodada é uma consulta ao sistema;
// sem teto, uma pergunta ruim consome a cota do dia.
const MAX_ROUNDS = 5;

export class GeminiError extends Error {
  status: number;
  // `sem_chave` deixa a tela distinguir "ainda não configurado" de "falhou":
  // no primeiro caso ela volta para o assistente da fila em vez de mostrar
  // erro para quem perguntou.
  code: 'sem_chave' | 'cota' | 'falha';
  constructor(message: string, status = 503, code: 'sem_chave' | 'cota' | 'falha' = 'falha') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiKey(): string {
  const key = (env as unknown as { GEMINI_API_KEY?: string }).GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiError('O assistente geral não está configurado: falta a chave do Gemini.', 503, 'sem_chave');
  return key;
}

function models(): string[] {
  const chosen = (env as unknown as { GEMINI_MODEL?: string }).GEMINI_MODEL?.trim();
  return chosen ? [chosen, ...MODELS.filter((model) => model !== chosen)] : MODELS;
}

async function callModel(model: string, body: unknown): Promise<GeminiPayload> {
  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as GeminiPayload | null;
  if (response.ok && payload) return payload;
  // 429 é a cota do plano gratuito. Vira mensagem que a tela sabe mostrar, não
  // um 500 genérico: quem perguntou precisa saber que é cota e que adianta
  // tentar mais tarde.
  if (response.status === 429) {
    throw new GeminiError('O assistente atingiu o limite de perguntas do plano gratuito do Gemini. Tente de novo mais tarde.', 429, 'cota');
  }
  const detail = payload?.error?.message ?? `HTTP ${response.status}`;
  throw new GeminiError(detail, response.status === 404 ? 404 : 502);
}

export type AskResult = { answer: string; model: string; used: string[] };

// `runTool` recebe o nome e os argumentos que o modelo pediu e devolve o dado.
// Erro de ferramenta não derruba a pergunta: vira um resultado com `erro`, e o
// modelo explica que aquele dado não veio.
export async function askGemini(options: {
  systemInstruction: string;
  question: string;
  tools: ToolSchema[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxRounds?: number;
}): Promise<AskResult> {
  const declarations = options.tools.map((tool) => ({
    name: tool.name, description: tool.description, parameters: tool.parameters,
  }));

  let lastNotFound: GeminiError | null = null;
  for (const model of models()) {
    const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: options.question }] }];
    const used: string[] = [];
    try {
      for (let round = 0; round < (options.maxRounds ?? MAX_ROUNDS); round += 1) {
        const payload = await callModel(model, buildRequest({ systemInstruction: options.systemInstruction, contents, declarations }));
        const { text, calls } = readCandidate(payload);
        if (!calls.length) {
          if (text) return { answer: text, model, used };
          throw new GeminiError('O assistente não conseguiu responder agora.', 503);
        }
        contents.push({ role: 'model', parts: calls.map((call) => ({ functionCall: call })) });
        const results = [];
        for (const call of calls) {
          used.push(call.name);
          const data = await options.runTool(call.name, call.args)
            .catch((error) => ({ erro: String(error).slice(0, 200) }));
          results.push({ name: call.name, data });
        }
        contents.push(toolResultContent(results));
      }
      throw new GeminiError('O assistente consultou o sistema várias vezes e não chegou a uma resposta. Tente perguntar de forma mais específica.', 504);
    } catch (error) {
      // Modelo que não existe nesta chave: tenta o próximo da lista.
      if (error instanceof GeminiError && error.status === 404) { lastNotFound = error; continue; }
      throw error;
    }
  }
  throw lastNotFound ?? new GeminiError('Nenhum modelo do Gemini está disponível.', 503);
}
