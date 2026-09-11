import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransientJiraStatus, retryDelaySeconds, validationRequirements } from '../lib/operational-rules.ts';
import { elapsedLabel, normalizeFsaKeys } from '../lib/active-attendances.ts';

test('validation only releases a complete field-service ticket', () => {
  assert.deepEqual(validationRequirements({ status: 'TEC-CAMPO', ticketTotal: '120', attachmentCount: 1, identifiedProblem: 'Fonte', testsPerformed: 'Medição', partToReplace: 'Fonte', serviceStartedAt: '2026-09-10T09:00:00.000-03:00', serviceEndedAt: '2026-09-10T09:30:00.000-03:00', pendingSync: 0 }), []);
});

test('validation explains every pending requirement', () => {
  assert.equal(validationRequirements({ status: 'AGENDAMENTO', ticketTotal: '0', attachmentCount: 0, pendingSync: 1 }).length, 9);
});

test('validation rejects an end time that does not follow the start time', () => {
  assert.ok(validationRequirements({ status: 'TEC-CAMPO', ticketTotal: '120', attachmentCount: 1, identifiedProblem: 'Fonte', testsPerformed: 'Medição', partToReplace: 'Fonte', serviceStartedAt: '2026-09-10T09:00:00.000-03:00', serviceEndedAt: '2026-09-10T09:00:00.000-03:00' }).includes('término posterior ao início'));
});

test('retry policy is exponential and bounded', () => {
  assert.equal(retryDelaySeconds(0), 15);
  assert.equal(retryDelaySeconds(20), 3600);
  assert.equal(isTransientJiraStatus(503), true);
  assert.equal(isTransientJiraStatus(400), false);
});

test('normalizes several pasted FSA formats without duplicating tickets', () => {
  assert.deepEqual(
    normalizeFsaKeys('fsa-132074, FSA 132073\nFSA-132074'),
    ['FSA-132074', 'FSA-132073'],
  );
  assert.deepEqual(normalizeFsaKeys('chamado 132074'), []);
});

test('formats active attendance elapsed time for the dashboard', () => {
  const started = '2026-09-10T12:00:00.000Z';
  assert.equal(elapsedLabel(started, Date.parse('2026-09-10T12:00:20.000Z')), 'agora');
  assert.equal(elapsedLabel(started, Date.parse('2026-09-10T13:15:00.000Z')), 'há 1h 15min');
});
