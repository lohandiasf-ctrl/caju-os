import assert from 'node:assert/strict';
import test from 'node:test';
import { cityWithUf } from '../lib/jira-city.ts';

const select = (city: string, uf: string) => ({ value: city, child: { value: uf } });

test('o select Cidade / UF vale mais que o texto livre', () => {
  // FSA-133833: o texto trazia o nome da rua.
  assert.equal(cityWithUf('Gandu', select('Jaboatão dos Guararapes', 'PE')), 'Jaboatão dos Guararapes - PE');
});

test('sem select, vale o texto; com UF no texto, não repete', () => {
  assert.equal(cityWithUf('Itabuna', null), 'Itabuna');
  assert.equal(cityWithUf('Itabuna - BA', select('Itabuna', 'BA')), 'Itabuna - BA');
  assert.equal(cityWithUf(null, select('Itabuna', 'BA')), 'Itabuna - BA');
  assert.equal(cityWithUf(null, null), null);
});
