import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ROWS, systemInstruction, TOOL_SCHEMAS } from '../lib/assistant-tools.ts';
import { buildRequest, readCandidate, toolResultContent, type GeminiPayload } from '../lib/gemini-protocol.ts';

const INSTRUCTION = systemInstruction('2026-09-18', '2026-09-17');

test('toda consulta declarada tem nome, descrição e parâmetros válidos', () => {
  assert.ok(TOOL_SCHEMAS.length >= 4, 'o assistente precisa de mais de uma fonte para não virar o assistente da fila');
  for (const tool of TOOL_SCHEMAS) {
    assert.match(tool.name, /^[a-z_]+$/, `${tool.name} precisa ser um identificador simples`);
    assert.ok(tool.description.length > 40, `${tool.name} precisa de descrição que ensine quando usar`);
    assert.equal(tool.parameters.type, 'object', tool.name);
    for (const [field, schema] of Object.entries(tool.parameters.properties)) {
      const described = schema as { type?: string; description?: string };
      assert.ok(described.type, `${tool.name}.${field} sem tipo`);
      assert.ok(described.description, `${tool.name}.${field} sem descrição`);
    }
    for (const required of tool.parameters.required ?? []) {
      assert.ok(required in tool.parameters.properties, `${tool.name} exige ${required}, que não está declarado`);
    }
  }
});

test('nomes de consulta não se repetem', () => {
  const names = TOOL_SCHEMAS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
});

// O modelo só sabe o que está na instrução. Estes pontos vieram de erro real
// em produção com o assistente da fila, e não podem se perder.
test('a instrução carrega o que a operação já ensinou ao assistente', () => {
  assert.match(INSTRUCTION, /Hoje é 2026-09-18\. Ontem foi 2026-09-17\./, 'sem a data o modelo responde sobre o dia errado');
  assert.match(INSTRUCTION, /caiu.*colocado.*entrou|"caiu"/, 'as variações de "acionado" precisam estar no vocabulário');
  assert.match(INSTRUCTION, /acionamento do parceiro/);
  assert.match(INSTRUCTION, /nome da tela/, 'status sai como Técnico em campo, não TEC-CAMPO');
  assert.match(INSTRUCTION, /Não liste outros status/, 'a resposta escrevia "não consta" para status que ninguém pediu');
  assert.match(INSTRUCTION, /Nunca invente/);
  assert.match(INSTRUCTION, /somente leitura/i);
});

test('a instrução manda consultar antes de responder', () => {
  assert.match(INSTRUCTION, /Use as ferramentas antes de responder/);
  assert.match(INSTRUCTION, /contagem pronta/, 'contar a lista na mão foi o que deu 22 de 30');
});

test('o pedido leva instrução, pergunta e as consultas disponíveis', () => {
  const request = buildRequest({
    systemInstruction: 'instrução',
    contents: [{ role: 'user', parts: [{ text: 'quantos caíram ontem?' }] }],
    declarations: TOOL_SCHEMAS.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
  });
  assert.equal(request.systemInstruction.parts[0].text, 'instrução');
  assert.equal(request.contents[0].parts[0].text, 'quantos caíram ontem?');
  assert.equal(request.tools?.[0].functionDeclarations.length, TOOL_SCHEMAS.length);
  assert.equal(request.generationConfig.temperature, 0.2);
});

test('sem consultas declaradas o pedido não manda o campo de ferramentas', () => {
  const request = buildRequest({ systemInstruction: 'x', contents: [{ role: 'user', parts: [{ text: 'y' }] }], declarations: [] });
  assert.ok(!('tools' in request), 'campo vazio faz a API recusar o pedido');
});

test('a resposta em texto é lida', () => {
  const payload: GeminiPayload = { candidates: [{ content: { parts: [{ text: 'São 30 chamados.' }] }, finishReason: 'STOP' }] };
  const read = readCandidate(payload);
  assert.equal(read.text, 'São 30 chamados.');
  assert.deepEqual(read.calls, []);
});

test('o pedido de consulta é lido, com e sem argumentos', () => {
  const payload: GeminiPayload = {
    candidates: [{ content: { parts: [
      { functionCall: { name: 'consultar_chamados', args: { status: 'TEC-CAMPO' } } },
      { functionCall: { name: 'resumo_operacao' } },
    ] } }],
  };
  const read = readCandidate(payload);
  assert.deepEqual(read.calls, [
    { name: 'consultar_chamados', args: { status: 'TEC-CAMPO' } },
    // Função sem parâmetro vem sem `args`; virar objeto vazio evita checagem
    // em cada chamada.
    { name: 'resumo_operacao', args: {} },
  ]);
});

test('texto junto com consulta não engole a consulta', () => {
  const payload: GeminiPayload = {
    candidates: [{ content: { parts: [{ text: 'Vou verificar.' }, { functionCall: { name: 'resumo_operacao', args: {} } }] } }],
  };
  const read = readCandidate(payload);
  assert.equal(read.text, 'Vou verificar.');
  assert.equal(read.calls.length, 1, 'responder o texto aqui seria responder sem ter consultado');
});

test('resposta vazia não vira resposta', () => {
  assert.equal(readCandidate({}).text, '');
  assert.deepEqual(readCandidate({ candidates: [{ content: {} }] }).calls, []);
  assert.equal(readCandidate({ candidates: [{ finishReason: 'MAX_TOKENS' }] }).finishReason, 'MAX_TOKENS');
});

test('o resultado da consulta volta no formato que a API espera', () => {
  const content = toolResultContent([{ name: 'resumo_operacao', data: { chamados_em_operacao: 169 } }]);
  assert.equal(content.role, 'user');
  const part = content.parts[0];
  assert.ok('functionResponse' in part);
  assert.equal(part.functionResponse.name, 'resumo_operacao');
  assert.deepEqual(part.functionResponse.response, { resultado: { chamados_em_operacao: 169 } });
});

test('o teto de linhas por consulta existe e é modesto', () => {
  assert.ok(MAX_ROWS > 0 && MAX_ROWS <= 100, 'lista grande faz o modelo errar contagem');
  assert.match(TOOL_SCHEMAS.find((tool) => tool.name === 'consultar_chamados')!.description, /contagem/);
});

// A API recusou o segundo turno em produção: "Function call is missing a
// thought_signature in functionCall parts". Modelos que raciocinam mandam essa
// assinatura junto da chamada, e ela precisa voltar como veio — remontar a
// chamada a partir do nome e dos argumentos a perde.
test('o turno do modelo volta inteiro, com a assinatura de raciocínio', () => {
  const parts = [
    { functionCall: { name: 'consultar_tecnicos', args: { cidade: 'Itabuna' } }, thoughtSignature: 'Ct8BAbc123' },
  ];
  const read = readCandidate({ candidates: [{ content: { parts } }] });
  assert.deepEqual(read.parts, parts, 'as partes cruas saem intactas');
  const echoed = read.parts[0] as { thoughtSignature?: string };
  assert.equal(echoed.thoughtSignature, 'Ct8BAbc123');
});
