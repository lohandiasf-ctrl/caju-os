import test from 'node:test';
import assert from 'node:assert/strict';
import { pickModel, type ModelInfo } from '../lib/gemini-models.ts';

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
