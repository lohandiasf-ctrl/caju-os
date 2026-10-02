import assert from 'node:assert/strict';
import test from 'node:test';
import { cityAndUf, foldCity, summarize } from '../lib/management-summary.ts';

const now = new Date(2026, 9, 2, 10, 0);
const iso = (d: number, h = 9) => new Date(2026, 9, d, h, 0).toISOString();

test('cidade e UF', () => {
  assert.deepEqual(cityAndUf('Itabuna - BA'), { city: 'Itabuna', uf: 'BA' });
  assert.deepEqual(cityAndUf('Patos de Minas/MG'), { city: 'Patos de Minas', uf: 'MG' });
  assert.deepEqual(cityAndUf('Gandu'), { city: 'Gandu', uf: null });
});

test('hoje, próximos dias, pendentes e cidades sem técnico', () => {
  const tickets = [
    { id: 'A', status: 'Agendado', city: 'Recife - PE', scheduledAt: iso(2), technician: 'X' },
    { id: 'B', status: 'Agendado', city: 'Recife - PE', scheduledAt: iso(5), technician: 'X' },
    { id: 'C', status: 'Agendado', city: 'Recife - PE', scheduledAt: iso(20), technician: 'X' },
    { id: 'D', status: 'Pendente de agendamento', city: 'Gandu - BA' },
    { id: 'E', status: 'Pendente de agendamento', city: 'Gandu - BA' },
    { id: 'F', status: 'Pendente de agendamento', city: 'Recife - PE', technician: 'Y' },
  ];
  const cities = new Set([foldCity('Recife')]);
  const all = summarize(tickets, cities, now, null);
  assert.equal(all.today, 1); assert.equal(all.nextDays, 1); assert.equal(all.pending, 3); assert.equal(all.unassigned, 2);
  assert.deepEqual(all.uncoveredCities, [{ city: 'Gandu', uf: 'BA', tickets: 2 }]);
  assert.deepEqual(all.ufs, ['BA', 'PE']);
  const pe = summarize(tickets, cities, now, 'PE');
  assert.equal(pe.pending, 1); assert.deepEqual(pe.uncoveredCities, []);
});
