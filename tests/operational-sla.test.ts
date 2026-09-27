import assert from 'node:assert/strict';
import test from 'node:test';
import { measuresSla } from '../lib/operational-sla.ts';

test('SLA não mede spare, agendado nem fluxo encerrado', () => {
  assert.equal(measuresSla('awaiting_spare'), false);
  assert.equal(measuresSla('scheduled'), false);
  assert.equal(measuresSla('resolved'), false);
  assert.equal(measuresSla('scheduling'), true);
  assert.equal(measuresSla('in_service'), true);
});
