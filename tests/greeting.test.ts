import test from 'node:test';
import assert from 'node:assert/strict';
import { brasiliaHour, firstName, greetingForHour } from '../lib/greeting.ts';

test('saudação muda às 5h, 12h e 18h', () => {
  assert.equal(greetingForHour(4), 'Boa noite');
  assert.equal(greetingForHour(5), 'Bom dia');
  assert.equal(greetingForHour(11), 'Bom dia');
  assert.equal(greetingForHour(12), 'Boa tarde');
  assert.equal(greetingForHour(17), 'Boa tarde');
  assert.equal(greetingForHour(18), 'Boa noite');
  assert.equal(greetingForHour(0), 'Boa noite');
});

test('hora é a de Brasília, não a do dispositivo', () => {
  assert.equal(brasiliaHour(new Date('2026-09-22T15:30:00Z')), 12);
  assert.equal(brasiliaHour(new Date('2026-09-22T02:00:00Z')), 23);
});

test('primeiro nome vem do nome de exibição ou do e-mail', () => {
  assert.equal(firstName('Ana Paula Souza', 'x@y.z'), 'Ana');
  assert.equal(firstName(null, 'maria.silva@cajutech.net'), 'Maria');
  assert.equal(firstName('', 'JOAO_P@cajutech.net'), 'Joao');
  assert.equal(firstName(null, '12345@cajutech.net'), '');
  assert.equal(firstName(null, null), '');
});
