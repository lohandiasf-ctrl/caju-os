import assert from 'node:assert/strict';
import test from 'node:test';
import { listedNumbers, namesTicket, ticketGroups, ticketNumber, titleDate } from '../lib/whatsapp-ticket-group.ts';

const now = new Date(2026, 8, 30, 15, 0);
const g = (id: string, name: string, last = '2026-09-30T10:00:00Z') => ({ contactPhone: `${id}@g.us`, contactName: name, lastMessageAt: last });

test('número do chamado e menção no nome', () => {
  assert.equal(ticketNumber('FSA-133493'), '133493');
  assert.equal(ticketNumber('x'), null);
  assert.ok(namesTicket('30/09 - PRNM/RN (FSA-133639 | FSA-133637)', '133639'));
  assert.ok(namesTicket('L5082 (FSA-133516 | 133512 | FSA-133614)', '133512'), 'sem o prefixo FSA');
  assert.ok(!namesTicket('L1 (FSA-1336390)', '133639'), 'não casa pedaço de outro número');
});

test('números abreviados na lista do título', () => {
  const name = '30/09 às 11:00 - JPNH/MG - AMERICANAS L5082 (FSA-133516 | 133512 | FSA-133614 | 825 | 826 | 827)';
  for (const n of ['133516', '133512', '133614', '133825', '133826', '133827']) assert.ok(namesTicket(name, n), n);
  assert.ok(!namesTicket(name, '133828'));
  assert.ok(!namesTicket(name, '135082'), 'L5082 fora dos parênteses não conta como abreviação');
  assert.deepEqual(listedNumbers('X (FSA-133639 | FSA-133637)'), ['133639', '133637']);
  assert.deepEqual(listedNumbers('X (FSA-100100 | 5 | 12)'), ['100100', '100105', '100112']);
});

test('data do título, com hora e sem ano', () => {
  assert.equal(titleDate('30/09 às 13:00 - IPTG', now), new Date(2026, 8, 30, 13, 0).getTime());
  assert.equal(titleDate('29/09 17h - GRNH', now), new Date(2026, 8, 29, 17, 0).getTime());
  assert.equal(titleDate('30/09 15h-BHRZ', now), new Date(2026, 8, 30, 15, 0).getTime());
  assert.equal(titleDate('AGENDAR - CARU/PE', now), null);
  assert.equal(titleDate('02/01 10h - X', new Date(2026, 11, 28)), new Date(2027, 0, 2, 10, 0).getTime(), 'virada de ano');
});

test('escolhe o grupo de data mais recente; sem data fica por último', () => {
  const list = [
    g('a', '28/09 10h - ABC L1 (FSA-100001)'),
    g('b', '30/09 às 09:00 - ABC L1 (FSA-100001)'),
    g('c', 'AGENDAR - ABC L1 (FSA-100001)', '2026-09-30T18:00:00Z'),
    g('d', '30/09 15h - OUTRO (FSA-200002)'),
  ];
  assert.deepEqual(ticketGroups(list, 'FSA-100001', now).map((x) => x.contactPhone), ['b@g.us', 'a@g.us', 'c@g.us']);
  assert.deepEqual(ticketGroups(list, 'FSA-999999', now), []);
  // mesma data: a conversa mais ativa ganha
  const tie = [g('x', '30/09 - A (FSA-1234)', '2026-09-30T08:00:00Z'), g('y', '30/09 - B (FSA-1234)', '2026-09-30T12:00:00Z')];
  assert.equal(ticketGroups(tie, 'FSA-1234', now)[0].contactPhone, 'y@g.us');
});
