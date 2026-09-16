import assert from 'node:assert/strict';
import test from 'node:test';
import { bulkIneligibleReason, canBulkTransition, isBulkEligible, ticketsToClipboard, ticketsToClipboardHtml } from '../lib/bulk-actions.ts';
import { sharedTicketUrl } from '../lib/ticket-links.ts';

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
  { id: 'FSA-1', title: 'Loja L300 | Desktop\tManutenção | PC deu pau', store: 'Código da loja: L300', city: 'Governador Valadares', rawStatus: 'AGENDAMENTO', allegedDefect: 'PC travando constantemente' },
  { id: 'FSA-2', title: 'Código da loja 5053 | CPU - Performance - Lentidão, Self Checkout?: Não', store: 'Código da loja: 5053', city: 'Bom Despacho', rawStatus: 'AGENDADO', schedule: '12/09/2026, 08:00', technician: 'Ana' },
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
  const message = ticketsToClipboard(tickets, 'message');
  assert.match(message, /FSA-1 · AGENDAMENTO\n\nhttps:\/\/operacoes\.cajutech\.net\/\?ticket=FSA-1/);
  assert.match(message, /L300 - Governador Valadares/);
  assert.match(message, /Resumo do problema "PC travando constantemente"/);
  assert.match(message, /CPU\n\nResumo do problema "Performance - Lentidão, Self Checkout\?: Não"/);
  assert.doesNotMatch(message, /Agendamento:/);
  assert.doesNotMatch(message, /Técnico:/);
});

test('copying as a message can include rich clickable links', () => {
  const html = ticketsToClipboardHtml(tickets, 'message') ?? '';
  assert.match(html, /<a href="https:\/\/operacoes\.cajutech\.net\/\?ticket=FSA-1">https:\/\/operacoes\.cajutech\.net\/\?ticket=FSA-1<\/a>/);
  assert.match(html, /<b>Resumo do problema<\/b>/);
});

// O resumo já saiu com o domínio antigo uma vez; este teste prende as duas
// cópias do link ao mesmo endereço.
test('link do resumo é o mesmo link público do resto do app', () => {
  const message = ticketsToClipboard(tickets, 'message');
  assert.ok(message.includes(sharedTicketUrl('FSA-1')), message);
  assert.ok((ticketsToClipboardHtml(tickets, 'message') ?? '').includes(sharedTicketUrl('FSA-2')));
});
