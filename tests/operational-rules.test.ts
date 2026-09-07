import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransientJiraStatus, retryDelaySeconds, validationRequirements } from '../lib/operational-rules.ts';

test('validation only releases a complete field-service ticket', () => {
  assert.deepEqual(validationRequirements({ status: 'TEC-CAMPO', ticketTotal: '120', attachmentCount: 1, identifiedProblem: 'Fonte', testsPerformed: 'Medição', partToReplace: 'Fonte', pendingSync: 0 }), []);
});

test('validation explains every pending requirement', () => {
  assert.equal(validationRequirements({ status: 'AGENDAMENTO', ticketTotal: '0', attachmentCount: 0, pendingSync: 1 }).length, 7);
});

test('retry policy is exponential and bounded', () => {
  assert.equal(retryDelaySeconds(0), 15);
  assert.equal(retryDelaySeconds(20), 3600);
  assert.equal(isTransientJiraStatus(503), true);
  assert.equal(isTransientJiraStatus(400), false);
});
