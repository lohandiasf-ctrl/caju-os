import assert from 'node:assert/strict';
import test from 'node:test';
import { groupNameOf, missingSteps, parseNewSolicitation, returnMessage, statusOf, whenText } from '../lib/solicitations.ts';

const base = { assigneeEmail: null, technicianId: null, scheduledAt: null, groupJid: null, returnedAt: null, cancelledAt: null };

test('estado derivado dos campos', () => {
  assert.equal(statusOf(base), 'nova');
  assert.equal(statusOf({ ...base, assigneeEmail: 'a@x' }), 'em_andamento');
  assert.equal(statusOf({ ...base, assigneeEmail: 'a@x', technicianId: 1, scheduledAt: '2026-10-03T14:00', groupJid: 'g@g.us' }), 'pronta');
  assert.equal(statusOf({ ...base, assigneeEmail: 'a@x', technicianId: 1, returnedAt: 'x' }), 'devolvida');
  assert.equal(statusOf({ ...base, cancelledAt: 'x' }), 'cancelada');
  assert.deepEqual(missingSteps({ technicianId: null, scheduledAt: '2026-10-03T14:00', groupJid: null }), ['técnico', 'grupo no WhatsApp']);
});

test('nome do grupo e texto de devolução', () => {
  assert.equal(whenText('2026-10-03T14:00'), '03/10 às 14:00');
  const s = { scheduledAt: '2026-10-03T14:00', city: 'Ipojuca', uf: 'pe', client: 'Cliente X', store: 'Loja 12' };
  assert.equal(groupNameOf(s), '03/10 às 14:00 - IPOJUCA/PE - CLIENTE X Loja 12');
  assert.equal(groupNameOf({ ...s, scheduledAt: null }), 'IPOJUCA/PE - CLIENTE X Loja 12');
  assert.equal(returnMessage({ ...s, groupName: 'G', technicianName: 'Ana' }), '✅ Solicitação atendida\nCliente X · Loja 12 — Ipojuca/pe\nTécnico: Ana\nDia: 03/10 às 14:00\nGrupo: G');
});

test('formulário', () => {
  assert.deepEqual(parseNewSolicitation({ client: '', city: 'x', description: 'abcde', requesterPhone: '81999990000' }), { error: 'Informe o cliente.' });
  assert.deepEqual(parseNewSolicitation({ client: 'C', city: 'x', description: 'abc', requesterPhone: '81999990000' }), { error: 'Descreva o que foi pedido.' });
  assert.deepEqual(parseNewSolicitation({ client: 'C', city: 'x', description: 'abcde', requesterPhone: '123' }), { error: 'Informe o WhatsApp de quem pediu, com DDD.' });
  const ok = parseNewSolicitation({ client: ' C ', city: 'Ipojuca', uf: 'pe', description: 'atender loja', requesterPhone: '(81) 99999-0000', priority: 'alta' });
  assert.ok('value' in ok && ok.value.requesterPhone === '5581999990000' && ok.value.uf === 'PE' && ok.value.priority === 'alta' && ok.value.client === 'C');
});
