import assert from 'node:assert/strict';
import test from 'node:test';
import { cityTetragram, participantJid, splitCityUf, storeCode, whatsappGroupName } from '../lib/whatsapp-group-name.ts';

test('participants accept JIDs and Brazilian phones with or without 55', () => {
  assert.equal(participantJid('(73) 98818-1339'), '5573988181339@s.whatsapp.net');
  assert.equal(participantJid('+55 73 98818-1339'), '5573988181339@s.whatsapp.net');
  assert.equal(participantJid('209479127822392@lid'), '209479127822392@lid');
  assert.equal(participantJid('1234'), null);
  assert.equal(participantJid('abc@g.us'), null);
});

test('city becomes its first four consonants, keeping Ç', () => {
  assert.equal(cityTetragram('Camaçari'), 'CMÇR');
  assert.equal(cityTetragram('Salvador'), 'SLVD');
  // Fewer than four consonants: the vowels fill in, in the name's order.
  assert.equal(cityTetragram('Itabuna'), 'ITBN');
  assert.equal(cityTetragram('Rio'), 'RIO');
  assert.equal(cityTetragram('Ilhéus'), 'ILHS');
});

test('city and UF are split from the usual spellings', () => {
  assert.deepEqual(splitCityUf('Camaçari - BA'), { city: 'Camaçari', uf: 'BA' });
  assert.deepEqual(splitCityUf('Camaçari/BA'), { city: 'Camaçari', uf: 'BA' });
  assert.deepEqual(splitCityUf('Camaçari (ba)'), { city: 'Camaçari', uf: 'BA' });
  assert.deepEqual(splitCityUf('BA - Camaçari'), { city: 'Camaçari', uf: 'BA' });
  assert.deepEqual(splitCityUf('Governador Valadares'), { city: 'Governador Valadares', uf: null });
});

test('store label becomes the L code', () => {
  assert.equal(storeCode('Código da loja: L1608'), 'L1608');
  assert.equal(storeCode('Código da loja: 5053'), 'L5053');
  assert.equal(storeCode('Loja não informada'), null);
});

test('one ticket follows the operation pattern', () => {
  assert.equal(
    whatsappGroupName([{ id: 'FSA-132495', store: 'Código da loja: L1608', city: 'Camaçari - BA', scheduledAt: '2026-09-15T19:00:00.000Z' }]),
    '15/09- 16h - CMÇR/BA - AMERICANAS L1608 - (FSA-132495)',
  );
});

test('several tickets take the earliest schedule and write the FSA prefix once', () => {
  assert.equal(
    whatsappGroupName([
      { id: 'FSA-132034', store: 'Código da loja: L252', city: 'Camaçari/BA', scheduledAt: '2026-09-15T20:30:00.000Z' },
      { id: 'FSA-132030', store: 'Código da loja: L252', city: 'Camaçari/BA', scheduledAt: '2026-09-15T17:00:00.000Z' },
    ]),
    '15/09- 14h - CMÇR/BA - AMERICANAS L252 - (FSA-132030 | 132034)',
  );
});

test('missing schedule or city is left out instead of guessed', () => {
  assert.equal(whatsappGroupName([{ id: 'FSA-1', store: 'Código da loja: L10', city: 'Cidade não informada' }]), 'AMERICANAS L10 - (FSA-1)');
});
