import { env } from 'cloudflare:workers';
import { pickModel, type ModelInfo } from '@/lib/gemini-models';
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

// Nome de modelo não é chutado: a API é quem diz o que existe nesta chave.
// A primeira versão trazia uma lista escrita de cabeça e os três nomes deram
// 404 em produção. O catálogo é lido uma vez e guardado enquanto o isolate
// viver, como o cache do Jira.
const CATALOG_TTL_MS = 6 * 60 * 60_000;
let catalog: { expiresAt: number; model: string } | null = null;

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

// O modelo a usar: o que o secret mandar, ou o melhor que a API oferecer.
async function resolveModel(): Promise<string> {
  const forced = (env as unknown as { GEMINI_MODEL?: string }).GEMINI_MODEL?.trim();
  if (forced) return forced;
  if (catalog && catalog.expiresAt > Date.now()) return catalog.model;

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey())}&pageSize=200`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => null) as { models?: ModelInfo[]; error?: { message?: string } } | null;
  if (!response.ok || !payload?.models) {
    throw new GeminiError(payload?.error?.message ?? `Não foi possível listar os modelos do Gemini (HTTP ${response.status}).`, response.status === 429 ? 429 : 502, response.status === 429 ? 'cota' : 'falha');
  }
  const model = pickModel(payload.models);
  if (!model) {
    throw new GeminiError('Nenhum modelo do Gemini disponível nesta chave serve para responder perguntas.', 503);
  }
  catalog = { expiresAt: Date.now() + CATALOG_TTL_MS, model };
  return model;
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

  try {
    return await converse(await resolveModel(), options, declarations);
  } catch (error) {
    // Modelo guardado que saiu do ar no meio do caminho: joga fora o que estava
    // em cache e pergunta o catálogo de novo, uma vez só.
    if (error instanceof GeminiError && error.status === 404) {
      catalog = null;
      return converse(await resolveModel(), options, declarations);
    }
    throw error;
  }
}

async function converse(
  model: string,
  options: { systemInstruction: string; question: string; runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>; maxRounds?: number },
  declarations: Array<{ name: string; description: string; parameters: unknown }>,
): Promise<AskResult> {
  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: options.question }] }];
  const used: string[] = [];
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
}
