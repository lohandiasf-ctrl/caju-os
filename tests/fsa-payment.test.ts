import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularRepasse,
  calcularRepasseDoDia,
  evidenciasCents,
  faixaServicosCents,
  validarFsas,
  type Fsa,
} from '../lib/fsa-payment.ts';

// Atalhos para os testes lerem como o documento: "3 serviços, 8 evidências".
const servico = (extra: Partial<Fsa> = {}): Fsa => ({ tipo: 'servico', ...extra });
const evidencia = (extra: Partial<Fsa> = {}): Fsa => ({ tipo: 'evidencia', ...extra });
const varios = (n: number, fabrica: () => Fsa): Fsa[] => Array.from({ length: n }, fabrica);

test('a faixa de serviços segue a tabela acordada', () => {
  const tabela = [7_000, 10_000, 12_000, 15_000, 15_000, 18_000, 21_000, 24_000, 27_000, 30_000, 33_000];
  tabela.forEach((cents, i) => assert.equal(faixaServicosCents(i + 1), cents, `${i + 1} serviços`));
  assert.equal(faixaServicosCents(0), 0);
});

test('acima de 11 serviços cada um vale R$ 30 a mais', () => {
  assert.equal(faixaServicosCents(12), 36_000);
  assert.equal(faixaServicosCents(13), 39_000);
  assert.equal(faixaServicosCents(40), 120_000, 'não há teto');
});

test('evidência sozinha tem piso de R$ 70 e cresce R$ 5 a partir da 15ª', () => {
  assert.equal(evidenciasCents(1, false), 7_000);
  assert.equal(evidenciasCents(14, false), 7_000);
  assert.equal(evidenciasCents(15, false), 7_500);
  assert.equal(evidenciasCents(18, false), 9_000);
  assert.equal(evidenciasCents(20, false), 10_000);
});

test('com serviço na visita, cada FSA de evidência vale R$ 5', () => {
  assert.equal(evidenciasCents(9, true), 4_500);
  assert.equal(evidenciasCents(20, true), 10_000, 'o piso de R$ 70 já veio na faixa de serviço');
});

// A correção que motivou a especificação: uma FSA com muitas fotos continua
// valendo uma evidência.
test('a contagem é por FSA, não por foto', () => {
  const umaFsaComMuitasFotos = calcularRepasse([evidencia()]);
  assert.equal(umaFsaComMuitasFotos.totalCents, 7_000);
  assert.equal(umaFsaComMuitasFotos.evidencias.quantidade, 1);
});

test('serviço e evidência na mesma visita somam (casos 1 e 2 do documento)', () => {
  const caso1 = calcularRepasse([servico(), ...varios(9, evidencia)]);
  assert.equal(caso1.servicos.totalCents, 7_000);
  assert.equal(caso1.evidencias.totalCents, 4_500);
  assert.equal(caso1.totalCents, 11_500, 'R$ 115');

  const caso2 = calcularRepasse([...varios(3, servico), ...varios(8, evidencia)]);
  assert.equal(caso2.totalCents, 16_000, 'R$ 160');
});

test('serviço novo na loja recalcula pela tabela, sem bônus fixo', () => {
  const maisUm = calcularRepasse([servico(), servico({ descobertaNaLoja: true })]);
  assert.equal(maisUm.totalCents, 10_000, 'o serviço novo valeu R$ 30, a diferença da faixa');
  assert.equal(maisUm.servicos.excecaoQuintoChamado, false);

  const maisDois = calcularRepasse([servico(), ...varios(2, () => servico({ descobertaNaLoja: true }))]);
  assert.equal(maisDois.totalCents, 12_000, 'os dois juntos valeram R$ 50: R$ 30 e R$ 20');
});

// A tabela repete R$ 150 em 4 e em 5, então sem a exceção o quinto serviço
// sairia de graça.
test('exceção do quinto chamado: 4 agendados + 1 na loja paga R$ 180', () => {
  const r = calcularRepasse([...varios(4, servico), servico({ descobertaNaLoja: true })]);
  assert.equal(r.totalCents, 18_000);
  assert.equal(r.servicos.excecaoQuintoChamado, true);
});

test('com 2 serviços novos a exceção não é necessária', () => {
  const r = calcularRepasse([...varios(4, servico), ...varios(2, () => servico({ descobertaNaLoja: true }))]);
  assert.equal(r.totalCents, 18_000, '6 serviços já valem R$ 180 por tabela');
  assert.equal(r.servicos.excecaoQuintoChamado, false);
});

test('5 serviços agendados continuam valendo R$ 150', () => {
  const r = calcularRepasse(varios(5, servico));
  assert.equal(r.totalCents, 15_000, 'sem descoberta na loja não há exceção');
  assert.equal(r.servicos.excecaoQuintoChamado, false);
});

test('3 agendados + 2 na loja não caem na exceção', () => {
  const r = calcularRepasse([...varios(3, servico), ...varios(2, () => servico({ descobertaNaLoja: true }))]);
  assert.equal(r.totalCents, 15_000, 'o recálculo já rendeu R$ 30, então a faixa vale');
  assert.equal(r.servicos.excecaoQuintoChamado, false);
});

test('improdutivo paga metade (casos 1, 2 e 3 do documento)', () => {
  const caso1 = calcularRepasse([servico({ improdutiva: true, motivo: 'loja-fechada' })]);
  assert.equal(caso1.totalCents, 3_500, 'R$ 35');

  const caso2 = calcularRepasse([servico(), servico({ improdutiva: true, motivo: 'defeito-maior' })]);
  assert.equal(caso2.totalCents, 7_500, 'R$ 75');

  const caso3 = calcularRepasse([
    ...varios(2, servico),
    servico({ improdutiva: true, motivo: 'defeito-maior' }),
  ]);
  assert.equal(caso3.totalCents, 10_000, 'R$ 100');
  assert.equal(caso3.descontoImprodutivoCents, 2_000);
});

test('uma visita inteira improdutiva é válida e paga metade', () => {
  const r = calcularRepasse(varios(3, () => servico({ improdutiva: true, motivo: 'loja-fechada' })));
  assert.equal(r.totalCents, 6_000, 'metade dos R$ 120');
});

// Entregar a evidência é o trabalho inteiro: ou saiu, ou vira atuação
// improdutiva. Não existe meia evidência.
test('evidência não pode ser improdutiva', () => {
  const invalida = [evidencia({ improdutiva: true, motivo: 'loja-fechada' })];
  assert.deepEqual(validarFsas(invalida), ['FSA 1: evidência não pode ser improdutiva.']);
  assert.throws(() => calcularRepasse(invalida), /evidência não pode ser improdutiva/);
});

// Reclassificar não é um caso à parte: o valor sai sempre das FSAs atuais.
test('evidência que vira serviço é recalculada', () => {
  const antes = calcularRepasse(varios(10, evidencia));
  assert.equal(antes.totalCents, 7_000);

  const depois = calcularRepasse([servico(), ...varios(9, evidencia)]);
  assert.equal(depois.totalCents, 11_500, 'R$ 70 de serviço + R$ 45 de evidência');
});

test('motivo é obrigatório quando a FSA é improdutiva', () => {
  const semMotivo = [servico({ improdutiva: true })];
  assert.deepEqual(validarFsas(semMotivo), ['FSA 1: marcada como improdutiva, mas sem motivo.']);
  assert.throws(() => calcularRepasse(semMotivo), /sem motivo/);
});

test('visita sem nenhuma FSA não gera repasse', () => {
  const r = calcularRepasse([]);
  assert.equal(r.totalCents, 0);
  assert.equal(r.descontoImprodutivoCents, 0);
});

// O exemplo de ponta a ponta do documento, que fecha em R$ 120.
test('exemplo prático do documento fecha em R$ 120', () => {
  const fsas: Fsa[] = [
    servico(),
    servico({ improdutiva: true, motivo: 'defeito-maior' }),
    servico({ descobertaNaLoja: true }),
    ...varios(2, evidencia),
    ...varios(2, () => evidencia({ descobertaNaLoja: true })),
  ];
  const r = calcularRepasse(fsas);

  assert.equal(r.servicos.faixaCents, 12_000, '3 serviços pela tabela');
  assert.equal(r.servicos.totalCents, 10_000, 'R$ 40 + R$ 40 + R$ 20');
  assert.equal(r.evidencias.totalCents, 2_000, '4 FSAs x R$ 5');
  assert.equal(r.totalCents, 12_000, 'R$ 120');
});

test('o dia junta as visitas numa faixa só', () => {
  const dia = calcularRepasseDoDia([varios(4, servico), varios(3, servico), varios(2, servico)]);

  assert.deepEqual(
    dia.visitas.map((v) => v.totalCents),
    [15_000, 12_000, 10_000],
    'cada loja continua detalhada',
  );
  assert.equal(dia.consolidado.servicos.quantidade, 9);
  assert.equal(dia.consolidado.totalCents, 27_000, '9 serviços valem R$ 270, não a soma das visitas');
});

// A improdutiva é uma categoria de leitura, não um desconto: ela tem valor
// próprio, e as três linhas somam o total sem nada a subtrair.
test('improdutiva aparece como categoria, com valor próprio', () => {
  const r = calcularRepasse([servico({ improdutiva: true, motivo: 'loja-fechada' })]);

  assert.equal(r.servicos.faixaCents, 7_000, 'a faixa continua sendo de 1 atuação');
  assert.equal(r.servicos.produtivosCents, 0);
  assert.equal(r.improdutivas.quantidade, 1);
  assert.equal(r.improdutivas.totalCents, 3_500, 'R$ 35: metade dos R$ 70');
  assert.equal(r.totalCents, 3_500);
});

test('as três categorias somam o total', () => {
  const casos: Fsa[][] = [
    [...varios(2, servico), servico({ improdutiva: true, motivo: 'defeito-maior' })],
    [servico(), ...varios(10, evidencia)],
    [...varios(4, servico), servico({ descobertaNaLoja: true }), ...varios(3, evidencia)],
    varios(5, () => servico({ improdutiva: true, motivo: 'loja-fechada' })),
  ];
  for (const fsas of casos) {
    const r = calcularRepasse(fsas);
    assert.equal(
      r.servicos.produtivosCents + r.evidencias.totalCents + r.improdutivas.totalCents,
      r.totalCents,
      'atuação + evidência + improdutiva fecha o total, sem linha de desconto',
    );
  }
});

// A faixa de atuação sempre divide exato, em qualquer quantidade. Quem quebra é
// o piso de R$ 70 da evidência sozinha dividido por 3, 6, 9... Aí a parte
// improdutiva precisa sair da subtração: arredondada por conta própria, ela
// somaria R$ 58,34 onde o total é R$ 58,33.
test('a repartição não perde centavo quando a divisão quebra', () => {
  // 7 atuações valem R$ 210; com 2 improdutivas a divisão é exata, mas a
  // subtração é o que garante isso em qualquer faixa futura.
  const r = calcularRepasse([
    ...varios(5, servico),
    ...varios(2, () => servico({ improdutiva: true, motivo: 'loja-fechada' })),
  ]);

  assert.equal(r.servicos.produtivosCents + r.improdutivas.totalCents, r.totalCents);
  assert.equal(r.improdutivas.totalCents, 3_000, 'R$ 30 por improdutiva, metade de R$ 30... x2');
  assert.equal(r.totalCents, 18_000);
});

// A atuação divide exato sempre — vale travar isso, porque uma faixa nova na
// tabela poderia quebrar a divisão sem ninguém perceber.
test('toda faixa de atuação divide exato pela quantidade', () => {
  for (let n = 1; n <= 30; n++) {
    const base = faixaServicosCents(n);
    assert.equal(base % n, 0, `${n} atuações: ${base} não divide exato`);
  }
});

test('visita mista separa improdutiva de atuação e de evidência', () => {
  const r = calcularRepasse([
    servico(),
    servico({ improdutiva: true, motivo: 'gerente-recusou' }),
    ...varios(2, evidencia),
  ]);

  assert.equal(r.servicos.produtivos, 1);
  assert.equal(r.servicos.produtivosCents, 5_000, 'metade da faixa de 2 atuações');
  assert.equal(r.evidencias.quantidade, 2);
  assert.equal(r.evidencias.totalCents, 1_000, 'evidência entra inteira, sempre');
  assert.equal(r.improdutivas.quantidade, 1, 'só atuação entra aqui');
  assert.equal(r.improdutivas.totalCents, 2_500);
  assert.equal(r.totalCents, 8_500);
});

// O caso que o usuário levantou: a visita inteira improdutiva paga metade.
test('4 atuações, todas improdutivas, pagam R$ 75', () => {
  const r = calcularRepasse(varios(4, () => servico({ improdutiva: true, motivo: 'loja-fechada' })));
  assert.equal(r.servicos.faixaCents, 15_000);
  assert.equal(r.servicos.produtivosCents, 0);
  assert.equal(r.improdutivas.totalCents, 7_500);
  assert.equal(r.totalCents, 7_500);
});
