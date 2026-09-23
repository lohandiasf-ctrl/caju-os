import test from 'node:test';
import assert from 'node:assert/strict';
import { authorFullName, ticketUpdateComment, ticketUpdateError } from '../lib/ticket-update.ts';

test('a nota precisa dizer algo e ter tamanho razoável', () => {
  assert.match(ticketUpdateError('') ?? '', /pelo menos 5/);
  assert.match(ticketUpdateError('   ok  ') ?? '', /pelo menos 5/);
  assert.equal(ticketUpdateError('Técnico adoeceu, reagendar.'), null);
  assert.match(ticketUpdateError('a'.repeat(2001)) ?? '', /2000/);
});

test('assinatura usa só nome e sobrenome do perfil', () => {
  assert.equal(authorFullName('  Lohan   Dias '), 'Lohan Dias');
  assert.equal(authorFullName('Maria da Silva'), 'Maria da Silva');
  assert.equal(authorFullName('Lohan'), null);
  assert.equal(authorFullName(null), null);
  assert.equal(authorFullName(''), null);
});

test('comentário leva a nota e, embaixo, quem escreveu — sem e-mail', () => {
  const comment = ticketUpdateComment('  Técnico adoeceu; reagendar para amanhã.  ', 'Lohan Dias');
  assert.equal(comment, 'Técnico adoeceu; reagendar para amanhã.\n\n— Lohan Dias');
  assert.doesNotMatch(comment, /@/);
});
