import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyActivity, deltaPercent, parseSnapshotStore, percent, rollSnapshot, slaOnTimePercent, statusCounts,
} from '../lib/dashboard-metrics.ts';
import { parseTicketDate } from '../lib/ticket-activities.ts';

const tickets = [
  { id: 'FSA-1', status: 'Técnico em campo', technician: 'Ana', updatedAt: '2026-09-20T12:00:00', scheduledAt: '2026-09-20T09:00:00' },
  { id: 'FSA-2', status: 'Agendado', technician: ' ', updatedAt: '2026-09-21T12:00:00', scheduledAt: '22/09/2026 10:00', partnerTriggeredAtRaw: '2026-09-21T15:00:00' },
  { id: 'FSA-3', status: 'Pendente de agendamento', updatedAt: '2026-09-21T08:00:00' },
  { id: 'FSA-4', status: 'Aguardando spare', technician: 'Paulo', updatedAt: 'data inválida' },
];

test('contagens por status e cobertura de técnico', () => {
  assert.deepEqual(statusCounts(tickets), { open: 4, inField: 1, scheduled: 1, pendingSchedule: 1, awaitingSpare: 1, withTechnician: 2 });
  assert.equal(percent(2, 4), 50);
  assert.equal(percent(1, 0), null);
});

test('SLA no prazo só existe com fluxo ativo', () => {
  assert.equal(slaOnTimePercent({ active: 40, overdue: 3 }), 93);
  assert.equal(slaOnTimePercent({ active: 0, overdue: 0 }), null);
  assert.equal(slaOnTimePercent(null), null);
  assert.equal(slaOnTimePercent({ active: 2, overdue: 5 }), 0);
});

test('atividade diária conta chamados distintos por dia e ignora datas fora da janela', () => {
  const days = dailyActivity(tickets, new Date(2026, 8, 20), 3, parseTicketDate);
  assert.deepEqual(days.map(({ scheduled, triggered, moved }) => ({ scheduled, triggered, moved })), [
    { scheduled: 1, triggered: 0, moved: 1 },
    { scheduled: 0, triggered: 1, moved: 2 },
    { scheduled: 1, triggered: 0, moved: 1 },
  ]);
  assert.equal(days.length, 3);
});

test('retrato diário: mesmo dia sobrescreve, dia novo empurra o anterior', () => {
  const first = rollSnapshot(null, '2026-9-21', { open: 10 });
  assert.equal(first.previous, undefined);
  const sameDay = rollSnapshot(first, '2026-9-21', { open: 12 });
  assert.deepEqual(sameDay.current, { day: '2026-9-21', values: { open: 12 } });
  const nextDay = rollSnapshot(sameDay, '2026-9-22', { open: 15 });
  assert.deepEqual(nextDay.previous, { day: '2026-9-21', values: { open: 12 } });
  assert.equal(deltaPercent(15, nextDay.previous?.values.open), 25);
});

test('variação sem base não inventa número', () => {
  assert.equal(deltaPercent(5, undefined), null);
  assert.equal(deltaPercent(5, 0), null);
  assert.equal(deltaPercent(0, 0), 0);
  assert.equal(deltaPercent(8, 10), -20);
  assert.equal(parseSnapshotStore('{quebrado'), null);
  assert.equal(parseSnapshotStore(null), null);
});
