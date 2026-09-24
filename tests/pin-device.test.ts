import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetPinDevice, generatePinDevice, isValidPin, markPinOffered, readPinDevice, savePinDevice, wasPinOffered } from '../lib/pin-device.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    data,
  };
}

test('PIN válido é sempre 4 dígitos', () => {
  assert.equal(isValidPin('1234'), true);
  assert.equal(isValidPin('0000'), true);
  assert.equal(isValidPin('123'), false);
  assert.equal(isValidPin('12345'), false);
  assert.equal(isValidPin('12a4'), false);
  assert.equal(isValidPin(''), false);
});

test('gera um par por aparelho, sem caracteres de base64 "cru"', () => {
  const device = generatePinDevice();
  assert.match(device.deviceId, /^[A-Za-z0-9_-]+$/);
  assert.match(device.deviceSecret, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(device.deviceId, device.deviceSecret);
  const other = generatePinDevice();
  assert.notEqual(device.deviceId, other.deviceId);
  assert.notEqual(device.deviceSecret, other.deviceSecret);
});

test('guarda e lê o par por e-mail, sem misturar contas', () => {
  const storage = memoryStorage();
  const device = generatePinDevice();
  savePinDevice(storage, 'Maria.Silva@CajuTech.net', device);
  assert.deepEqual(readPinDevice(storage, 'maria.silva@cajutech.net'), device);
  assert.equal(readPinDevice(storage, 'outra@cajutech.net'), null);
  forgetPinDevice(storage, 'maria.silva@cajutech.net');
  assert.equal(readPinDevice(storage, 'maria.silva@cajutech.net'), null);
});

test('lê null para storage vazio, quebrado ou dado corrompido', () => {
  const storage = memoryStorage();
  assert.equal(readPinDevice(storage, 'a@b.co'), null);
  storage.setItem('caju-pin-device:a@b.co', '{ inválido');
  assert.equal(readPinDevice(storage, 'a@b.co'), null);
  const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(readPinDevice(broken, 'a@b.co'), null);
  assert.doesNotThrow(() => savePinDevice(broken, 'a@b.co', generatePinDevice()));
  assert.doesNotThrow(() => forgetPinDevice(broken, 'a@b.co'));
});

test('oferta do PIN é lembrada por e-mail e não incomoda de novo', () => {
  const storage = memoryStorage();
  assert.equal(wasPinOffered(storage, 'a@b.co'), false);
  markPinOffered(storage, 'a@b.co');
  assert.equal(wasPinOffered(storage, 'a@b.co'), true);
  assert.equal(wasPinOffered(storage, 'outra@b.co'), false);
});
