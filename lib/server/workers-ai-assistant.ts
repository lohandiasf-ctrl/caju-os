import { env } from 'cloudflare:workers';
import type { ToolSchema } from '@/lib/assistant-tools';

// Assistente geral no Workers AI. O binding ja pertence ao Worker, por isso
// nao exige chave, cartao ou outro provedor para funcionar dentro da franquia
// gratuita da Cloudflare. O modelo continua podendo apenas CONSULTAR as
// ferramentas; qualquer escrita fica no fluxo de confirmacao da interface.
// Modelos suportados no Workers AI com suporte a chamadas de ferramentas.
// O primário é o GLM-4.7-Flash (rápido, com capacidade de raciocínio).
// Em caso de instabilidade transitória do endpoint primário (500/503),
// o sistema recorre ao modelo de contingência.
// Nota: Erro de cota (429) NUNCA chaveia para outro modelo, mantendo a
// regra estrita de não estourar a franquia ou gerar custos adicionais.
const MODELS = [
  '@cf/zai-org/glm-4.7-flash',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
] as const;
const MAX_ROUNDS = 5;
const MAX_OUTPUT_TOKENS = 900;

type Runner = { run: (model: string, input: unknown) => Promise<unknown> };

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export class WorkersAiError extends Error {
  constructor(
    message: string,
    public status = 503,
    public code: 'indisponivel' | 'cota' | 'falha' = 'falha',
  ) {
    super(message);
  }
}

export type AskResult = { answer: string; model: string; used: string[] };

export async function askWorkersAi(options: {
  systemInstruction: string;
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  tools: ToolSchema[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxRounds?: number;
}): Promise<AskResult> {
  const ai = (env as unknown as { AI?: Runner }).AI;
  if (!ai) {
    throw new WorkersAiError('O assistente gratuito da Cloudflare não está configurado neste ambiente.', 503, 'indisponivel');
  }

  let lastError: Error | null = null;
  for (const model of MODELS) {
    try {
      return await askWithModel(ai, model, options);
    } catch (error) {
      if (error instanceof WorkersAiError && error.code === 'cota') {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Assistente geral: modelo ${model} falhou, tentando contingência...`, error);
    }
  }

  if (lastError instanceof WorkersAiError) throw lastError;
  throw new WorkersAiError(lastError?.message || 'O assistente não conseguiu responder agora.', 503);
}

async function askWithModel(
  ai: Runner,
  model: string,
  options: {
    systemInstruction: string;
    question: string;
    history?: Array<{ role: 'user' | 'assistant'; text: string }>;
    tools: ToolSchema[];
    runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    maxRounds?: number;
  },
): Promise<AskResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: options.systemInstruction },
    ...(options.history ?? []).map((turn) => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: options.question },
  ];
  const tools = options.tools.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
  const used: string[] = [];
  const rounds = options.maxRounds ?? MAX_ROUNDS;

  for (let round = 0; round < rounds; round += 1) {
    const last = round === rounds - 1;
    const raw = await run(ai, model, {
      messages,
      ...(last ? {} : { tools, tool_choice: 'auto' }),
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      // Nunca guardar os textos operacionais enviados ao modelo para avaliação
      // ou destilação na Cloudflare.
      store: false,
    });
    const response = readResponse(raw);
    if (!response.calls.length || last) {
      if (response.text) return { answer: response.text, model, used };
      throw new WorkersAiError('O assistente não conseguiu responder agora.', 503);
    }

    messages.push({
      role: 'assistant',
      content: response.text || null,
      tool_calls: response.calls,
    });
    for (const call of response.calls) {
      used.push(call.function.name);
      const result = await options.runTool(call.function.name, parseArguments(call.function.arguments))
        .catch((error) => ({ erro: String(error).slice(0, 200) }));
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  throw new WorkersAiError('O assistente não conseguiu responder agora.', 503);
}

async function run(ai: Runner, model: string, input: unknown): Promise<unknown> {
  try {
    return await ai.run(model, input);
  } catch (error) {
    const detail = String(error);
    if (/429|limit|quota|neurons/i.test(detail)) {
      throw new WorkersAiError('A franquia gratuita diária do assistente foi atingida. Tente novamente amanhã.', 429, 'cota');
    }
    console.error(`Workers AI do assistente geral (${model})`, error);
    throw new WorkersAiError('O assistente gratuito da Cloudflare não está disponível agora. Tente novamente em instantes.', 503, 'indisponivel');
  }
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readResponse(raw: unknown): { text: string; calls: ToolCall[] } {
  if (!raw || typeof raw !== 'object') return { text: '', calls: [] };
  const payload = raw as {
    choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>;
    response?: unknown;
    result?: { response?: unknown };
  };
  const message = payload.choices?.[0]?.message;
  const text = typeof message?.content === 'string'
    ? message.content.trim()
    : typeof payload.response === 'string'
      ? payload.response.trim()
      : typeof payload.result?.response === 'string'
        ? payload.result.response.trim()
        : '';
  const calls = Array.isArray(message?.tool_calls)
    ? message.tool_calls.flatMap((value) => validToolCall(value) ? [value] : [])
    : [];
  return { text, calls };
}

function validToolCall(value: unknown): value is ToolCall {
  if (!value || typeof value !== 'object') return false;
  const call = value as { id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } };
  return typeof call.function?.name === 'string' && typeof call.function.arguments === 'string'
    && typeof call.id === 'string' && call.id.length > 0 && (!call.type || call.type === 'function');
}
