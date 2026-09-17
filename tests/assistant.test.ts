import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, onlyDate, operationDate, parseAnswer, queueContext, redact, ticketContext, validQuestion, type AssistantIssue, type AssistantTicket } from '../lib/assistant.ts';

const TODAY = new Date('2026-09-17T12:00:00.000Z');

function ticket(partial: Partial<AssistantTicket> = {}): AssistantTicket {
  return {
    key: 'FSA-1', summary: 'PDV 3 não liga', status: 'Agendado', priority: 'Alta',
    store: 'Loja Centro', city: 'Recife', createdAt: '2026-09-10', scheduledAt: null,
    technicianName: null, ...partial,
  };
}

function issue(partial: Partial<AssistantIssue> = {}): AssistantIssue {
  return {
    ...ticket(), description: 'Cliente relata que o PDV não liga.', allegedDefect: 'Fonte queimada',
    problemCategory: 'Hardware', equipmentModel: 'Dell OptiPlex', defectSummary: null,
    technicianData: null, internalComments: [], ...partial,
  };
}

test('CPF, RG, telefone e e-mail não saem no prompt', () => {
  const text = redact('Nome: Ana\nCPF: 123.456.789-00\nRG: 12.345.678-9\nTEL: (81) 99999-8888\nana@loja.com.br');
  assert.match(text, /\[CPF\]/);
  assert.match(text, /\[RG\]/);
  assert.match(text, /\[TELEFONE\]/);
  assert.match(text, /\[EMAIL\]/);
  assert.doesNotMatch(text, /123\.456\.789/);
  assert.doesNotMatch(text, /99999/);
  assert.match(text, /Nome: Ana/, 'o que não é dado pessoal estruturado continua');
});

test('CPF sem pontuação também é mascarado', () => {
  assert.equal(redact('CPF 12345678900 do técnico'), 'CPF [CPF] do técnico');
});

test('a FSA não é confundida com documento', () => {
  assert.equal(redact('Chamado FSA-1234 na loja 55'), 'Chamado FSA-1234 na loja 55');
});

test('o contexto do chamado traz os campos operacionais e omite os vazios', () => {
  const text = ticketContext(issue({ defectSummary: null, scheduledAt: '2026-09-18 14:00' }));
  assert.match(text, /Chamado FSA-1/);
  assert.match(text, /Defeito alegado: Fonte queimada/);
  assert.match(text, /Agendado para: 2026-09-18 14:00/);
  assert.doesNotMatch(text, /Resumo do defeito/, 'campo vazio não entra no prompt');
});

test('os comentários internos entram redigidos e limitados aos mais recentes', () => {
  const comments = Array.from({ length: 9 }, (_, index) => ({
    author: 'Ana', createdAt: `2026-09-0${index + 1}`, body: `nota ${index + 1} tel (81) 99999-8888`,
  }));
  const text = ticketContext(issue({ internalComments: comments }), 3);
  assert.match(text, /nota 9/);
  assert.doesNotMatch(text, /nota 5/, 'só os últimos comentários vão ao modelo');
  assert.doesNotMatch(text, /99999/);
});

test('a fila vira tabela e avisa o que ficou de fora', () => {
  const tickets = Array.from({ length: 5 }, (_, index) => ticket({ key: `FSA-${index + 1}` }));
  const text = queueContext(tickets, 3, TODAY);
  assert.match(text, /5 chamados na fila/);
  assert.match(text, /FSA-3 \| Agendado \| Alta/);
  assert.doesNotMatch(text, /FSA-4/);
  assert.match(text, /2 chamados a mais não listados/);
});

// O assistente respondia "não consta" a "quantos chamados entraram hoje?"
// porque a data de abertura não ia no contexto e ele não sabia que dia era.
test('a fila leva a data de abertura de cada chamado', () => {
  const text = queueContext([ticket({ createdAt: '2026-09-16T10:23:00.000-0300' })], 60, TODAY);
  assert.match(text, /aberto em/, 'a coluna existe no cabeçalho');
  assert.match(text, /\| 2026-09-16 \|/, 'a data entra só com o dia');
});

test('o contexto diz que dia é hoje', () => {
  assert.match(queueContext([ticket()], 60, TODAY), /^Hoje é 2026-09-17\./);
  assert.match(ticketContext(issue(), 6, TODAY), /^Hoje é 2026-09-17\./);
});

// O Worker roda em UTC. Às 22h de Brasília o dia UTC já virou, e o assistente
// responderia sobre amanhã.
test('"hoje" é o dia de Brasília, não o do servidor em UTC', () => {
  assert.equal(operationDate(new Date('2026-09-17T23:30:00-03:00')), '2026-09-17');
  assert.equal(operationDate(new Date('2026-09-18T02:30:00Z')), '2026-09-17', 'madrugada em UTC ainda é ontem aqui');
  assert.equal(operationDate(new Date('2026-09-17T09:00:00-03:00')), '2026-09-17');
});

test('a data vem do Jira com hora e fuso, e sai só o dia', () => {
  assert.equal(onlyDate('2026-09-16T10:23:00.000-0300'), '2026-09-16');
  assert.equal(onlyDate('2026-09-16'), '2026-09-16');
  assert.equal(onlyDate(null), null);
  assert.equal(onlyDate('  '), null);
});

test('a pergunta da fila entra no prompt, redigida', () => {
  const messages = buildMessages('queue', queueContext([ticket()], 60, TODAY), 'qual o chamado do (81) 99999-8888?');
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /somente os dados fornecidos/i);
  assert.match(messages[1].content, /Pergunta: qual o chamado do \[TELEFONE\]\?/);
});

test('resumo e próximo passo não carregam pergunta', () => {
  const messages = buildMessages('summary', 'Chamado FSA-1', 'ignorada');
  assert.doesNotMatch(messages[1].content, /ignorada/);
});

test('cada tarefa tem instrução própria', () => {
  const de = (task: 'summary' | 'next_step' | 'queue') => buildMessages(task, 'x')[0].content;
  assert.notEqual(de('summary'), de('next_step'));
  assert.match(de('next_step'), /Próximo passo/);
});

test('a resposta é lida nos formatos que o Workers AI devolve', () => {
  assert.equal(parseAnswer({ response: '  texto  ' }), 'texto');
  assert.equal(parseAnswer({ result: { response: 'texto' } }), 'texto');
  assert.equal(parseAnswer('texto'), 'texto');
  assert.equal(parseAnswer({ response: 42 }), '');
  assert.equal(parseAnswer(null), '');
});

test('pergunta vazia, curta demais ou longa demais é recusada', () => {
  assert.equal(validQuestion('quantos chamados estão sem técnico?'), true);
  assert.equal(validQuestion('  '), false);
  assert.equal(validQuestion('ab'), false);
  assert.equal(validQuestion('a'.repeat(401)), false);
  assert.equal(validQuestion(undefined), false);
});
