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

// A fila de tentativas, com um modelo de cada porte.
//
// A primeira versão pegava os três primeiros da ordem, e em produção isso deu
// `gemini-3.8-flash, gemini-3.7-flash, gemini-3.6-flash`: três versões do
// mesmo modelo. Quando o flash está lotado, todas as versões dele estão — as
// duas tentativas extras só custaram espera. Cair para um porte diferente
// (lite, pro) tem chance de verdade, porque a cota do plano gratuito é por
// modelo.
export function fallbackQueue(models: ModelInfo[], limit = 3): string[] {
  const ranked = sameGeneration(rankModels(models));
  const queue: string[] = [];
  const taken = new Set<number>();
  for (const name of ranked) {
    const tier = rank(name);
    if (taken.has(tier)) continue;
    taken.add(tier);
    queue.push(name);
    if (queue.length === limit) return queue;
  }
  // Sobrou espaço: completa com os melhores que ficaram de fora, para não
  // desistir com uma fila de um só quando a chave tem um porte apenas.
  for (const name of ranked) {
    if (queue.includes(name)) continue;
    queue.push(name);
    if (queue.length === limit) break;
  }
  return queue;
}

// Geração anterior sai da fila quando há uma atual.
//
// O catálogo listava `gemini-2.5-pro` ao lado dos `gemini-3.x`, e ele responde
// 404 com "no longer available to new users". Como era o único `pro`, entrava
// na fila como terceira tentativa e a pergunta gastava 102 segundos para
// terminar em erro. Modelo de geração passada está a caminho da porta.
function sameGeneration(names: string[]): string[] {
  const major = (name: string) => Math.floor(version(name) / 100);
  const newest = Math.max(0, ...names.map(major));
  const atuais = names.filter((name) => major(name) === newest);
  // Se a conta não achar geração nenhuma, a fila original vale mais do que
  // uma fila vazia.
  return atuais.length ? atuais : names;
}
