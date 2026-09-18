import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ACCOUNT, isWhatsappAccount, toWhatsappAccount, WHATSAPP_ACCOUNTS, whatsappAccountLabel } from '../lib/whatsapp-accounts.ts';

test('as duas contas existem, e a principal é a que já havia', () => {
  assert.deepEqual(WHATSAPP_ACCOUNTS.map((account) => account.id), ['principal', 'caju']);
  assert.equal(DEFAULT_ACCOUNT, 'principal');
  assert.equal(whatsappAccountLabel('caju'), 'WhatsApp Caju');
});

// O que vem do cliente não pode virar erro de tela nem conta inventada.
test('conta desconhecida cai na principal', () => {
  assert.equal(toWhatsappAccount('caju'), 'caju');
  assert.equal(toWhatsappAccount('outra'), DEFAULT_ACCOUNT);
  assert.equal(toWhatsappAccount(undefined), DEFAULT_ACCOUNT);
  assert.equal(toWhatsappAccount(42), DEFAULT_ACCOUNT);
});

test('o reconhecedor não aceita qualquer texto', () => {
  assert.ok(isWhatsappAccount('principal'));
  assert.ok(!isWhatsappAccount('Principal'), 'o id é exato; o rótulo é outra coisa');
  assert.ok(!isWhatsappAccount(null));
});
