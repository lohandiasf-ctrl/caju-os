import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTarget, kpiRowOf, pickRow, stageOf } from '../lib/kpi-history.ts';

test('etapas do Jira em qualquer formato', () => {
  assert.equal(stageOf('AGENDAMENTO'), 'pendingSchedule');
  assert.equal(stageOf('Agendado'), 'scheduled');
  assert.equal(stageOf('TEC-CAMPO'), 'inField');
  assert.equal(stageOf('Aguardando Spare'), 'awaitingSpare');
  assert.equal(stageOf('DIRECIONADO'), 'directed');
});

test('contagem do dia', () => {
  const row = kpiRowOf('2026-10-02', [{ status: 'AGENDAMENTO' }, { status: 'Agendado', technicianName: 'A' }, { status: 'TEC-CAMPO', technicianName: ' ' }]);
  assert.deepEqual(row, { day: '2026-10-02', open: 3, pendingSchedule: 1, scheduled: 1, directed: 0, awaitingSpare: 0, inField: 1, withTechnician: 1 });
});

test('dia de comparação', () => {
  const today = new Date(2026, 9, 30); // quarta-feira, 30/10... (mês 9 = outubro)
  assert.equal(compareTarget('yesterday', today), '2026-10-29');
  assert.equal(compareTarget('week', today), '2026-10-23');
  assert.equal(compareTarget('month', today), '2026-09-30');
  assert.equal(compareTarget('year', today), '2025-10-30');
  assert.equal(compareTarget('month', new Date(2026, 2, 31)), '2026-02-28', '31/03 → último dia de fevereiro');
  assert.equal(compareTarget('year', new Date(2028, 1, 29)), '2027-02-28', '29/02 → 28/02');
  assert.equal(compareTarget('date', today, new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(compareTarget('date', today, null), null);
});

test('retrato do dia ou o mais próximo até 3 dias antes', () => {
  const rows = [kpiRowOf('2026-10-28', []), kpiRowOf('2026-10-20', [])];
  assert.equal(pickRow(rows, '2026-10-28')?.day, '2026-10-28');
  assert.equal(pickRow(rows, '2026-10-30')?.day, '2026-10-28');
  assert.equal(pickRow(rows, '2026-10-24'), null);
  assert.equal(pickRow(rows, null), null);
});
