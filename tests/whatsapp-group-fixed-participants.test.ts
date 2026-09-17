import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFixedParticipants, withFixedParticipants } from '../lib/whatsapp-group-name.ts';
import { DEFAULT_WHATSAPP_GROUP_PHOTO, isWhatsappGroupPhoto } from '../lib/whatsapp-group-photos.ts';

test('fixed participants come from the JSON secret', () => {
  const fixed = parseFixedParticipants(JSON.stringify([
    { name: 'Pessoa Um', phone: '+55 81 7905-0000' },
    { name: '', phone: '(73) 98818-0000' },
    { name: 'Repetida', phone: '5581790500 00' },
    { name: 'Inválida', phone: '123' },
    { name: 'Sem telefone' },
    'lixo',
  ]));
  assert.deepEqual(fixed, [
    { jid: '558179050000@s.whatsapp.net', name: 'Pessoa Um' },
    { jid: '5573988180000@s.whatsapp.net', name: '+5573988180000' },
  ]);
});

test('a missing or malformed secret means no fixed participants', () => {
  assert.deepEqual(parseFixedParticipants(undefined), []);
  assert.deepEqual(parseFixedParticipants(''), []);
  assert.deepEqual(parseFixedParticipants('{not json'), []);
  assert.deepEqual(parseFixedParticipants('{"name":"x"}'), []);
});

test('fixed participants are always added, without duplicates', () => {
  const fixed = [{ jid: '558179050000@s.whatsapp.net', name: 'Pessoa Um' }];
  assert.deepEqual(withFixedParticipants([], fixed), ['558179050000@s.whatsapp.net']);
  assert.deepEqual(
    withFixedParticipants(['5573988180000@s.whatsapp.net', '558179050000@s.whatsapp.net'], fixed),
    ['558179050000@s.whatsapp.net', '5573988180000@s.whatsapp.net'],
  );
});

test('the default group photo is one of the shipped photos', () => {
  assert.equal(DEFAULT_WHATSAPP_GROUP_PHOTO, 'agendar-com-tecnico');
  assert.equal(isWhatsappGroupPhoto(DEFAULT_WHATSAPP_GROUP_PHOTO), true);
});
