import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_VISIT_CENTS, payoutCents } from '../lib/finance-rules.ts';

test('a primeira visita vale R$ 120', () => {
  assert.equal(FIRST_VISIT_CENTS, 12_000);
  assert.equal(payoutCents(1, 7_000), 12_000, 'uma visita paga só o valor base');
});

test('da segunda visita em diante vale a faixa configurada', () => {
  assert.equal(payoutCents(2, 7_000), 19_000);
  assert.equal(payoutCents(3, 5_000), 22_000);
});

test('sem visita não há repasse', () => {
  assert.equal(payoutCents(0, 7_000), 0);
  assert.equal(payoutCents(-2, 7_000), 0);
});

// O valor base não depende do que a gerência configurar para as demais.
test('a faixa adicional não mexe na primeira visita', () => {
  assert.equal(payoutCents(1, 0), FIRST_VISIT_CENTS);
  assert.equal(payoutCents(1, 99_999), FIRST_VISIT_CENTS);
});
