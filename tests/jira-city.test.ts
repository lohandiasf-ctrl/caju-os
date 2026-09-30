import assert from 'node:assert/strict';
import test from 'node:test';
import { cityWithUf } from '../lib/jira-city.ts';

const select = (city: string, uf: string) => ({ value: city, child: { value: uf } });

test('o texto da cidade vale; o select só completa a UF', () => {
  assert.equal(cityWithUf('Gandu', select('Jaboatão dos Guararapes', 'PE')), 'Gandu - PE');
});

test('sem select, vale o texto; com UF no texto, não repete', () => {
  assert.equal(cityWithUf('Itabuna', null), 'Itabuna');
  assert.equal(cityWithUf('Itabuna - BA', select('Itabuna', 'BA')), 'Itabuna - BA');
  assert.equal(cityWithUf(null, select('Itabuna', 'BA')), 'Itabuna - BA');
  assert.equal(cityWithUf(null, null), null);
});
