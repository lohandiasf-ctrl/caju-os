import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, dateAndTime, describeAttachments, onlyDate, operationDateTime, statusLabel, ticketKeysIn, operationDate, previousOperationDate, splitTicketKeys, parseAnswer, queueContext, redact, ticketContext, validQuestion, type AssistantIssue, type AssistantTicket } from '../lib/assistant.ts';

const TODAY = new Date('2026-09-17T12:00:00.000Z');

function ticket(partial: Partial<AssistantTicket> = {}): AssistantTicket {
  return {
    key: 'FSA-1', summary: 'PDV 3 não liga', status: 'Agendado', priority: 'Alta',
    store: 'Loja Centro', city: 'Recife', createdAt: '2026-09-10', scheduledAt: null, partnerTriggeredAt: null,
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
  assert.match(text, /\| 2026-09-16 10:23 \|/, 'com a hora, porque a operação pergunta por horário');
});

// "Quantos chamados foram acionados hoje?" recebia "a lista não fornece a data
// de acionamento" — e não fornecia: só ia a abertura e o agendamento.
test('a fila leva a data de acionamento do parceiro', () => {
  const text = queueContext([ticket({ partnerTriggeredAt: '2026-09-17T08:10:00.000-0300' }), ticket({ key: 'FSA-2' })], 60, TODAY);
  assert.match(text, /aberto em \| acionado em \| agendamento/);
  assert.match(text, /FSA-1 .*\| 2026-09-10 \| 2026-09-17 08:10 \| sem agendamento \|/);
  assert.match(text, /FSA-2 .*\| não acionado \|/);
  assert.match(ticketContext(issue({ partnerTriggeredAt: '17/09/2026 08:10' }), 6, TODAY), /Parceiro acionado em: 17\/09\/2026 08:10/);
});

// A operação pergunta de vários jeitos: "quantos caíram", "quantos foram
// colocados", "quantos entraram". Tudo isso é acionamento.
test('o prompt da fila trata caiu, colocado e entrou como acionamento', () => {
  const prompt = buildMessages('queue', 'x', 'y')[0].content;
  const chegada = prompt.split('\n').find((text) => text.includes('coluna "acionado em"')) ?? '';
  for (const word of ['acionado', 'caíram', 'colocado', 'entraram', 'chegaram']) {
    assert.match(chegada, new RegExp(word), `"${word}" conta pelo acionamento`);
  }
  assert.match(prompt, /SENTIDO da pergunta/);
  assert.match(prompt, /Se não der para saber qual é, use "acionado em"/);
});

test('a fila traz as contagens de hoje prontas, com as FSAs', () => {
  const text = queueContext([
    ticket({ key: 'FSA-1', partnerTriggeredAt: '2026-09-17T08:10:00.000-0300', createdAt: '2026-09-17T07:00:00.000-0300' }),
    ticket({ key: 'FSA-2', partnerTriggeredAt: '17/09/2026 09:00' }),
    ticket({ key: 'FSA-3', partnerTriggeredAt: '2026-09-16T18:00:00.000-0300', scheduledAt: '2026-09-17 14:00' }),
  ], 60, TODAY);
  assert.match(text, /- Acionados hoje \(2026-09-17\): 2 — FSA-1, FSA-2/);
  assert.match(text, /- Abertos no Jira hoje \(2026-09-17\): 1 — FSA-1/);
  assert.match(text, /- Agendados para hoje \(2026-09-17\): 1 — FSA-3/);
});

// "Quantos chamados caíram ontem?" foi respondido pela data de abertura: só
// "hoje" vinha contado, e para ontem o modelo escolheu a coluna errada.
test('a fila também traz as contagens de ontem prontas', () => {
  const text = queueContext([
    ticket({ key: 'FSA-7', partnerTriggeredAt: '2026-09-16T18:00:00.000-0300', createdAt: '2026-09-15T10:00:00.000-0300' }),
    ticket({ key: 'FSA-8', createdAt: '2026-09-16T10:00:00.000-0300' }),
  ], 60, TODAY);
  assert.match(text, /ontem foi 2026-09-16/);
  assert.match(text, /- Acionados ontem \(2026-09-16\): 1 — FSA-7/);
  assert.match(text, /- Abertos no Jira ontem \(2026-09-16\): 1 — FSA-8/);
  assert.match(buildMessages('queue', 'x', 'y')[0].content, /"hoje" e "ontem", copie a linha certa/);
  // Perguntando o status de 27 FSAs, a resposta terminou com "(pela data de
  // acionamento)" — pergunta que não é sobre data não leva esse rodapé.
  assert.match(buildMessages('queue', 'x', 'y')[0].content, /pergunta que não é sobre data, não escreva isso/);
});

test('ontem é o dia anterior no fuso de Brasília', () => {
  assert.equal(previousOperationDate(new Date('2026-09-17T00:30:00-03:00')), '2026-09-16');
  assert.equal(previousOperationDate(new Date('2026-09-18T01:30:00Z')), '2026-09-16', '22h30 de 17/09 em Brasília');
  assert.equal(previousOperationDate(new Date('2026-10-01T12:00:00-03:00')), '2026-09-30');
});

test('contagem zerada não inventa lista', () => {
  assert.match(queueContext([ticket()], 60, TODAY), /- Acionados hoje \(2026-09-17\): 0\n/);
});

// "Quais chamados com técnico em campo não estão com evidências anexadas?"
// recebia "não consta": a fila não dizia nada sobre anexos.
test('a fila diz os anexos de cada chamado', () => {
  const text = queueContext([
    ticket({ key: 'FSA-1', attachmentTypes: ['image/jpeg', 'image/png', 'application/pdf'] }),
    ticket({ key: 'FSA-2', attachmentTypes: [] }),
  ], 60, TODAY);
  assert.match(text, /\| anexos \| título/);
  assert.match(text, /FSA-1 .*\| 2 fotos, 1 PDF \|/);
  assert.match(text, /FSA-2 .*\| nenhum \|/);
});

test('chamados sem anexo saem contados por status', () => {
  const text = queueContext([
    ticket({ key: 'FSA-1', status: 'Técnico em campo', attachmentTypes: [] }),
    ticket({ key: 'FSA-2', status: 'Técnico em campo', attachmentTypes: ['image/jpeg'] }),
    ticket({ key: 'FSA-3', status: 'Técnico em campo', attachmentTypes: [] }),
    ticket({ key: 'FSA-4', status: 'Agendado', attachmentTypes: [] }),
  ], 60, TODAY);
  assert.match(text, /- Sem nenhum anexo em "Técnico em campo": 2 — FSA-1, FSA-3/);
  assert.match(text, /- Sem nenhum anexo em "Agendado": 1 — FSA-4/);
  assert.match(buildMessages('queue', 'x', 'y')[0].content, /Evidência, foto, vídeo, RAT.*coluna "anexos"/);
});

test('sem dado de anexo, a fila não finge que ninguém tem anexo', () => {
  const text = queueContext([ticket()], 60, TODAY);
  assert.doesNotMatch(text, /Sem nenhum anexo/);
  assert.match(text, /FSA-1 .*\| - \| PDV 3/);
});

test('os anexos viram texto curto por tipo', () => {
  assert.equal(describeAttachments([]), 'nenhum');
  assert.equal(describeAttachments(['image/jpeg']), '1 foto');
  assert.equal(describeAttachments(['video/mp4', 'video/mp4', 'text/plain']), '2 vídeos, 1 outro');
  assert.match(ticketContext(issue({ attachmentTypes: ['application/pdf'] }), 6, TODAY), /Anexos \(evidências\): 1 PDF/);
});

// "Quais chamados estão com técnico em campo?" listou 26 dos 30 e ainda
// escreveu "Direcionado: não consta", que ninguém pediu.
test('a fila traz os chamados agrupados por status', () => {
  const text = queueContext([
    ticket({ key: 'FSA-1', status: 'TEC-CAMPO' }),
    ticket({ key: 'FSA-2', status: 'DIRECIONADO' }),
    ticket({ key: 'FSA-3', status: 'TEC-CAMPO' }),
  ], 60, TODAY);
  assert.match(text, /- Técnico em campo: 2 — FSA-1, FSA-3/);
  assert.match(text, /- Direcionado: 1 — FSA-2/);
  const prompt = buildMessages('queue', 'x', 'y')[0].content;
  assert.match(prompt, /copie a linha de X em "Chamados por status"/);
  assert.match(prompt, /não liste outros status nem escreva "não consta" para status que ninguém pediu/);
});

// A tela mostra "Técnico em campo"; o Jira chama de "TEC-CAMPO", e era isso
// que o assistente devolvia.
test('o status sai com a palavra que a tela usa', () => {
  assert.equal(statusLabel('TEC-CAMPO'), 'Técnico em campo');
  assert.equal(statusLabel('DIRECIONADO'), 'Direcionado');
  assert.equal(statusLabel('AGENDAMENTO PEDIDO PELO CLIENTE'), 'Pendente de agendamento');
  assert.equal(statusLabel('Agendado'), 'Agendado');
  assert.equal(statusLabel('Aguardando Spare'), 'Aguardando spare');
  assert.equal(statusLabel('Resolvido'), 'Resolvido', 'status fora da operação fica como veio');
  assert.match(queueContext([ticket({ status: 'TEC-CAMPO' })], 60, TODAY), /FSA-1 \| Técnico em campo \|/);
});

// Perguntando o status de 25 FSAs, 8 receberam "não consta": estavam fora da
// fila carregada. Agora o servidor busca no Jira as FSAs citadas.
test('as FSAs citadas na pergunta são extraídas', () => {
  assert.deepEqual(ticketKeysIn('quais o status desses: FSA-132424 fsa-132593, FSA-132424?'), ['FSA-132424', 'FSA-132593']);
  assert.deepEqual(ticketKeysIn('quantos caíram ontem'), []);
  assert.equal(ticketKeysIn(Array.from({ length: 40 }, (_, index) => `FSA-${index}`).join(' ')).length, 30, 'no máximo 30');
  assert.equal(ticketKeysIn('FSA-1 FSA-2 FSA-3', 2).length, 2);
});

test('as FSAs da resposta viram links, e o resto continua texto', () => {
  assert.deepEqual(splitTicketKeys('14 chamados:\n- FSA-132531\n- FSA-132585.'), [
    { text: '14 chamados:\n- ' },
    { text: 'FSA-132531', ticketKey: 'FSA-132531' },
    { text: '\n- ' },
    { text: 'FSA-132585', ticketKey: 'FSA-132585' },
    { text: '.' },
  ]);
  assert.deepEqual(splitTicketKeys('nenhum chamado'), [{ text: 'nenhum chamado' }]);
  assert.deepEqual(splitTicketKeys('dia 2026-09-16, sem FSA'), [{ text: 'dia 2026-09-16, sem FSA' }]);
});

test('o contexto diz que dia é hoje', () => {
  assert.match(queueContext([ticket()], 60, TODAY), /^Hoje é 2026-09-17; ontem foi 2026-09-16\./);
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
  assert.equal(onlyDate('17/09/2026 08:10'), '2026-09-17', 'data em texto BR vira AAAA-MM-DD');
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

// "Quais chamados caíram hoje após as 15h?" gastava as cinco rodadas de
// consulta e terminava em erro: a hora não estava em lugar nenhum do contexto.
// A busca por padrões que existia antes do chat entendia horário.
test('a fila leva a hora, não só o dia', () => {
  assert.equal(dateAndTime('2026-09-16T10:23:00.000-0300'), '2026-09-16 10:23');
  assert.equal(dateAndTime('17/09/2026, 14:30'), '2026-09-17 14:30', 'campo de texto do Jira');
  assert.equal(dateAndTime('17/09/2026 14:30'), '2026-09-17 14:30');
  assert.equal(dateAndTime('2026-09-16'), '2026-09-16', 'sem hora, a data sozinha ainda vale');
  assert.equal(dateAndTime(null), null);
  const text = queueContext([ticket({ partnerTriggeredAt: '2026-09-17T15:40:00.000-0300', scheduledAt: '18/09/2026, 09:00' })], 60, TODAY);
  assert.match(text, /\| 2026-09-17 15:40 \| 2026-09-18 09:00 \|/);
  assert.match(text, /formato AAAA-MM-DD HH:MM/, 'o modelo precisa saber o formato que está lendo');
});

// A contagem de "hoje" compara o dia; ganhar hora não pode quebrá-la.
test('a hora não atrapalha a contagem do dia', () => {
  const text = queueContext([
    ticket({ key: 'FSA-1', partnerTriggeredAt: '2026-09-17T08:10:00.000-0300' }),
    ticket({ key: 'FSA-2', partnerTriggeredAt: '2026-09-17T23:50:00.000-0300' }),
  ], 60, TODAY);
  assert.match(text, /- Acionados hoje \(2026-09-17\): 2 — FSA-1, FSA-2/);
});

// A última mensagem do WhatsApp saiu como "2026-09-18T03:02:00.000Z", três
// horas à frente do que o celular de quem perguntou mostrava. As datas do Jira
// já vêm com -0300, mas as do banco são UTC.
test('instante do banco sai no fuso da operação', () => {
  assert.equal(operationDateTime('2026-09-18T03:02:00.000Z'), '2026-09-18 00:02');
  assert.equal(operationDateTime('2026-09-17T12:00:00.000Z'), '2026-09-17 09:00');
  assert.equal(operationDateTime('2026-09-18T02:30:00.000-03:00'), '2026-09-18 02:30', 'já no fuso, fica igual');
  assert.equal(operationDateTime(null), null);
  assert.equal(operationDateTime('sem data'), 'sem data', 'o que não é data volta como veio');
});
