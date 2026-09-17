import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CallbackError, canAnswer, isExpired, MAX_QUESTION, outgoingPayload,
  parseCallback, secretMatches, TIMEOUT_MS, validQuestion,
} from '../lib/rovo.ts';

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

test('a pergunta precisa ter tamanho de pergunta', () => {
  assert.equal(validQuestion('qual o status do FSA-10?'), true);
  assert.equal(validQuestion('  '), false);
  assert.equal(validQuestion('ab'), false);
  assert.equal(validQuestion('a'.repeat(MAX_QUESTION + 1)), false);
  assert.equal(validQuestion(42), false);
});

test('o payload que vai ao Jira leva o id, a pergunta e a volta', () => {
  const payload = outgoingPayload({ requestId: ID, question: '  e aí?  ', ticketKey: 'FSA-1', askedBy: 'ana@x.com', callbackUrl: 'https://app/api/rovo/callback' });
  assert.deepEqual(payload, { requestId: ID, question: 'e aí?', ticketKey: 'FSA-1', askedBy: 'ana@x.com', callbackUrl: 'https://app/api/rovo/callback' });
});

test('segredo errado, curto, longo ou ausente não abre a porta', () => {
  assert.equal(secretMatches('abc123', 'abc123'), true);
  assert.equal(secretMatches('abc124', 'abc123'), false);
  assert.equal(secretMatches('abc12', 'abc123'), false);
  assert.equal(secretMatches('abc1234', 'abc123'), false);
  assert.equal(secretMatches(null, 'abc123'), false);
  assert.equal(secretMatches('abc123', undefined), false);
  assert.equal(secretMatches('', ''), false);
});

test('callback válido é lido', () => {
  const result = parseCallback({ requestId: ID, answer: '  o técnico está a caminho  ' });
  assert.equal(result.requestId, ID);
  assert.equal(result.answer, 'o técnico está a caminho');
  assert.equal(result.action, null);
  assert.equal(result.failed, false);
});

test('callback sem id válido é recusado', () => {
  assert.throws(() => parseCallback({ requestId: 'FSA-1', answer: 'x' }), CallbackError);
  assert.throws(() => parseCallback({ answer: 'x' }), CallbackError);
  assert.throws(() => parseCallback(null), CallbackError);
  assert.throws(() => parseCallback('texto'), CallbackError);
});

test('resposta vazia só passa quando a regra avisa que falhou', () => {
  assert.throws(() => parseCallback({ requestId: ID, answer: '   ' }), CallbackError);
  assert.equal(parseCallback({ requestId: ID, answer: '', failed: true }).failed, true);
  assert.equal(parseCallback({ requestId: ID, answer: '', failed: 'true' }).failed, true);
});

test('resposta gigante é cortada', () => {
  const result = parseCallback({ requestId: ID, answer: 'a'.repeat(9000) });
  assert.equal(result.answer.length, 8000);
});

test('ação só é aceita como objeto', () => {
  assert.deepEqual(parseCallback({ requestId: ID, answer: 'x', action: { kind: 'comment' } }).action, { kind: 'comment' });
  assert.equal(parseCallback({ requestId: ID, answer: 'x', action: 'comment' }).action, null);
  assert.equal(parseCallback({ requestId: ID, answer: 'x', action: null }).action, null);
});

test('uma pergunta recebe resposta uma vez só', () => {
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  assert.equal(canAnswer('pending', createdAt, now).ok, true);
  assert.equal(canAnswer('answered', createdAt, now).ok, false);
  assert.equal(canAnswer('failed', createdAt, now).ok, false);
  assert.equal(canAnswer('expired', createdAt, now).ok, false);
});

test('resposta que chega tarde demais não é aceita', () => {
  const now = Date.now();
  const old = new Date(now - TIMEOUT_MS - 1).toISOString();
  assert.equal(canAnswer('pending', old, now).ok, false);
  assert.equal(isExpired('pending', old, now), true);
  assert.equal(isExpired('answered', old, now), false, 'já respondida não expira');
  assert.equal(isExpired('pending', new Date(now).toISOString(), now), false);
});
