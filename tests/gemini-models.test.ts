import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackQueue, pickModel, rankModels, type ModelInfo } from '../lib/gemini-models.ts';

const chat = (name: string): ModelInfo => ({ name, supportedGenerationMethods: ['generateContent', 'countTokens'] });

test('escolhe o flash estável mais novo', () => {
  assert.equal(pickModel([
    chat('models/gemini-2.0-flash'),
    chat('models/gemini-2.5-pro'),
    chat('models/gemini-2.5-flash'),
  ]), 'gemini-2.5-flash');
});

// O plano gratuito é o motivo de o projeto estar no Gemini, e flash cabe nele.
// `lite` é do mesmo plano, mas raciocina menos — e a queixa que originou o
// assistente era qualidade de resposta.
test('flash ganha de pro e de lite', () => {
  assert.equal(pickModel([chat('models/gemini-3-pro'), chat('models/gemini-2.5-flash')]), 'gemini-2.5-flash');
  assert.equal(pickModel([chat('models/gemini-2.5-flash-lite'), chat('models/gemini-2.5-flash')]), 'gemini-2.5-flash');
  assert.equal(pickModel([chat('models/gemini-2.5-flash-lite'), chat('models/gemini-2.5-pro')]), 'gemini-2.5-flash-lite', 'lite antes de pro');
});

test('pro só entra quando não há flash', () => {
  assert.equal(pickModel([chat('models/gemini-2.5-pro')]), 'gemini-2.5-pro');
});

// Prévia some sem aviso — foi assim que a lista fixa quebrou.
test('estável ganha de preview e de experimental', () => {
  assert.equal(pickModel([
    chat('models/gemini-2.5-flash-preview-09-2025'),
    chat('models/gemini-2.0-flash-exp'),
    chat('models/gemini-2.0-flash'),
  ]), 'gemini-2.0-flash');
});

test('entre dois estáveis parecidos, fica o nome mais curto', () => {
  assert.equal(pickModel([
    chat('models/gemini-2.5-flash-002'),
    chat('models/gemini-2.5-flash'),
  ]), 'gemini-2.5-flash');
});

test('modelo que não gera texto é descartado', () => {
  assert.equal(pickModel([
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['embedContent'] },
  ]), null, 'sem generateContent não serve, mesmo sendo gemini');
});

test('imagem, áudio, embedding e gemma ficam de fora', () => {
  for (const name of ['gemini-2.5-flash-image', 'gemini-2.5-flash-native-audio', 'gemini-embedding-001', 'gemma-3-27b-it', 'imagen-4.0-generate-001', 'veo-3.0-generate-001']) {
    assert.equal(pickModel([chat(`models/${name}`)]), null, name);
  }
});

test('catálogo vazio ou sem nada utilizável devolve nulo', () => {
  assert.equal(pickModel([]), null);
  assert.equal(pickModel([chat('models/aqa')]), null);
});

// Catálogo real do Gemini, para a escolha não depender de exemplo inventado.
test('num catálogo parecido com o real, sai um flash estável', () => {
  const chosen = pickModel([
    chat('models/gemini-2.0-flash'),
    chat('models/gemini-2.0-flash-001'),
    chat('models/gemini-2.0-flash-lite'),
    chat('models/gemini-2.5-flash'),
    chat('models/gemini-2.5-flash-lite'),
    chat('models/gemini-2.5-flash-preview-05-20'),
    chat('models/gemini-2.5-pro'),
    chat('models/gemini-2.5-flash-image'),
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
    chat('models/gemma-3-1b-it'),
  ]);
  assert.equal(chosen, 'gemini-2.5-flash');
});

// Um modelo pode estar lotado ("This model is currently experiencing high
// demand") ou sem cota. Nesse caso o cliente tenta o seguinte, então a escolha
// precisa devolver a fila inteira, não só o primeiro.
test('a fila de modelos sai inteira e em ordem', () => {
  const fila = rankModels([
    chat('models/gemini-2.5-pro'),
    chat('models/gemini-2.5-flash-lite'),
    chat('models/gemini-2.5-flash'),
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
  ]);
  assert.deepEqual(fila, ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);
  assert.equal(pickModel([chat('models/gemini-2.5-flash')]), fila[0] && 'gemini-2.5-flash');
});

test('sem nada utilizável a fila vem vazia', () => {
  assert.deepEqual(rankModels([chat('models/gemini-2.5-flash-image')]), []);
});

// Em produção a fila saiu `gemini-3.8-flash, gemini-3.7-flash,
// gemini-3.6-flash`: três versões do mesmo modelo. Flash lotado significa as
// três lotadas, então as tentativas extras só custaram espera.
test('a fila de tentativas pega um modelo de cada porte', () => {
  const fila = fallbackQueue([
    chat('models/gemini-3.8-flash'),
    chat('models/gemini-3.7-flash'),
    chat('models/gemini-3.6-flash'),
    chat('models/gemini-3.8-flash-lite'),
    chat('models/gemini-3.8-pro'),
  ]);
  assert.deepEqual(fila, ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.8-pro']);
});

test('com um porte só, a fila completa com as outras versões', () => {
  assert.deepEqual(fallbackQueue([
    chat('models/gemini-3.8-flash'),
    chat('models/gemini-3.7-flash'),
    chat('models/gemini-3.6-flash'),
  ]), ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
});

test('a fila respeita o teto e nunca repete', () => {
  const fila = fallbackQueue([chat('models/gemini-3.8-flash'), chat('models/gemini-3.8-flash-lite'), chat('models/gemini-3.8-pro')], 2);
  assert.equal(fila.length, 2);
  assert.equal(new Set(fila).size, 2);
  assert.deepEqual(fallbackQueue([]), []);
});

// O catálogo listava gemini-2.5-pro ao lado dos 3.x, e ele responde 404: "no
// longer available to new users". Como era o único `pro`, entrava na fila e a
// pergunta gastava 102 segundos para terminar em erro.
test('geração anterior fica fora da fila quando há uma atual', () => {
  const fila = fallbackQueue([
    chat('models/gemini-3.8-flash'),
    chat('models/gemini-3.5-flash-lite'),
    chat('models/gemini-2.5-pro'),
  ]);
  assert.deepEqual(fila, ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
});

test('só com geração antiga, ela ainda é usada', () => {
  assert.deepEqual(fallbackQueue([chat('models/gemini-2.5-pro'), chat('models/gemini-2.5-flash')]), ['gemini-2.5-flash', 'gemini-2.5-pro']);
});
