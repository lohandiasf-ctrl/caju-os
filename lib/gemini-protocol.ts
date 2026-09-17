// Formato da API do Gemini: como montar o pedido e como ler a resposta.
//
// Separado do cliente (`lib/server/gemini.ts`) porque aqui não há rede nem
// `cloudflare:workers` — então dá para testar em Node puro. É a parte em que
// um detalhe de formato passa despercebido: resposta que vem com texto e
// chamada de função juntos, resposta cortada por limite de tokens, parte sem
// argumentos.

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  error?: { message?: string; status?: string };
};

export type ToolCall = { name: string; args: Record<string, unknown> };

export function buildRequest(options: {
  systemInstruction: string;
  contents: GeminiContent[];
  declarations: Array<{ name: string; description: string; parameters: unknown }>;
}) {
  return {
    systemInstruction: { parts: [{ text: options.systemInstruction }] },
    contents: options.contents,
    ...(options.declarations.length ? { tools: [{ functionDeclarations: options.declarations }] } : {}),
    generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
  };
}

export function readCandidate(payload: GeminiPayload): { text: string; calls: ToolCall[]; finishReason: string } {
  const candidate = payload.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  return {
    text: parts.map((part) => ('text' in part ? part.text : '')).join('').trim(),
    // `args` vem ausente quando a função não tem parâmetro, e um objeto vazio
    // é mais fácil de tratar do que `undefined` em toda chamada.
    calls: parts.flatMap((part) => ('functionCall' in part ? [{ name: part.functionCall.name, args: part.functionCall.args ?? {} }] : [])),
    finishReason: candidate?.finishReason ?? '',
  };
}

// A resposta que devolve o resultado da consulta ao modelo. O Gemini espera
// isso com papel `user`, uma parte por função chamada.
export function toolResultContent(results: Array<{ name: string; data: unknown }>): GeminiContent {
  return {
    role: 'user',
    parts: results.map((result) => ({ functionResponse: { name: result.name, response: { resultado: result.data } } })),
  };
}
