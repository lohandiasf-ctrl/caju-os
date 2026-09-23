import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { presenceMeta, presenceOf, presenceStatuses, presenceSummary, sortByPresence } from '../lib/presence.ts';

test('presence statuses match what /api/colleagues accepts', () => {
  const route = readFileSync(new URL('../app/api/colleagues/route.ts', import.meta.url), 'utf8');
  for (const status of presenceStatuses) assert.ok(route.includes(`'${status}'`), `API não aceita ${status}`);
});

test('every status has a shape, not only a color', () => {
  for (const status of presenceStatuses) {
    const meta = presenceMeta[status];
    assert.ok(meta.glyph, `${status} sem forma`);
  }
  // Online e offline precisam ser distinguíveis sem cor.
  assert.notEqual(presenceMeta.Online.glyph, presenceMeta.Offline.glyph);
  assert.notEqual(presenceMeta.Ocupado.glyph, presenceMeta.Ausente.glyph);
});

test('unknown or missing status reads as offline', () => {
  assert.equal(presenceOf(undefined).group, 'offline');
  assert.equal(presenceOf('Qualquer coisa').group, 'offline');
});

test('summary counts by group', () => {
  const summary = presenceSummary([
    { status: 'Online' }, { status: 'Online' }, { status: 'Ocupado' }, { status: 'Não perturbe' },
    { status: 'Almoçando' }, { status: 'Pausa de 15 minutos' }, { status: 'Offline' },
  ]);
  assert.deepEqual(summary, { available: 2, busy: 2, away: 2, offline: 1 });
});

test('sort puts available people first, then by name, without mutating input', () => {
  const people = [
    { email: 'z@caju', displayName: 'Zé', status: 'Offline' },
    { email: 'b@caju', displayName: 'Bia', status: 'Ausente' },
    { email: 'c@caju', displayName: 'Caio', status: 'Online' },
    { email: 'a@caju', displayName: 'Ana', status: 'Online' },
    { email: 'd@caju', displayName: null, status: 'Ocupado' },
  ];
  const copy = [...people];
  assert.deepEqual(sortByPresence(people).map((person) => person.email), ['a@caju', 'c@caju', 'd@caju', 'b@caju', 'z@caju']);
  assert.deepEqual(people, copy);
});
