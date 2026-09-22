import { env } from 'cloudflare:workers';
import type { ToolSchema } from '@/lib/assistant-tools';

// Assistente geral no Workers AI. O binding ja pertence ao Worker, por isso
// nao exige chave, cartao ou outro provedor para funcionar dentro da franquia
// gratuita da Cloudflare. O modelo continua podendo apenas CONSULTAR as
// ferramentas; qualquer escrita fica no fluxo de confirmacao da interface.
const MODEL = '@cf/zai-org/glm-4.7-flash';
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
    const raw = await run(ai, {
      messages,
      ...(last ? {} : { tools, tool_choice: 'auto' }),
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      // Nunca guardar os textos operacionais enviados ao modelo para avaliacao
      // ou destilacao na Cloudflare.
      store: false,
    });
    const response = readResponse(raw);
    if (!response.calls.length || last) {
      if (response.text) return { answer: response.text, model: MODEL, used };
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

async function run(ai: Runner, input: unknown): Promise<unknown> {
  try {
    return await ai.run(MODEL, input);
  } catch (error) {
    const detail = String(error);
    if (/429|limit|quota|neurons/i.test(detail)) {
      throw new WorkersAiError('A franquia gratuita diária do assistente foi atingida. Tente novamente amanhã.', 429, 'cota');
    }
    console.error('Workers AI do assistente geral', error);
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
