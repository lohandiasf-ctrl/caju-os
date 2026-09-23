import test from 'node:test';
import assert from 'node:assert/strict';
import { emailInitials, forgetRememberedEmail, normalizeEmail, readRememberedEmail, rememberEmail, REMEMBERED_EMAIL_KEY } from '../lib/login-memory.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    data,
  };
}

test('lembra só e-mail válido, normalizado', () => {
  const storage = memoryStorage();
  rememberEmail(storage, '  Maria.Silva@CajuTech.net ');
  assert.equal(storage.data.get(REMEMBERED_EMAIL_KEY), 'maria.silva@cajutech.net');
  assert.equal(readRememberedEmail(storage), 'maria.silva@cajutech.net');
  rememberEmail(storage, 'não é e-mail');
  assert.equal(readRememberedEmail(storage), 'maria.silva@cajutech.net');
  forgetRememberedEmail(storage);
  assert.equal(readRememberedEmail(storage), '');
});

test('storage quebrado ou ausente não derruba o login', () => {
  const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(readRememberedEmail(broken), '');
  assert.doesNotThrow(() => rememberEmail(broken, 'a@b.co'));
  assert.doesNotThrow(() => forgetRememberedEmail(broken));
  assert.equal(readRememberedEmail(null), '');
  assert.equal(normalizeEmail('x@y'), '');
});

test('iniciais do avatar', () => {
  assert.equal(emailInitials('maria.silva@cajutech.net'), 'MS');
  assert.equal(emailInitials('joao@cajutech.net'), 'JO');
  assert.equal(emailInitials('@x.com'), '?');
});
