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

test('a memória explica a faixa de serviços e as evidências', () => {
  const texto = memoriaDeCalculo(calcularRepasse([...varios(3, servico), ...varios(8, evidencia)]));
  assert.match(texto, /3 serviços = R\$\s?120,00/);
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

test('a memória mostra o desconto de quem não resolveu', () => {
  const texto = memoriaDeCalculo(
    calcularRepasse([...varios(2, servico), servico({ improdutiva: true, motivo: 'loja-fechada' })]),
  );
  assert.match(texto, /1 não resolvida, metade do valor: − R\$\s?20,00/);
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
    '"Data";"Técnico";"Grupo";"FSA";"Tipo";"Resolveu";"Motivo";"Observação";"Como foi calculado";"Total da visita";"Situação"',
  );
  assert.ok(primeira.startsWith('"20/09/2026";"tecnico@cajutech.net";"Recife Centro";"FSA-100"'));
});

// A memória de cálculo tem ponto e vírgula dentro, que é o separador do CSV.
test('o separador dentro do texto não quebra as colunas', () => {
  const csv = paraCsv(linhasDoRelatorio([visita([servico(), evidencia()])]));
  const primeira = csv.slice(1).split('\r\n')[1];
  assert.equal(primeira.split('";"').length, 11, 'continuam 11 colunas');
  assert.match(primeira, /1 serviço = R\$\s?70,00; 1 FSA de evidência/);
});

test('aspas na observação não quebram o arquivo', () => {
  const comAspas = visita([servico()]);
  comAspas.fsas[0].observacao = 'máquina "fritando" o papel';
  const csv = paraCsv(linhasDoRelatorio([comAspas]));
  assert.match(csv, /"máquina ""fritando"" o papel"/);
});
