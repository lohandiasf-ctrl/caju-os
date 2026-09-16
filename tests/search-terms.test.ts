import { strict as assert } from 'node:assert';
import test from 'node:test';
import { matchesSearch, searchTerms } from '../lib/search-terms.ts';

test('lista de chamados colada vira um termo por chamado', () => {
  assert.deepEqual(
    searchTerms('FSA-132030 | FSA-132032 | FSA-132034 | FSA-132035'),
    ['fsa-132030', 'fsa-132032', 'fsa-132034', 'fsa-132035'],
  );
});

test('vírgula, ponto e vírgula e quebra de linha também separam', () => {
  assert.deepEqual(searchTerms('FSA-1, FSA-2;FSA-3\nFSA-4'), ['fsa-1', 'fsa-2', 'fsa-3', 'fsa-4']);
});

test('só números, separados por espaço, contam como lista', () => {
  assert.deepEqual(searchTerms('132030 132032'), ['132030', '132032']);
});

test('busca comum com espaço continua sendo um termo só', () => {
  assert.deepEqual(searchTerms('loja 441'), ['loja 441']);
  assert.deepEqual(searchTerms('  Feira de Santana  '), ['feira de santana']);
});

test('chamado casa com qualquer um dos termos', () => {
  const terms = searchTerms('FSA-132030 | 132035');
  assert.equal(matchesSearch(['FSA-132035', 'Americanas', 'Itabuna'], terms), true);
  assert.equal(matchesSearch(['FSA-132030', null, undefined], terms), true);
  assert.equal(matchesSearch(['FSA-132099', 'Americanas'], terms), false);
});

test('busca vazia não filtra nada', () => {
  assert.equal(matchesSearch(['FSA-1'], searchTerms('   ')), true);
});
