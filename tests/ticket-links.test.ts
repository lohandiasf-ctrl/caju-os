import { strict as assert } from 'node:assert';
import test from 'node:test';
import { jiraTicketUrl, sharedTicketUrl } from '../lib/ticket-links.ts';

test('link de validação aponta para o chamado no Jira', () => {
  assert.equal(jiraTicketUrl('FSA-132555'), 'https://delfia.atlassian.net/browse/FSA-132555');
});

test('chave sem prefixo ou em minúscula vira link válido', () => {
  assert.equal(jiraTicketUrl('132555'), 'https://delfia.atlassian.net/browse/132555');
  assert.equal(jiraTicketUrl(' fsa-132555 '), 'https://delfia.atlassian.net/browse/FSA-132555');
});

test('link de compartilhamento continua sendo o do Caju OS', () => {
  assert.equal(sharedTicketUrl('FSA-132555'), 'https://operacoes.cajutech.net/?ticket=FSA-132555');
});
