// Qual modelo do Gemini usar.
//
// A primeira versão trazia uma lista fixa de nomes escritos de cabeça, e os
// três deram 404 na chave real ("models/gemini-1.5-flash is not found for API
// version v1beta"). Nome de modelo envelhece, e o catálogo muda por chave.
// Então o código pergunta à API o que existe, em vez de apostar.
//
// Parte pura: a escolha a partir da lista. Quem busca é
// `lib/server/gemini.ts`.

export type ModelInfo = { name: string; supportedGenerationMethods?: string[] };

// Preferência, do mais desejável para o menos. `flash` ganha porque o plano
// gratuito o cobre e ele raciocina melhor que o `flash-lite` — e a queixa que
// originou este assistente era justamente qualidade de resposta. `lite` fica
// de reserva, e `pro` só se não houver flash nenhum.
// Dentro do mesmo posto, a versão maior ganha: 2.5 antes de 2.0.
const PREFERENCE = [/flash(?!-lite)/, /flash-lite/, /pro/];

function version(name: string): number {
  const found = name.match(/gemini-(\d+)\.(\d+)/);
  return found ? Number(found[1]) * 100 + Number(found[2]) : 0;
}

function rank(name: string): number {
  const found = PREFERENCE.findIndex((pattern) => pattern.test(name));
  return found === -1 ? PREFERENCE.length : found;
}

// Descarta o que não serve para conversar: modelo de imagem, de áudio, de
// embedding, e as variantes experimentais//thinking, que mudam sem aviso.
const UNUSABLE = /embedding|aqa|image|imagen|vision|tts|audio|native-audio|live|veo|learnlm|gemma/i;

// A lista inteira, em ordem de preferência. Plural porque um modelo pode estar
// indisponível na hora ("This model is currently experiencing high demand") ou
// com a cota estourada — e aí vale tentar o seguinte em vez de desistir.
export function rankModels(models: ModelInfo[]): string[] {
  const usable = models
    .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
    // `models/gemini-2.5-flash` → `gemini-2.5-flash`.
    .map((model) => model.name.replace(/^models\//, ''))
    .filter((name) => name.startsWith('gemini-') && !UNUSABLE.test(name))
    // Prévia e experimental só se não houver estável, porque somem sem aviso.
    .sort((a, b) => {
      const preview = Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b));
      if (preview) return preview;
      const preference = rank(a) - rank(b);
      if (preference) return preference;
      const newer = version(b) - version(a);
      if (newer) return newer;
      // Sem outro critério, o nome mais curto: `gemini-2.5-flash` ganha de
      // `gemini-2.5-flash-preview-09-2025`.
      return a.length - b.length;
    });
  return usable;
}

// O preferido, ou nulo quando nenhum serve.
export function pickModel(models: ModelInfo[]): string | null {
  return rankModels(models)[0] ?? null;
}
