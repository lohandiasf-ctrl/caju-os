import assert from 'node:assert/strict';
import test from 'node:test';
import { storeCodeKey, storeVisits } from '../lib/store-history.ts';

const arch = (key: string, store: string | null, title: string, jira: object = {}, at = '2026-09-20T10:00:00Z') => ({
  ticketKey: key, title, jiraStatus: 'Agendado', operationalStatus: null, storeName: store, city: 'Recife', capturedAt: at, snapshot: JSON.stringify({ jira }),
});

test('código de loja em qualquer formato', () => {
  assert.equal(storeCodeKey('L158'), '158'); assert.equal(storeCodeKey('Loja 0158'), '158'); assert.equal(storeCodeKey('158'), '158'); assert.equal(storeCodeKey('SHOPPING'), null);
});

test('visitas da loja, mais recentes primeiro, com valores e técnico', () => {
  const list = [
    arch('FSA-1', 'L158', 'Loja L158 | CPU - Lentidão', { operationalFields: { ticketTotal: '720', allegedDefect: 'PDV lento', technicianData: 'Nome: Ana\nCPF: 1', serviceStartedAt: '2026-09-21T14:13:00.000-0300' } }),
    arch('FSA-2', 'L999', 'Loja L999 | Scanner'),
    arch('FSA-3', null, 'Código da loja L158 | Scanner - Cabo', { operationalFields: { ticketTotal: '120,50' } }, '2026-09-25T10:00:00Z'),
  ];
  const visits = storeVisits(list, 'L158');
  assert.deepEqual(visits.map((v) => v.ticketKey), ['FSA-3', 'FSA-1']);
  assert.equal(visits[1].total, 720); assert.equal(visits[1].technician, 'Ana'); assert.equal(visits[1].defect, 'PDV lento'); assert.equal(visits[0].total, 120.5);
  assert.deepEqual(storeVisits(list, 'L1'), [], 'L1 não casa L158');
});
