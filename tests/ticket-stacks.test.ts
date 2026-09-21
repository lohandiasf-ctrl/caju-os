import test from 'node:test';
import assert from 'node:assert/strict';
import { empilhar, type VinculoDeGrupo } from '../lib/ticket-stacks.ts';

const chamado = (id: string) => ({ id });
const grupo = (groupId: number, ...keys: string[]): [string, VinculoDeGrupo][] =>
  keys.map((ticketKey) => [ticketKey, { ticketKey, groupId, nome: `Grupo ${groupId}`, tecnico: 'Técnico' }]);

test('quatro FSAs do mesmo grupo viram uma pilha só', () => {
  const vinculos = new Map(grupo(1, 'A', 'B', 'C', 'D'));
  const entradas = empilhar(['A', 'B', 'C', 'D'].map(chamado), vinculos);

  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].tipo, 'pilha');
  assert.deepEqual(
    entradas[0].tipo === 'pilha' ? entradas[0].chamados.map((c) => c.id) : [],
    ['A', 'B', 'C', 'D'],
  );
});

test('chamado sem grupo continua solto', () => {
  const entradas = empilhar(['A', 'X', 'B'].map(chamado), new Map(grupo(1, 'A', 'B')));
  assert.deepEqual(
    entradas.map((e) => (e.tipo === 'pilha' ? `pilha:${e.chamados.map((c) => c.id).join('')}` : e.chamado.id)),
    ['pilha:AB', 'X'],
  );
});

// Uma FSA do grupo foi para "aguardando spare" e as outras seguiram em campo:
// nesta coluna só sobrou uma, e uma pilha de um card não faz sentido.
test('sobra de um grupo na coluna aparece sozinha', () => {
  const entradas = empilhar(['A', 'X'].map(chamado), new Map(grupo(1, 'A', 'B', 'C')));
  assert.deepEqual(
    entradas.map((e) => e.tipo),
    ['chamado', 'chamado'],
  );
});

test('a pilha entra no lugar do primeiro chamado do grupo', () => {
  const entradas = empilhar(['X', 'A', 'Y', 'B'].map(chamado), new Map(grupo(1, 'A', 'B')));
  assert.deepEqual(
    entradas.map((e) => (e.tipo === 'pilha' ? 'pilha' : e.chamado.id)),
    ['X', 'pilha', 'Y'],
    'a ordem da coluna não pula quando a pilha se forma',
  );
});

test('dois grupos na mesma coluna viram duas pilhas', () => {
  const vinculos = new Map([...grupo(1, 'A', 'B'), ...grupo(2, 'C', 'D')]);
  const entradas = empilhar(['A', 'C', 'B', 'D'].map(chamado), vinculos);
  assert.deepEqual(
    entradas.map((e) => (e.tipo === 'pilha' ? e.grupo.groupId : e.chamado.id)),
    [1, 2],
  );
});

test('coluna vazia continua vazia', () => {
  assert.deepEqual(empilhar([], new Map(grupo(1, 'A', 'B'))), []);
});
