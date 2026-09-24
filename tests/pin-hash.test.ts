import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePinHash, isValidPin, randomHex, timingSafeEqualHex } from '../lib/server/pin-hash.ts';

// PBKDF2 real é lento de propósito; usa poucas iterações aqui só para o teste
// não pesar — a rota de verdade usa PIN_HASH_ITERATIONS (lib/server/pin-hash.ts).
const FAST_ITERATIONS = 10;

test('PIN válido é sempre 4 dígitos', () => {
  assert.equal(isValidPin('1234'), true);
  assert.equal(isValidPin('12a4'), false);
  assert.equal(isValidPin('12345'), false);
});

test('randomHex nunca repete e tem o tamanho pedido', () => {
  const a = randomHex(16);
  const b = randomHex(16);
  assert.equal(a.length, 32);
  assert.match(a, /^[0-9a-f]+$/);
  assert.notEqual(a, b);
});

test('mesmo segredo+PIN+salt sempre derivam o mesmo hash', async () => {
  const salt = randomHex(16);
  const first = await derivePinHash('segredo-do-aparelho', '1234', salt, FAST_ITERATIONS);
  const second = await derivePinHash('segredo-do-aparelho', '1234', salt, FAST_ITERATIONS);
  assert.equal(first, second);
});

test('PIN sozinho não abre nada sem o deviceSecret certo', async () => {
  const salt = randomHex(16);
  const withRealDevice = await derivePinHash('segredo-do-aparelho-roubado', '1234', salt, FAST_ITERATIONS);
  const withGuessedDevice = await derivePinHash('outro-segredo-qualquer', '1234', salt, FAST_ITERATIONS);
  assert.notEqual(withRealDevice, withGuessedDevice);
});

test('PIN, salt ou aparelho diferentes derivam hashes diferentes', async () => {
  const salt = randomHex(16);
  const base = await derivePinHash('aparelho', '1234', salt, FAST_ITERATIONS);
  assert.notEqual(base, await derivePinHash('aparelho', '4321', salt, FAST_ITERATIONS));
  assert.notEqual(base, await derivePinHash('outro-aparelho', '1234', salt, FAST_ITERATIONS));
  assert.notEqual(base, await derivePinHash('aparelho', '1234', randomHex(16), FAST_ITERATIONS));
});

test('comparação em tempo constante confere o valor, não só o formato', () => {
  assert.equal(timingSafeEqualHex('abcd', 'abcd'), true);
  assert.equal(timingSafeEqualHex('abcd', 'abce'), false);
  assert.equal(timingSafeEqualHex('abcd', 'abcde'), false);
  assert.equal(timingSafeEqualHex('', ''), true);
});
