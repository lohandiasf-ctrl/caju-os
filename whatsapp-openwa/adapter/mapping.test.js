import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeGroups, bridgeMessage, bridgeMessageEvent, connectionStatus, contactPhoneOf, jidFor, messageTypeOf, sendKind } from './mapping.js';

test('jid: número vira @c.us, jid conhecido fica, @s.whatsapp.net é convertido', () => {
  assert.equal(jidFor('+55 (81) 99173-8635'), '5581991738635@c.us');
  assert.equal(jidFor('5581991738635@s.whatsapp.net'), '5581991738635@c.us');
  assert.equal(jidFor('120363@g.us'), '120363@g.us');
  assert.equal(jidFor('abc'), null);
  assert.equal(jidFor(''), null);
});

test('contato guardado como o Caju OS espera: dígitos, grupos e lid inteiros', () => {
  assert.equal(contactPhoneOf('5581991738635@c.us'), '5581991738635');
  assert.equal(contactPhoneOf('120363@g.us'), '120363@g.us');
  assert.equal(contactPhoneOf('209479127822392@lid'), '209479127822392@lid');
});

test('status da conexão', () => {
  assert.equal(connectionStatus('ready'), 'open');
  assert.equal(connectionStatus('qr_ready'), 'qr');
  assert.equal(connectionStatus('initializing'), 'connecting');
  assert.equal(connectionStatus('disconnected'), 'logged_out');
});

test('mensagem recebida de uma pessoa', () => {
  const m = bridgeMessage('message.received', { id: '3EB0A', from: '5581991738635@c.us', to: '5581000@c.us', body: ' oi ', type: 'text', timestamp: 1790000000, isGroup: false, kind: 'individual', contact: { pushName: 'Fulano' }, quotedMessage: { id: 'Q1', body: 'antes' } });
  assert.equal(m.wamid, '3EB0A');
  assert.equal(m.contactPhone, '5581991738635');
  assert.equal(m.direction, 'incoming');
  assert.equal(m.messageType, 'text');
  assert.equal(m.body, 'oi');
  assert.equal(m.contactName, 'Fulano');
  assert.equal(m.conversationName, 'Fulano');
  assert.equal(m.quotedWamid, 'Q1');
  assert.equal(m.occurredAt, new Date(1790000000 * 1000).toISOString());
});

test('mensagem em grupo leva o nome do grupo e quem escreveu', () => {
  const m = bridgeMessage('message.received', { id: 'G1', chatId: '1203@g.us', from: '1203@g.us', author: '5581991738635@c.us', body: 'chegou', type: 'text', kind: 'group', contact: { pushName: 'Técnico' } }, { groupSubject: 'FSA-123 Loja Centro' });
  assert.equal(m.contactPhone, '1203@g.us');
  assert.equal(m.conversationName, 'FSA-123 Loja Centro');
  assert.equal(m.contactName, 'Técnico');
  assert.equal(m.senderJid, '5581991738635@c.us');
});

test('quem chega só por lid usa o telefone resolvido pelo OpenWA', () => {
  const m = bridgeMessage('message.received', { id: 'L1', from: '209479127822392@lid', body: 'oi', type: 'text', senderPhone: '5581991738635' });
  assert.equal(m.contactPhone, '5581991738635');
  const sem = bridgeMessage('message.received', { id: 'L2', from: '209479127822392@lid', body: 'oi', type: 'text' });
  assert.equal(sem.contactPhone, '209479127822392@lid');
});

test('eco do que o Caju OS enviou volta como saída', () => {
  const m = bridgeMessage('message.sent', { id: 'S1', from: '5581000@c.us', to: '5581991738635@c.us', body: 'ok', type: 'text', fromMe: true });
  assert.equal(m.direction, 'outgoing');
  assert.equal(m.contactPhone, '5581991738635');
  assert.equal(m.contactName, null);
});

test('ignora status, canal e tipos sem conteúdo', () => {
  assert.equal(bridgeMessage('message.received', { id: '1', from: 'status@broadcast', type: 'text', kind: 'status' }), null);
  assert.equal(bridgeMessage('message.received', { id: '1', from: '5581@c.us', type: 'poll' }), null);
  assert.equal(bridgeMessage('message.received', { from: '5581@c.us', type: 'text' }), null);
  assert.equal(messageTypeOf('voice'), 'audio');
});

test('apagada e editada', () => {
  assert.deepEqual(bridgeMessageEvent('message.revoked', { id: 'R', revokedId: 'ORIG', chatId: '5581@c.us' }), { type: 'revoke', contactPhone: '5581', wamid: 'ORIG' });
  assert.deepEqual(bridgeMessageEvent('message.edited', { messageId: 'M1', chatId: '5581@c.us', body: 'novo' }), { type: 'edit', contactPhone: '5581', wamid: 'M1', body: 'novo' });
  assert.equal(bridgeMessageEvent('message.edited', { messageId: 'M1', chatId: '5581@c.us', body: '' }), null);
});

test('lista de grupos', () => {
  const r = bridgeGroups({ data: [{ id: '1203@g.us', name: 'FSA-1 Loja', creation: 1790000000 }, { id: '5581@c.us', name: 'não é grupo' }] });
  assert.equal(r.type, 'groups');
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].subject, 'FSA-1 Loja');
});

test('tipo de envio de mídia', () => {
  assert.equal(sendKind('image/jpeg', false), 'image');
  assert.equal(sendKind('image/svg+xml', false), 'document');
  assert.equal(sendKind('video/mp4', false), 'video');
  assert.equal(sendKind('audio/webm', true), 'audio');
  assert.equal(sendKind('application/pdf', false), 'document');
});
