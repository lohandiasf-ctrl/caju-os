import assert from 'node:assert/strict';
import test from 'node:test';
import { changeParticipants, parseBridgeGroups, parseBridgeMessage, parseBridgeMessageEvent, ticketEvidenceKind } from '../lib/whatsapp-bridge-payload.ts';

test('conversation takes at most two participants; the second moves up when the first leaves', () => {
  assert.deepEqual(changeParticipants(null, 'Ana@Caju.net', 'join'), { participants: ['ana@caju.net'] });
  assert.deepEqual(changeParticipants('ana@caju.net', 'bia@caju.net', 'join'), { participants: ['ana@caju.net', 'bia@caju.net'] });
  assert.deepEqual(changeParticipants('ana@caju.net,bia@caju.net', 'ana@caju.net', 'join'), { participants: ['ana@caju.net', 'bia@caju.net'] });
  assert.deepEqual(changeParticipants('ana@caju.net,bia@caju.net', 'caio@caju.net', 'join'), { error: 'Esta conversa já tem dois participantes.' });
  assert.deepEqual(changeParticipants('ana@caju.net,bia@caju.net', 'ana@caju.net', 'leave'), { participants: ['bia@caju.net'] });
});

test('WhatsApp file maps to the N1 evidence kind it can count as', () => {
  assert.equal(ticketEvidenceKind('evidence', 'image/jpeg'), 'photo');
  assert.equal(ticketEvidenceKind('evidence', 'video/mp4'), 'video');
  assert.equal(ticketEvidenceKind('evidence', 'application/pdf'), null);
  assert.equal(ticketEvidenceKind('rat', 'application/pdf'), 'rat');
  assert.equal(ticketEvidenceKind('rat', 'image/jpeg'), 'rat');
  assert.equal(ticketEvidenceKind('rat', 'video/mp4'), null);
});

test('reply keeps the quoted preview, capped at 500 characters', () => {
  const message = parseBridgeMessage({ wamid: 'W9', contactPhone: '1@g.us', quotedWamid: 'W8', quotedBody: 'x'.repeat(600), quotedName: 'Piter' }, '2026-09-15T12:00:00.000Z');
  assert.equal(message?.quotedWamid, 'W8');
  assert.equal(message?.quotedBody?.length, 500);
  assert.equal(message?.quotedName, 'Piter');
});

test('delete and edit events need the target message; edit needs text', () => {
  assert.deepEqual(parseBridgeMessageEvent({ type: 'revoke', contactPhone: '1@g.us', wamid: 'W1' }), { type: 'revoke', contactPhone: '1@g.us', wamid: 'W1' });
  assert.deepEqual(parseBridgeMessageEvent({ type: 'edit', contactPhone: '1@g.us', wamid: 'W1', body: ' novo ' }), { type: 'edit', contactPhone: '1@g.us', wamid: 'W1', body: 'novo' });
  assert.equal(parseBridgeMessageEvent({ type: 'edit', contactPhone: '1@g.us', wamid: 'W1', body: '' }), null);
  assert.equal(parseBridgeMessageEvent({ type: 'revoke', contactPhone: '1@g.us' }), null);
});

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
