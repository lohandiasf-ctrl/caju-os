import test from 'node:test';
import assert from 'node:assert/strict';
import { clearIdleExpiredFlag, flagIdleExpired, IDLE_LIMIT_MS, isIdleExpired, markActivity, readLastActivity, wasIdleExpired } from '../lib/session-idle.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

const NOW = Date.parse('2026-09-24T18:00:00Z');

test('limite de inatividade é de 2 horas', () => {
  assert.equal(IDLE_LIMIT_MS, 2 * 60 * 60 * 1000);
});

test('sessão vence com 2 h sem uso e não antes', () => {
  assert.equal(isIdleExpired(NOW - IDLE_LIMIT_MS + 1_000, NOW), false);
  assert.equal(isIdleExpired(NOW - IDLE_LIMIT_MS, NOW), true);
  assert.equal(isIdleExpired(NOW - 3 * 60 * 60_000, NOW), true);
});

test('sem registro de uso não vence (primeiro acesso depois do deploy)', () => {
  assert.equal(isIdleExpired(null, NOW), false);
});

test('grava e lê o último uso; valor inválido vira nulo', () => {
  const storage = memoryStorage();
  assert.equal(readLastActivity(storage), null);
  markActivity(storage, NOW);
  assert.equal(readLastActivity(storage), NOW);
  storage.setItem('caju-last-activity', 'lixo');
  assert.equal(readLastActivity(storage), null);
  assert.equal(readLastActivity(null), null);
});

test('aviso de sessão vencida aparece até ser apagado', () => {
  const storage = memoryStorage();
  assert.equal(wasIdleExpired(storage), false);
  flagIdleExpired(storage);
  assert.equal(wasIdleExpired(storage), true);
  clearIdleExpiredFlag(storage);
  assert.equal(wasIdleExpired(storage), false);
});
