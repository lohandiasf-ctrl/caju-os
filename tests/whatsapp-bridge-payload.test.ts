import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBridgeGroups, parseBridgeMessage } from '../lib/whatsapp-bridge-payload.ts';

const NOW = '2026-09-15T12:00:00.000Z';

test('direct message names the conversation after the contact', () => {
  const message = parseBridgeMessage({ wamid: 'W1', contactPhone: '5573999999999@s.whatsapp.net', contactName: ' Ana ', body: 'oi' }, NOW);
  assert.equal(message?.conversationName, 'Ana');
  assert.equal(message?.ticketKeys, null);
  assert.equal(message?.direction, 'incoming');
  assert.equal(message?.messageType, 'text');
  assert.equal(message?.occurredAt, NOW);
});

test('group message keeps the sender apart from the group name and links its FSAs', () => {
  const message = parseBridgeMessage({
    wamid: 'W2', contactPhone: '1203630@g.us', contactName: 'Lana Melo', senderJid: '5573888@s.whatsapp.net',
    conversationName: 'AMERICANAS L252 (FSA-132030 | 132034)', direction: 'incoming', messageType: 'image', mediaId: 'M1',
  }, NOW);
  assert.equal(message?.contactName, 'Lana Melo');
  assert.equal(message?.conversationName, 'AMERICANAS L252 (FSA-132030 | 132034)');
  assert.equal(message?.ticketKeys, 'FSA-132030,FSA-132034');
  assert.equal(message?.senderJid, '5573888@s.whatsapp.net');
});

test('group message without a subject never takes the sender name', () => {
  const message = parseBridgeMessage({ wamid: 'W3', contactPhone: '1203630@g.us', contactName: 'Lana Melo' }, NOW);
  assert.equal(message?.conversationName, null);
  assert.equal(message?.ticketKeys, null);
});

test('message without wamid or contact is rejected', () => {
  assert.equal(parseBridgeMessage({ contactPhone: '1@g.us' }, NOW), null);
  assert.equal(parseBridgeMessage({ wamid: 'W4' }, NOW), null);
});

test('group sync keeps only group JIDs and links FSAs from each subject', () => {
  const groups = parseBridgeGroups({ type: 'groups', groups: [
    { jid: '1@g.us', subject: 'FSA-1 loja', createdAt: '2026-09-01T10:00:00.000Z' },
    { jid: '2@g.us', subject: 'Suporte', createdAt: 'ontem' },
    { jid: '5573@s.whatsapp.net', subject: 'FSA-9' },
    null,
  ] });
  assert.deepEqual(groups, [
    { jid: '1@g.us', name: 'FSA-1 loja', ticketKeys: 'FSA-1', createdAt: '2026-09-01T10:00:00.000Z' },
    { jid: '2@g.us', name: 'Suporte', ticketKeys: null, createdAt: null },
  ]);
  assert.deepEqual(parseBridgeGroups({ groups: [] }), []);
});
