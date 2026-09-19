import assert from 'node:assert/strict';
import test from 'node:test';
import { signWhatsappText, whatsappSenderLabel } from '../lib/whatsapp-sender.ts';

test('sender label is the first name alone, never the role', () => {
  assert.equal(whatsappSenderLabel('lohan@cajutech.net', 'Lohan Dias'), 'Lohan');
});

test('sender label falls back to the email name', () => {
  assert.equal(whatsappSenderLabel('maria.silva@cajutech.net', null), 'maria.silva');
  assert.equal(whatsappSenderLabel('ana@cajutech.net', '  Ana  Souza '), 'Ana');
});

test('signed text puts the bold label on its own first line', () => {
  assert.equal(signWhatsappText('Lohan', 'Olá'), '*Lohan*\nOlá');
  assert.equal(signWhatsappText('Lohan', ''), '*Lohan*');
});
