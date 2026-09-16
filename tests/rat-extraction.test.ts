import { strict as assert } from 'node:assert';
import test from 'node:test';
import { hasContent, parseExtraction, toBase64 } from '../lib/rat-extraction.ts';

// Shapes observed running the real models against a RAT photo.
test('lê JSON dentro de markdown, como o mistral-small responde', () => {
  const raw = '```json\n{\n  "identifiedProblem": "Monitor esta com a tela escura",\n  "testsPerformed": "Mancha escura na parte inferior",\n  "partToReplace": "Monitor",\n  "confidence": "media"\n}\n```';
  const extraction = parseExtraction(raw);
  assert.equal(extraction?.identifiedProblem, 'Monitor esta com a tela escura');
  assert.equal(extraction?.partToReplace, 'Monitor');
  assert.equal(extraction?.confidence, 'media');
  assert.equal(hasContent(extraction!), true);
});

test('lê o objeto já pronto, como o llama-4-scout responde', () => {
  const extraction = parseExtraction({ identifiedProblem: 'Tela escura', testsPerformed: '', partToReplace: 'Monitor', confidence: 'alta' });
  assert.equal(extraction?.identifiedProblem, 'Tela escura');
  assert.equal(extraction?.confidence, 'alta');
});

test('prosa sem JSON não vale como leitura — o próximo modelo tenta', () => {
  const raw = 'O formulário RAT contém as seguintes informações:\n\n* Defeito/Problema: Monitor está com a tela escura.';
  assert.equal(parseExtraction(raw), null);
});

test('confiança desconhecida vira baixa', () => {
  assert.equal(parseExtraction('{"identifiedProblem":"x","confidence":"altíssima"}')?.confidence, 'baixa');
});

test('JSON válido com os três campos vazios não conta como leitura', () => {
  const extraction = parseExtraction('{"identifiedProblem":"","testsPerformed":"","partToReplace":"","confidence":"baixa"}');
  assert.equal(hasContent(extraction!), false);
});

test('base64 aguenta imagem grande sem estourar a pilha', () => {
  const bytes = new Uint8Array(300_000).fill(65);
  assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'));
});
