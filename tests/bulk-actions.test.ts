import assert from 'node:assert/strict';
import test from 'node:test';
import { bulkIneligibleReason, canBulkTransition, isBulkEligible, ticketsToClipboard } from '../lib/bulk-actions.ts';

test('bulk scheduling only takes tickets waiting to be scheduled', () => {
  assert.equal(isBulkEligible('AGENDAMENTO', 'scheduled'), true);
  assert.equal(isBulkEligible('Pendente de agendamento', 'scheduled'), true);
  assert.equal(isBulkEligible('AGENDADO', 'scheduled'), false);
  assert.equal(isBulkEligible('TEC-CAMPO', 'scheduled'), false);
});

test('a ticket cannot jump to field service without being scheduled first', () => {
  assert.equal(isBulkEligible('AGENDADO', 'in_service'), true);
  assert.equal(isBulkEligible('AGENDAMENTO', 'in_service'), false);
  assert.equal(isBulkEligible('Aguardando spare', 'in_service'), false);
  assert.match(bulkIneligibleReason('AGENDAMENTO', 'in_service'), /Agendados/);
});

test('only roles that may change a Jira stage can act in bulk', () => {
  assert.equal(canBulkTransition('n1'), true);
  assert.equal(canBulkTransition('gerencia'), true);
  assert.equal(canBulkTransition('tecnico'), false);
  assert.equal(canBulkTransition(undefined), false);
});

const tickets = [
  { id: 'FSA-1', title: 'Loja L300 | Desktop\tManutenção', store: 'Código da loja: L300', city: 'Governador Valadares', rawStatus: 'AGENDAMENTO' },
  { id: 'FSA-2', title: 'CPU lenta', store: 'Código da loja: 5053', city: 'Bom Despacho', rawStatus: 'AGENDADO', schedule: '12/09/2026, 08:00', technician: 'Ana' },
];

test('copying keys gives one FSA per line', () => {
  assert.equal(ticketsToClipboard(tickets, 'keys'), 'FSA-1\nFSA-2');
});

test('copying as a sheet keeps one row per ticket even with tabs in a title', () => {
  const lines = ticketsToClipboard(tickets, 'sheet').split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1].split('\t').length, 7);
  assert.equal(lines[2].split('\t')[6], 'Ana');
});

test('copying as a message puts each ticket in its own block', () => {
  const blocks = ticketsToClipboard(tickets, 'message').split('\n\n');
  assert.equal(blocks.length, 2);
  assert.match(blocks[1], /Agendamento: 12\/09\/2026, 08:00 · Técnico: Ana/);
});
