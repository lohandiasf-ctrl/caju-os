import assert from 'node:assert/strict';
import test from 'node:test';
import { noticeParts } from '../lib/notice-links.ts';

test('aviso de aceite vira chamado, loja e técnico clicáveis', () => {
  const parts = noticeParts('✅ FSA-133493, FSA-133491 (L158) aceito por Arthur Bruno de Oliveira pelo WhatsApp.');
  assert.deepEqual(parts.filter((p) => p.type !== 'text'), [
    { type: 'ticket', value: 'FSA-133493' }, { type: 'ticket', value: 'FSA-133491' },
    { type: 'store', value: 'L158' }, { type: 'technician', value: 'Arthur Bruno de Oliveira' },
  ]);
  assert.equal(parts.map((p) => p.value).join(''), '✅ FSA-133493, FSA-133491 (L158) aceito por Arthur Bruno de Oliveira pelo WhatsApp.');
});

test('texto sem nada clicável fica inteiro', () => {
  assert.deepEqual(noticeParts('Olá, equipe'), [{ type: 'text', value: 'Olá, equipe' }]);
  assert.deepEqual(noticeParts('⚠️ Ninguém aceitou FSA-100200 (L9) em 2 h.').filter((p) => p.type === 'technician'), []);
});
