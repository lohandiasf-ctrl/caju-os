import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ActionError, canAudit, canConfirm, describeAction, EXPIRY_MS, extractActionBlock,
  isMissingTable, MAX_COMMENT_LENGTH, parseAction, stripActionBlock,
} from '../lib/assistant-actions.ts';

const KEY = 'FSA-1';

test('comentário proposto vira ação', () => {
  const action = parseAction({ kind: 'comment', body: '  técnico confirmou presença  ' }, KEY);
  assert.deepEqual(action, { kind: 'comment', ticketKey: KEY, body: 'técnico confirmou presença' });
});

test('comentário vazio ou gigante é recusado', () => {
  assert.throws(() => parseAction({ kind: 'comment', body: ' ' }, KEY), ActionError);
  assert.throws(() => parseAction({ kind: 'comment', body: 'a'.repeat(MAX_COMMENT_LENGTH + 1) }, KEY), ActionError);
});

test('só as etapas liberadas passam', () => {
  assert.equal(parseAction({ kind: 'transition', status: 'in_service' }, KEY).kind, 'transition');
  for (const status of ['resolved', 'cancelled', 'validated', 'awaiting_payment']) {
    assert.throws(() => parseAction({ kind: 'transition', status }, KEY), ActionError, `${status} não pode passar`);
  }
});

test('ação fora da lista fechada é recusada', () => {
  assert.throws(() => parseAction({ kind: 'delete_issue' }, KEY), ActionError);
  assert.throws(() => parseAction({ kind: 'comment' }, KEY), ActionError);
  assert.throws(() => parseAction(null, KEY), ActionError);
  assert.throws(() => parseAction('comment', KEY), ActionError);
});

test('o chamado vem do servidor, não do modelo', () => {
  const action = parseAction({ kind: 'comment', body: 'teste', ticketKey: 'FSA-999' }, KEY);
  assert.equal(action.ticketKey, KEY);
});

test('agendamento exige formato de data e hora', () => {
  assert.equal(parseAction({ kind: 'schedule', scheduledDateTime: '2026-09-20T14:30' }, KEY).kind, 'schedule');
  assert.throws(() => parseAction({ kind: 'schedule', scheduledDateTime: '20/09/2026 14:30' }, KEY), ActionError);
});

test('a descrição diz exatamente o que vai mudar', () => {
  assert.match(describeAction({ kind: 'transition', ticketKey: KEY, status: 'in_service' }), /FSA-1 para “Técnico em campo”/);
  assert.match(describeAction({ kind: 'schedule', ticketKey: KEY, scheduledDateTime: '2026-09-20T14:30' }), /20\/09\/2026 às 14:30/);
  assert.match(describeAction({ kind: 'comment', ticketKey: KEY, body: 'x' }), /comentário interno em FSA-1/);
});

test('o bloco JSON é extraído e retirado do texto lido pela pessoa', () => {
  const answer = 'Próximo passo: comentar no chamado.\n\n```json\n{"kind":"comment","body":"ligar para a loja"}\n```';
  assert.deepEqual(extractActionBlock(answer), { kind: 'comment', body: 'ligar para a loja' });
  assert.equal(stripActionBlock(answer), 'Próximo passo: comentar no chamado.');
});

test('resposta sem bloco não propõe escrita nenhuma', () => {
  assert.equal(extractActionBlock('Próximo passo: aguardar o técnico.'), null);
});

test('bloco quebrado não vira ação', () => {
  assert.equal(extractActionBlock('```json\n{"kind":"comment",\n```'), null);
});

test('uma proposta só pode ser confirmada uma vez', () => {
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  assert.equal(canConfirm('pending', createdAt, now).ok, true);
  assert.equal(canConfirm('applied', createdAt, now).ok, false);
  assert.equal(canConfirm('cancelled', createdAt, now).ok, false);
  assert.equal(canConfirm('failed', createdAt, now).ok, false);
});

test('proposta velha expira em vez de escrever num chamado que já mudou', () => {
  const now = Date.now();
  const old = new Date(now - EXPIRY_MS - 1000).toISOString();
  const result = canConfirm('pending', old, now);
  assert.equal(result.ok, false);
  assert.match(result.reason ?? '', /expirou/);
});

test('auditoria é da coordenação e da gerência', () => {
  assert.equal(canAudit('gerencia'), true);
  assert.equal(canAudit('coordenador'), true);
  assert.equal(canAudit('n1'), false);
  assert.equal(canAudit('analista'), false);
  assert.equal(canAudit(null), false);
});

// A migration roda separado do deploy; enquanto a tabela não existe, a escrita
// assistida avisa em vez de estourar 500.
test('erro de tabela ausente é reconhecido', () => {
  assert.equal(isMissingTable(new Error('D1_ERROR: no such table: assistant_actions')), true);
  assert.equal(isMissingTable(new Error('NO SUCH TABLE: x')), true);
  assert.equal(isMissingTable(new Error('UNIQUE constraint failed')), false);
  assert.equal(isMissingTable('no such table'), true);
});
