import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRepasse, type Fsa } from '../lib/fsa-payment.ts';
import {
  linhasDoRelatorio,
  memoriaDeCalculo,
  paraCsv,
  type VisitaDoRelatorio,
} from '../lib/fsa-report.ts';

const servico = (extra: Partial<Fsa> = {}): Fsa => ({ tipo: 'servico', ...extra });
const evidencia = (extra: Partial<Fsa> = {}): Fsa => ({ tipo: 'evidencia', ...extra });
const varios = (n: number, fabrica: () => Fsa): Fsa[] => Array.from({ length: n }, fabrica);

const visita = (fsas: Fsa[], extra: Partial<VisitaDoRelatorio> = {}): VisitaDoRelatorio => ({
  attendanceId: 1,
  data: '2026-09-20T13:00:00.000Z',
  tecnico: 'tecnico@cajutech.net',
  grupo: 'Recife Centro',
  status: 'aprovado',
  aprovadoPor: 'gerente@cajutech.net',
  aprovadoEm: '2026-09-20T18:00:00.000Z',
  dataPagamento: '2026-09-25',
  pagoEm: null,
  repasse: calcularRepasse(fsas),
  fsas: fsas.map((f, i) => ({
    ticketKey: `FSA-${100 + i}`,
    tipo: f.tipo,
    improdutiva: f.improdutiva ?? false,
    motivo: f.motivo ?? null,
    observacao: null,
    descobertaNaLoja: f.descobertaNaLoja ?? false,
  })),
  ...extra,
});

test('a memória explica a faixa de atuações e as evidências', () => {
  const texto = memoriaDeCalculo(calcularRepasse([...varios(3, servico), ...varios(8, evidencia)]));
  assert.match(texto, /faixa de 3 atuações = R\$\s?120,00/);
  assert.match(texto, /8 FSAs de evidência = R\$\s?40,00/);
  assert.match(texto, /total R\$\s?160,00/);
});

// Sem isso o relatório entrega R$ 180 onde a tabela diz R$ 150, e quem confere
// não tem como saber que está certo.
test('a memória avisa quando a exceção do quinto chamado entrou', () => {
  const texto = memoriaDeCalculo(
    calcularRepasse([...varios(4, servico), servico({ descobertaNaLoja: true })]),
  );
  assert.match(texto, /1 apareceu na loja, faixa seguinte por não render nada/);
  assert.match(texto, /total R\$\s?180,00/);
});

// Improdutiva soma com o valor dela, em vez de abater o que veio antes.
test('a memória traz a improdutiva como categoria, não como desconto', () => {
  const texto = memoriaDeCalculo(
    calcularRepasse([...varios(2, servico), servico({ improdutiva: true, motivo: 'loja-fechada' })]),
  );
  assert.match(texto, /2 resolvidas = R\$\s?80,00/);
  assert.match(texto, /1 improdutiva pela metade = R\$\s?20,00/);
  assert.doesNotMatch(texto, /−/, 'nada a subtrair na leitura');
  assert.match(texto, /total R\$\s?100,00/);
});

test('sai uma linha por FSA, repetindo os dados da visita', () => {
  const linhas = linhasDoRelatorio([
    visita([servico(), evidencia(), servico({ improdutiva: true, motivo: 'gerente-recusou' })]),
  ]);

  assert.equal(linhas.length, 3);
  assert.deepEqual(
    linhas.map((l) => l.fsa),
    ['FSA-100', 'FSA-101', 'FSA-102'],
  );
  assert.ok(
    linhas.every((l) => l.tecnico === 'tecnico@cajutech.net' && l.data === '20/09/2026'),
    'cada linha se sustenta sozinha depois de filtrar a planilha',
  );
  assert.deepEqual(
    linhas.map((l) => l.tipo),
    ['Serviço', 'Evidência', 'Serviço'],
  );
  assert.deepEqual(
    linhas.map((l) => l.resolveu),
    ['Sim', 'Sim', 'Não'],
  );
  assert.equal(linhas[2].motivo, 'Gerente não permitiu');
});

test('a situação da visita acompanha cada linha', () => {
  const [linha] = linhasDoRelatorio([visita([servico()], { status: 'pago' })]);
  assert.equal(linha.situacao, 'Pago');

  const [retida] = linhasDoRelatorio([visita([servico()], { status: 'bloqueado' })]);
  assert.equal(retida.situacao, 'Retido para conferência');
});

test('visita sem FSA ainda aparece, em vez de sumir do relatório', () => {
  const linhas = linhasDoRelatorio([visita([])]);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].fsa, '');
  assert.match(linhas[0].totalVisita, /^R\$\s0,00$/);
});

test('o CSV sai no formato que o Excel brasileiro abre', () => {
  const csv = paraCsv(linhasDoRelatorio([visita([servico()])]));

  assert.ok(csv.startsWith('﻿'), 'BOM, senão os acentos viram lixo');
  const [cabecalho, primeira] = csv.slice(1).split('\r\n');
  assert.equal(
    cabecalho,
    '"Data";"Técnico";"Grupo";"FSA";"Tipo";"Resolveu";"Motivo";"Observação";"Como foi calculado";"Atuação da visita";"Evidências da visita";"Improdutivas da visita";"Total da visita";"Situação";"Data do pagamento"',
  );
  assert.ok(primeira.startsWith('"20/09/2026";"tecnico@cajutech.net";"Recife Centro";"FSA-100"'));
});

// A memória de cálculo tem ponto e vírgula dentro, que é o separador do CSV.
test('o separador dentro do texto não quebra as colunas', () => {
  const csv = paraCsv(linhasDoRelatorio([visita([servico(), evidencia()])]));
  const primeira = csv.slice(1).split('\r\n')[1];
  assert.equal(primeira.split('";"').length, 15, 'continuam 15 colunas');
  assert.match(primeira, /faixa de 1 atuação = R\$\s?70,00; 1 resolvida/);
});

test('aspas na observação não quebram o arquivo', () => {
  const comAspas = visita([servico()]);
  comAspas.fsas[0].observacao = 'máquina "fritando" o papel';
  const csv = paraCsv(linhasDoRelatorio([comAspas]));
  assert.match(csv, /"máquina ""fritando"" o papel"/);
});

// A planilha precisa ser somável por recorte, então as três categorias vão em
// colunas próprias, repetidas por linha.
test('as três categorias viram colunas da planilha', () => {
  const linhas = linhasDoRelatorio([
    visita([servico(), evidencia(), servico({ improdutiva: true, motivo: 'loja-fechada' })]),
  ]);

  assert.match(linhas[0].atuacaoVisita, /^R\$\s50,00$/, 'metade da faixa de 2 atuações');
  assert.match(linhas[0].evidenciasVisita, /^R\$\s5,00$/);
  assert.match(linhas[0].improdutivasVisita, /^R\$\s25,00$/);
  assert.ok(
    linhas.every((l) => l.totalVisita === linhas[0].totalVisita),
    'toda linha carrega o total da visita',
  );
});

// A folha não paga no dia da aprovação: a planilha precisa dizer quando paga.
test('a data do pagamento vai para a planilha', () => {
  const [linha] = linhasDoRelatorio([visita([servico()])]);
  assert.equal(linha.dataPagamento, '25/09/2026');

  const [semData] = linhasDoRelatorio([visita([servico()], { dataPagamento: null, status: 'pronto' })]);
  assert.equal(semData.dataPagamento, '', 'grupo ainda não aprovado não tem data');
});

// Um dia sem hora não pode escorregar para o anterior por causa do fuso. Rodar
// com TZ de Brasília é o que expõe isso: em UTC o erro não aparece.
test('dia sem hora não vira o dia anterior', () => {
  const [linha] = linhasDoRelatorio([visita([servico()], { data: '2026-09-21', dataPagamento: '2026-10-01' })]);
  assert.equal(linha.data, '21/09/2026');
  assert.equal(linha.dataPagamento, '01/10/2026');
});
