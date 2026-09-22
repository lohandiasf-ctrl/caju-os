import test from 'node:test';
import assert from 'node:assert/strict';
import { cidadeDoChamado, cidadesDosChamados, erroDeCidades, nomeDoGrupo, numeroDaLoja } from '../lib/group-name.ts';

test('nome do grupo é a cidade e o número da loja', () => {
  assert.equal(
    nomeDoGrupo([
      { store: 'Código da loja: L497', city: 'Candeias' },
      { store: 'Código da loja: L497', city: 'Candeias' },
    ]),
    'Candeias — Loja L497',
  );
});

test('duas lojas na mesma cidade', () => {
  assert.equal(
    nomeDoGrupo([
      { store: 'Código da loja: L497', city: 'Candeias' },
      { store: 'Código da loja: L500', city: 'Candeias' },
    ]),
    'Candeias — Lojas L497, L500',
  );
});

test('cidades diferentes ficam separadas', () => {
  assert.equal(
    nomeDoGrupo([
      { store: 'Código da loja: L497', city: 'Candeias' },
      { store: 'Código da loja: 5271', city: 'Brejo Santo' },
    ]),
    'Candeias — Loja L497 · Brejo Santo — Loja 5271',
  );
});

// O kanban preenche a cidade que falta com "Atualizado em ...", e isso não é
// cidade: o grupo não pode se chamar "Atualizado em 21/09 — Loja L443".
test('a data que o kanban põe no lugar da cidade não entra no nome', () => {
  assert.equal(
    nomeDoGrupo([{ store: 'Código da loja: L443', city: 'Atualizado em 21/09/2026, 10:00' }]),
    'Loja L443',
  );
});

test('loja não informada não vira nome', () => {
  assert.equal(nomeDoGrupo([{ store: 'Loja não informada', city: 'Recife' }]), 'Recife');
  assert.equal(nomeDoGrupo([{ store: 'Loja não informada', city: 'Atualizado em ontem' }]), 'Chamados agrupados');
});

test('o número da loja sai de qualquer formato que o Jira mande', () => {
  assert.equal(numeroDaLoja('Código da loja: L443'), 'L443');
  assert.equal(numeroDaLoja('Loja L443'), 'L443');
  assert.equal(numeroDaLoja('L443'), 'L443');
  assert.equal(numeroDaLoja('5271'), '5271');
  assert.equal(numeroDaLoja(''), null);
  assert.equal(numeroDaLoja(null), null);
});

test('cidade vazia ou de preenchimento vira nada', () => {
  assert.equal(cidadeDoChamado('Candeias'), 'Candeias');
  assert.equal(cidadeDoChamado('  '), null);
  assert.equal(cidadeDoChamado('Atualizado em 20/09'), null);
});

test('nome muito longo é cortado', () => {
  const muitos = Array.from({ length: 40 }, (_, i) => ({ store: `Código da loja: L${1000 + i}`, city: `Cidade ${i}` }));
  const nome = nomeDoGrupo(muitos);
  assert.ok(nome.length <= 120);
  assert.ok(nome.endsWith('…'));
});

// Um grupo é uma visita: Nazaré da Mata (PE) e Nanuque (MG) no mesmo grupo
// dividiam a faixa de preço de visitas que não têm nada a ver.
test('chamados de cidades diferentes não formam grupo', () => {
  const erro = erroDeCidades([
    { store: 'Código da loja: 5482', city: 'Nazaré Da Mata' },
    { store: 'Código da loja: L953', city: 'Nanuque' },
  ]);
  assert.ok(erro);
  assert.match(erro, /Nazaré Da Mata e Nanuque/);
});

test('a mesma cidade escrita de outro jeito é a mesma cidade', () => {
  assert.deepEqual(cidadesDosChamados([{ city: 'Nazaré da Mata' }, { city: 'NAZARE  DA MATA' }]), ['Nazaré da Mata']);
  assert.equal(erroDeCidades([{ city: 'Recife' }, { city: 'recife' }]), null);
});

test('chamado sem cidade não impede o grupo', () => {
  assert.equal(erroDeCidades([{ city: 'Recife' }, { city: '' }, { city: 'Atualizado em 21/09' }]), null);
});
