import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasQueueFilters, matchesQueueFilters, NO_QUEUE_FILTERS, parseQueueFilters, queueFiltersHref, staleLabel, writeQueueFilters,
} from '../lib/queue-filters.ts';
import { parseTicketDate } from '../lib/ticket-activities.ts';

const now = new Date('2026-09-23T12:00:00');

test('filtros saem e voltam da URL, sempre limitados', () => {
  assert.deepEqual(parseQueueFilters('?view=tickets&parados=5&prioridade=alta'), { staleDays: 5, minPriority: 'Alta' });
  assert.deepEqual(parseQueueFilters('?parados=99&prioridade=MEDIA'), { staleDays: 14, minPriority: 'Media' });
  assert.deepEqual(parseQueueFilters('?parados=-3&prioridade=urgente'), NO_QUEUE_FILTERS);
  assert.equal(queueFiltersHref({ staleDays: 3, minPriority: 'Media' }), '/?view=tickets&parados=3&prioridade=media');
  assert.equal(queueFiltersHref(NO_QUEUE_FILTERS), '/?view=tickets');
  const params = writeQueueFilters(new URLSearchParams('view=tickets&parados=4&ticket=FSA-1'), NO_QUEUE_FILTERS);
  assert.equal(params.toString(), 'view=tickets&ticket=FSA-1');
  assert.equal(hasQueueFilters(NO_QUEUE_FILTERS), false);
  assert.equal(hasQueueFilters({ staleDays: 0, minPriority: 'Alta' }), true);
});

test('prioridade mínima e dias parado', () => {
  const fresh = { updatedAt: '2026-09-22T12:00:00', priority: 'Alta' as const };
  const old = { updatedAt: '2026-09-15T12:00:00', priority: 'Media' as const };
  const low = { updatedAt: '2026-09-01T12:00:00', priority: 'Baixa' as const };
  const noDate = { priority: 'Alta' as const };
  const only = (filters: Parameters<typeof matchesQueueFilters>[1]) =>
    [fresh, old, low, noDate].filter((ticket) => matchesQueueFilters(ticket, filters, now, parseTicketDate));
  assert.equal(only(NO_QUEUE_FILTERS).length, 4);
  assert.deepEqual(only({ staleDays: 0, minPriority: 'Alta' }), [fresh, noDate]);
  assert.deepEqual(only({ staleDays: 0, minPriority: 'Media' }), [fresh, old, noDate]);
  assert.deepEqual(only({ staleDays: 7, minPriority: 'Baixa' }), [old, low]);
  assert.deepEqual(only({ staleDays: 7, minPriority: 'Media' }), [old]);
  assert.equal(staleLabel(0), 'Qualquer');
  assert.equal(staleLabel(1), '1 dia ou mais');
});
