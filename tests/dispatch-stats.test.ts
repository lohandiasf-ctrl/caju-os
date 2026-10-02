import assert from 'node:assert/strict';
import test from 'node:test';
import { technicianStats } from '../lib/dispatch-stats.ts';

const row = (technicianId: number, status: string, over: Partial<{ assignedTechnicianId: number | null; updatedAt: string }> = {}) =>
  ({ technicianId, name: `T${technicianId}`, city: 'Recife', status, updatedAt: over.updatedAt ?? '2026-10-01T10:00:00Z', offerStatus: 'assigned', assignedTechnicianId: over.assignedTechnicianId ?? null });

test('quem recebeu, leu, aceitou, recusou ou ignorou', () => {
  const rows = [
    row(1, 'clicked', { assignedTechnicianId: 1 }), row(1, 'read'), row(1, 'delivered'), row(1, 'declined', { updatedAt: '2026-10-02T10:00:00Z' }),
    row(2, 'sent'), row(2, 'delivered'), row(2, 'read'), row(2, 'sent'), row(2, 'sent'),
    row(3, 'simulated'), row(3, 'skipped'), row(3, 'pending'),
  ];
  const stats = technicianStats(rows);
  assert.deepEqual(stats.map((s) => s.technicianId), [2, 1], 'quem nunca aceitou (com 5+ ofertas) vem primeiro; simulado/pendente não conta');
  const t1 = stats.find((s) => s.technicianId === 1)!;
  assert.deepEqual([t1.received, t1.read, t1.accepted, t1.declined, t1.ignored, t1.acceptRate], [4, 3, 1, 1, 2, 25]);
  assert.equal(t1.lastResponseAt, '2026-10-02T10:00:00Z');
  const t2 = stats.find((s) => s.technicianId === 2)!;
  assert.deepEqual([t2.received, t2.accepted, t2.ignored, t2.neverAccepted], [5, 0, 5, true]);
});
