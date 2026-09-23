import assert from 'node:assert/strict';
import test from 'node:test';
import { answerBlocks, inlineSegments } from '../lib/answer-markdown.ts';
import { respostaCortada } from '../lib/assistant.ts';

test('tabela Markdown com cabeçalho vira bloco de tabela', () => {
  const blocks = answerBlocks([
    'Agendados para hoje:',
    '| Hora | FSA | Loja | Cidade | Técnico |',
    '|---|---|---|---|---|',
    '| 10:00 | FSA-133313 | L454 | Patos | sem técnico |',
    '| 13:00 | FSA-133061 | 1518 | Nova Cruz | Arthur Bruno de Oliveira |',
    '',
    '**Observações:**',
    '- 2 chamados sem técnico atribuído (FSA-133310, FSA-133309).',
    '- 3 chamados com 1ª visita de R$ 120,00',
  ].join('\n'));
  assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'table', 'paragraph', 'list']);
  const table = blocks[1];
  assert.equal(table.type, 'table');
  if (table.type !== 'table') return;
  assert.deepEqual(table.header, ['Hora', 'FSA', 'Loja', 'Cidade', 'Técnico']);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[1], ['13:00', 'FSA-133061', '1518', 'Nova Cruz', 'Arthur Bruno de Oliveira']);
  const list = blocks[3];
  assert.equal(list.type === 'list' && list.items.length, 2);
});

test('tabela sem linha separadora não inventa cabeçalho', () => {
  const [table] = answerBlocks('| 10:00 | FSA-1 |\n| 11:00 | FSA-2 |');
  assert.equal(table.type === 'table' && table.header, null);
  assert.equal(table.type === 'table' && table.rows.length, 2);
});

test('texto comum e quebras de linha continuam como parágrafo', () => {
  assert.deepEqual(answerBlocks('O chamado FSA-1 está agendado.\nTécnico: Ana.'), [{ type: 'paragraph', text: 'O chamado FSA-1 está agendado.\nTécnico: Ana.' }]);
  assert.deepEqual(answerBlocks('### Resumo'), [{ type: 'heading', text: 'Resumo' }]);
});

test('negrito do Markdown vira segmento sem os asteriscos', () => {
  assert.deepEqual(inlineSegments('status **Técnico em campo**.'), [
    { text: 'status ', bold: false },
    { text: 'Técnico em campo', bold: true },
    { text: '.', bold: false },
  ]);
  assert.deepEqual(inlineSegments('2 * 3'), [{ text: '2 * 3', bold: false }]);
});

test('respostaCortada reconhece finish_reason length', () => {
  assert.equal(respostaCortada({ choices: [{ finish_reason: 'length' }] }), true);
  assert.equal(respostaCortada({ choices: [{ finish_reason: 'stop' }] }), false);
  assert.equal(respostaCortada({ response: 'ok' }), false);
  assert.equal(respostaCortada(null), false);
});
