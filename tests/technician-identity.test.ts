import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acharNoCadastro,
  cpfValido,
  nomeComparavel,
  planejarUnificacao,
  type TecnicoDoCadastro,
} from '../lib/technician-identity.ts';

// CPFs fictícios com dígito verificador válido.
const CPF_A = '529.982.247-25';
const CPF_A_ERRADO = '529.982.247-26'; // um dígito trocado, verificador não bate
const CPF_B = '111.444.777-35';

let proximo = 1;
const tec = (extra: Partial<TecnicoDoCadastro>): TecnicoDoCadastro => ({
  id: proximo++,
  name: 'Fulano de Tal',
  cpf: CPF_A,
  email: null,
  baseCity: 'Caruaru',
  createdAt: '2026-09-04',
  ...extra,
});

test('o CPF fictício de teste é válido e o com um dígito trocado não', () => {
  assert.ok(cpfValido(CPF_A));
  assert.ok(cpfValido(CPF_B));
  assert.ok(!cpfValido(CPF_A_ERRADO));
  assert.ok(!cpfValido('111.111.111-11'), 'dígitos repetidos não valem');
});

test('nome comparável ignora acento, caixa e o "APAGAR -"', () => {
  assert.equal(nomeComparavel('Jhonatas de Araújo  Saraiva'), nomeComparavel('Jhonatas De araujo saraiva'));
  assert.equal(nomeComparavel('APAGAR - Ray Henrique da Silva'), 'ray henrique da silva');
});

// O caso do Neilton: quatro importações, uma linha com e-mail.
test('mesmo CPF e mesmo nome viram uma pessoa, e fica a linha com e-mail', () => {
  const linhas = [tec({ id: 10 }), tec({ id: 11, email: 'neilton@x.com' }), tec({ id: 12 }), tec({ id: 13 })];
  const { unificacoes, conflitos } = planejarUnificacao(linhas);
  assert.deepEqual(unificacoes, [{ manter: 11, remover: [10, 12, 13] }]);
  assert.deepEqual(conflitos, []);
});

test('grafia diferente do mesmo nome, mesmo CPF, é a mesma pessoa', () => {
  const { unificacoes } = planejarUnificacao([
    tec({ id: 20, name: 'Jhonatas De araujo saraiva' }),
    tec({ id: 21, name: 'Jhonatas de Araújo saraiva' }),
  ]);
  assert.deepEqual(unificacoes, [{ manter: 20, remover: [21] }]);
});

// Emylli e Manoel: mesmo CPF, pessoas diferentes. Juntar seria pagar o Manoel
// na conta da Emylli.
test('mesmo CPF com nomes diferentes não é unificado', () => {
  const { unificacoes, conflitos } = planejarUnificacao([
    tec({ id: 30, name: 'Emylli de Oliveira Silva', baseCity: 'Timbaúba' }),
    tec({ id: 31, name: 'Emylli de Oliveira Silva', baseCity: 'Timbaúba' }),
    tec({ id: 32, name: 'Manoel Antônio de Oliveira Silva', baseCity: 'Ferreiros' }),
  ]);
  assert.deepEqual(unificacoes, [{ manter: 30, remover: [31] }], 'as duas Emylli viram uma, o Manoel fica');
  assert.deepEqual(conflitos, [{ motivo: 'mesmo CPF com nomes diferentes', ids: [30, 31, 32] }]);
});

// Erivelton e Lohan: mesmo nome e cidade, CPF com um dígito errado.
test('CPF com um dígito errado, mesmo nome e cidade, é a mesma pessoa', () => {
  const { unificacoes, conflitos } = planejarUnificacao([
    tec({ id: 40, cpf: CPF_A_ERRADO, email: 'a@x.com' }),
    tec({ id: 41, cpf: CPF_A, email: 'b@x.com' }),
  ]);
  assert.deepEqual(unificacoes, [{ manter: 41, remover: [40] }], 'fica a de CPF válido');
  assert.deepEqual(conflitos, []);
});

test('homônimos na mesma cidade com CPFs válidos diferentes não são unificados', () => {
  const { unificacoes, conflitos } = planejarUnificacao([
    tec({ id: 50, cpf: CPF_A }),
    tec({ id: 51, cpf: CPF_B }),
  ]);
  assert.deepEqual(unificacoes, []);
  assert.deepEqual(conflitos, [{ motivo: 'mesmo nome e cidade com CPFs diferentes', ids: [50, 51] }]);
});

// Ewerton: cinco linhas, nenhuma com CPF.
test('linhas sem CPF, mesmo nome e cidade, viram uma pessoa', () => {
  const { unificacoes } = planejarUnificacao([60, 61, 62].map((id) => tec({ id, cpf: null })));
  assert.deepEqual(unificacoes, [{ manter: 60, remover: [61, 62] }]);
});

test('linha sem CPF se junta ao grupo que tem um CPF só', () => {
  const { unificacoes } = planejarUnificacao([tec({ id: 70 }), tec({ id: 71 }), tec({ id: 72, cpf: null })]);
  assert.deepEqual(unificacoes, [{ manter: 70, remover: [71, 72] }]);
});

test('mesmo nome em cidades diferentes, sem CPF, não é unificado', () => {
  const { unificacoes } = planejarUnificacao([
    tec({ id: 80, cpf: null, baseCity: 'Recife' }),
    tec({ id: 81, cpf: null, baseCity: 'Caruaru' }),
  ]);
  assert.deepEqual(unificacoes, []);
});

test('a importação acha o técnico pelo CPF mesmo sem e-mail', () => {
  const cadastro = [tec({ id: 90, email: null })];
  assert.equal(acharNoCadastro(cadastro, { name: 'Fulano de Tal', cpf: '52998224725', city: 'Caruaru' })?.id, 90);
});

test('a importação não confunde parente que usa o mesmo CPF', () => {
  const cadastro = [tec({ id: 91, name: 'Emylli de Oliveira Silva' })];
  assert.equal(acharNoCadastro(cadastro, { name: 'Manoel Antônio', cpf: CPF_A, city: 'Ferreiros' }), null);
});

test('a importação cai para nome e cidade só quando a linha não tem CPF', () => {
  const cadastro = [tec({ id: 92, cpf: null })];
  assert.equal(acharNoCadastro(cadastro, { name: 'Fulano de Tal', city: 'Caruaru' })?.id, 92);
  assert.equal(
    acharNoCadastro(cadastro, { name: 'Fulano de Tal', cpf: CPF_B, city: 'Caruaru' }),
    null,
    'com CPF diferente não é o mesmo, mesmo com nome e cidade iguais',
  );
});

// O caso do Ray Henrique: a linha marcada "APAGAR" tinha o e-mail, e a regra
// de ficar com a linha de e-mail a manteria — o contrário do que alguém já
// tinha pedido.
test('a linha marcada APAGAR nunca é a mantida, mesmo tendo e-mail', () => {
  const { unificacoes } = planejarUnificacao([
    tec({ id: 100, name: 'APAGAR - Ray Henrique da Silva', email: 'ray@x.com' }),
    tec({ id: 101, name: 'Ray Henrique da Silva', email: null }),
  ]);
  assert.deepEqual(unificacoes, [{ manter: 101, remover: [100] }]);
});
