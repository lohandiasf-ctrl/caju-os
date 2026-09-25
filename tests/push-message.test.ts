import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, chunk, clip, deadTokens, inQuietHours, isExpoPushToken } from '../lib/push-message.ts';

test('aceita só token do serviço de push do Expo', () => {
  assert.equal(isExpoPushToken('ExponentPushToken[abc123-XYZ_9]'), true);
  assert.equal(isExpoPushToken('ExpoPushToken[abc123]'), true);
  assert.equal(isExpoPushToken(' ExponentPushToken[abc] '), true);
  assert.equal(isExpoPushToken('fcm-token-cru'), false);
  assert.equal(isExpoPushToken('ExponentPushToken[]'), false);
  assert.equal(isExpoPushToken(undefined), false);
});

test('lotes de até 100 mensagens', () => {
  const items = Array.from({ length: 250 }, (_, i) => i);
  assert.deepEqual(chunk(items).map((b) => b.length), [100, 100, 50]);
  assert.deepEqual(chunk([]), []);
});

test('texto da notificação numa linha e cortado', () => {
  assert.equal(clip('  Técnico   chegou\n\nna loja  '), 'Técnico chegou na loja');
  const long = clip('a'.repeat(300));
  assert.equal(long.length, 180);
  assert.ok(long.endsWith('…'));
});

// 12:00 UTC = 09:00 em Brasília; 01:00 UTC = 22:00 do dia anterior em Brasília.
test('horário de silêncio em hora de Brasília, inclusive virando a noite', () => {
  const nineAm = new Date('2026-09-25T12:00:00Z');
  const tenPm = new Date('2026-09-26T01:00:00Z');
  assert.equal(inQuietHours(nineAm, '20:00', '07:00'), false);
  assert.equal(inQuietHours(tenPm, '20:00', '07:00'), true);
  assert.equal(inQuietHours(nineAm, '08:00', '12:00'), true);
  assert.equal(inQuietHours(tenPm, '08:00', '12:00'), false);
  assert.equal(inQuietHours(nineAm, '09:00', '09:00'), false);
  assert.equal(inQuietHours(nineAm, 'xx', '07:00'), false);
});

test('no silêncio chega sem som e com prioridade normal', () => {
  const [loud] = buildMessages(['ExpoPushToken[a]'], { title: 'Júlia', body: 'Oi', data: { kind: 'message' } }, false);
  const [quiet] = buildMessages(['ExpoPushToken[a]'], { title: 'Júlia', body: 'Oi' }, true);
  assert.equal(loud.sound, 'default');
  assert.equal(loud.priority, 'high');
  assert.deepEqual(loud.data, { kind: 'message' });
  assert.equal(quiet.sound, undefined);
  assert.equal(quiet.priority, 'normal');
  assert.equal(quiet.channelId, 'default');
});

test('título e corpo vazios ganham texto padrão', () => {
  const [m] = buildMessages(['ExpoPushToken[a]'], { title: '  ', body: '' }, false);
  assert.equal(m.title, 'Caju OS');
  assert.equal(m.body, 'Nova atividade no Caju OS');
});

test('aparelho não registrado é marcado para desativar, outros erros não', () => {
  const messages = buildMessages(['ExpoPushToken[a]', 'ExpoPushToken[b]', 'ExpoPushToken[c]'], { title: 't', body: 'b' }, false);
  const dead = deadTokens(messages, [
    { status: 'ok', id: '1' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', details: { error: 'MessageRateExceeded' } },
  ]);
  assert.deepEqual(dead, ['ExpoPushToken[b]']);
});
