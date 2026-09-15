import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTicketKeys, ticketKeysFromGroupName } from '../lib/whatsapp-ticket-keys.ts';

test('group name yields every FSA it mentions, normalized and unique', () => {
  assert.deepEqual(ticketKeysFromGroupName('FSA-123 / fsa 124 · Loja Centro'), ['FSA-123', 'FSA-124']);
  assert.deepEqual(ticketKeysFromGroupName('Atendimento FSA123, FSA_0123 e FSA#77'), ['FSA-123', 'FSA-77']);
});

test('group name without FSA yields nothing', () => {
  assert.deepEqual(ticketKeysFromGroupName('Caju Tech | Suporte'), []);
  assert.deepEqual(ticketKeysFromGroupName('NFSA-12 CAFSA 9'), []);
  assert.deepEqual(ticketKeysFromGroupName(null), []);
});

test('stored ticket keys split into a clean list', () => {
  assert.deepEqual(splitTicketKeys('FSA-1, FSA-2,'), ['FSA-1', 'FSA-2']);
  assert.deepEqual(splitTicketKeys(null), []);
});
