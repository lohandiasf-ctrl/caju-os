import { env } from 'cloudflare:workers';
import { fallbackQueue, type ModelInfo } from '@/lib/gemini-models';
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
let catalog: { expiresAt: number; models: string[] } | null = null;
// Quantos modelos vale tentar numa pergunta. Mais que isso e a espera de quem
// perguntou fica pior do que o erro.
const MAX_MODELS = 3;

// Teto de idas e voltas com o modelo. Cada rodada é uma consulta ao sistema;
// sem teto, uma pergunta ruim consome a cota do dia.
const MAX_ROUNDS = 5;
// O Cloudflare corta a requisição em 100 segundos e devolve 524 — foi o que
// aconteceu com a pergunta de cobertura. Antes disso, o loop para de consultar
// e pede a resposta com o que já tem: melhor uma resposta parcial do que um
// erro de infraestrutura.
const TIME_BUDGET_MS = 70_000;
// Modelo lotado volta a funcionar logo, e tirá-lo da fila por muito tempo é
// pior do que tentar de novo: com 5 minutos de castigo, uma lotação passageira
// no flash-lite empurrou a fila até um `pro` que o catálogo lista mas não
// atende ("no longer available to new users") — e a pergunta gastou 102
// segundos para terminar em 404.
const BUSY_MS = 60_000;
// Modelo que não existe para esta chave não volta: fica fora enquanto o
// catálogo durar.
const GONE_MS = CATALOG_TTL_MS;
const unavailable = new Map<string, number>();

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

// Os modelos a tentar, em ordem: o que o secret mandar, ou o que a API oferecer.
async function resolveModels(): Promise<string[]> {
  const forced = (env as unknown as { GEMINI_MODEL?: string }).GEMINI_MODEL?.trim();
  if (forced) return [forced];
  if (catalog && catalog.expiresAt > Date.now()) return catalog.models;

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey())}&pageSize=200`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => null) as { models?: ModelInfo[]; error?: { message?: string } } | null;
  if (!response.ok || !payload?.models) {
    throw new GeminiError(payload?.error?.message ?? `Não foi possível listar os modelos do Gemini (HTTP ${response.status}).`, response.status === 429 ? 429 : 502, response.status === 429 ? 'cota' : 'falha');
  }
  const models = fallbackQueue(payload.models, MAX_MODELS);
  if (!models.length) {
    throw new GeminiError('Nenhum modelo do Gemini disponível nesta chave serve para responder perguntas.', 503);
  }
  catalog = { expiresAt: Date.now() + CATALOG_TTL_MS, models };
  return models;
}

// Erro que vale tentar em outro modelo: o nome não existe (404), o modelo está
// lotado (503 "high demand") ou a cota dele acabou (429, que no plano gratuito
// é por modelo).
function worthRetrying(error: unknown): boolean {
  return error instanceof GeminiError && [404, 429, 503].includes(error.status);
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
  // 503 é o "This model is currently experiencing high demand" do Google.
  // Precisa chegar como 503 para valer a tentativa no modelo seguinte.
  if (response.status === 503) throw new GeminiError(detail, 503);
  throw new GeminiError(detail, response.status === 404 ? 404 : 502);
}

export type AskResult = { answer: string; model: string; used: string[] };

// `runTool` recebe o nome e os argumentos que o modelo pediu e devolve o dado.
// Erro de ferramenta não derruba a pergunta: vira um resultado com `erro`, e o
// modelo explica que aquele dado não veio.
export async function askGemini(options: {
  systemInstruction: string;
  question: string;
  // Conversa anterior, para a pergunta de seguimento ("e desses, quais são de
  // Itabuna?") fazer sentido. Vem do cliente; as consultas ao sistema continuam
  // acontecendo no servidor, então o pior que um histórico adulterado causa é
  // uma resposta ruim, não acesso a dado que a pessoa não teria.
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  tools: ToolSchema[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxRounds?: number;
}): Promise<AskResult> {
  const declarations = options.tools.map((tool) => ({
    name: tool.name, description: tool.description, parameters: tool.parameters,
  }));

  const started = Date.now();
  const all = await resolveModels();
  // Um modelo anotado como lotado sai da frente da fila, mas continua na
  // reserva: se todos estiverem anotados, ainda vale tentar.
  const fresh = all.filter((model) => (unavailable.get(model) ?? 0) < Date.now());
  const models = fresh.length ? fresh : all;
  let last: unknown = null;
  for (const model of models) {
    try {
      return await converse(model, options, declarations, started);
    } catch (error) {
      if (!worthRetrying(error)) throw error;
      if (error instanceof GeminiError) {
        // 404 é definitivo para esta chave; 429 e 503 são do momento.
        unavailable.set(model, Date.now() + (error.status === 404 ? GONE_MS : BUSY_MS));
        if (error.status === 404) catalog = null;
      }
      last = error;
      // Sem tempo para mais um modelo: cada tentativa custa uma ida ao Gemini,
      // e passar de 100 segundos vira 524 antes de qualquer resposta.
      if (Date.now() - started > TIME_BUDGET_MS) break;
    }
  }
  if (last instanceof GeminiError) {
    // Todos ocupados é o caso comum do plano gratuito, e a mensagem precisa
    // dizer isso — não repetir o texto do Google sobre um modelo só.
    if (last.status !== 404) {
      throw new GeminiError(`O assistente não conseguiu responder: os modelos disponíveis do Gemini (${models.join(', ')}) estão ocupados ou sem cota agora. Tente de novo em alguns minutos.`, last.status, last.code);
    }
    throw last;
  }
  throw new GeminiError('Nenhum modelo do Gemini está disponível.', 503);
}

async function converse(
  model: string,
  options: { systemInstruction: string; question: string; history?: Array<{ role: 'user' | 'assistant'; text: string }>; runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>; maxRounds?: number },
  declarations: Array<{ name: string; description: string; parameters: unknown }>,
  started = Date.now(),
): Promise<AskResult> {
  const contents: GeminiContent[] = [
    ...(options.history ?? []).map((turn): GeminiContent => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: [{ text: options.question }] },
  ];
  const used: string[] = [];
  const rounds = options.maxRounds ?? MAX_ROUNDS;
  for (let round = 0; round < rounds; round += 1) {
    // Na última rodada o modelo vai sem ferramentas: sem poder consultar de
    // novo, ele responde com o que já tem. Antes disso, "quais caíram hoje
    // após as 15h?" gastava as cinco rodadas e terminava em erro, sem
    // devolver nada do que já havia consultado.
    //
    // O tempo gasto também encerra as consultas: o Cloudflare corta em 100s.
    const last = round === rounds - 1 || Date.now() - started > TIME_BUDGET_MS;
    const payload = await callModel(model, buildRequest({ systemInstruction: options.systemInstruction, contents, declarations: last ? [] : declarations }));
    const { text, calls, parts } = readCandidate(payload);
    if (!calls.length || last) {
      if (text) return { answer: text, model, used };
      throw new GeminiError('O assistente não conseguiu responder agora.', 503);
    }
    // O turno do modelo volta como veio: `thoughtSignature` viaja junto e a
    // API exige recebê-la de volta.
    contents.push({ role: 'model', parts });
    const results = [];
    for (const call of calls) {
      used.push(call.name);
      const data = await options.runTool(call.name, call.args)
        .catch((error) => ({ erro: String(error).slice(0, 200) }));
      results.push({ name: call.name, data });
    }
    contents.push(toolResultContent(results));
  }
  throw new GeminiError('O assistente não conseguiu responder agora.', 503);
}
