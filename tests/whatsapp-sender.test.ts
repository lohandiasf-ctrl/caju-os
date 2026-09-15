import assert from 'node:assert/strict';
import test from 'node:test';
import { signWhatsappText, whatsappSenderLabel } from '../lib/whatsapp-sender.ts';

test('sender label is first name and role label', () => {
  assert.equal(whatsappSenderLabel('lohan@cajutech.net', 'Lohan Dias', 'Gerência'), 'Lohan · Gerência');
});

test('sender label falls back to the email name and omits a missing role', () => {
  assert.equal(whatsappSenderLabel('maria.silva@cajutech.net', null, null), 'maria.silva');
  assert.equal(whatsappSenderLabel('ana@cajutech.net', '  Ana  Souza ', undefined), 'Ana');
});

test('signed text puts the bold label on its own first line', () => {
  assert.equal(signWhatsappText('Lohan · Gerência', 'Olá'), '*Lohan · Gerência*\nOlá');
  assert.equal(signWhatsappText('Lohan · Gerência', ''), '*Lohan · Gerência*');
});
