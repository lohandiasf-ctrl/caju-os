// Relatório de repasse que a gerência exporta e manda para a folha.
//
// O Caju não paga ninguém: este arquivo é o fim da linha aqui dentro. Por isso
// ele carrega a memória de cálculo junto do valor — quem recebe precisa
// conseguir conferir sem abrir o sistema.

import type { MotivoImprodutivo, Repasse } from '@/lib/fsa-payment';

export type VisitaDoRelatorio = {
  attendanceId: number;
  data: string;
  tecnico: string;
  grupo: string | null;
  status: 'aberto' | 'pronto' | 'aprovado' | 'pago' | 'bloqueado';
  aprovadoPor: string | null;
  aprovadoEm: string | null;
  pagoEm: string | null;
  repasse: Repasse;
  fsas: {
    ticketKey: string;
    tipo: 'servico' | 'evidencia' | null;
    improdutiva: boolean;
    motivo: string | null;
    observacao: string | null;
    descobertaNaLoja: boolean;
  }[];
};

export type LinhaDoRelatorio = {
  data: string;
  tecnico: string;
  grupo: string;
  fsa: string;
  tipo: string;
  resolveu: string;
  motivo: string;
  observacao: string;
  calculo: string;
  atuacaoVisita: string;
  evidenciasVisita: string;
  improdutivasVisita: string;
  totalVisita: string;
  situacao: string;
};

const ROTULO_STATUS: Record<VisitaDoRelatorio['status'], string> = {
  aberto: 'Em aberto',
  pronto: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  pago: 'Pago',
  bloqueado: 'Retido para conferência',
};

const ROTULO_MOTIVO: Record<MotivoImprodutivo, string> = {
  'gerente-recusou': 'Gerente não permitiu',
  'defeito-maior': 'Defeito maior, fora do atendimento',
  'problema-impeditivo': 'Outro problema impedia resolver',
  'loja-fechada': 'Loja fechada',
  'tempo-excedido': 'Mais de 2h no mesmo problema',
  'loja-fechando': 'Loja nos últimos 30 minutos',
};

const reais = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dia = (iso: string) => {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleDateString('pt-BR');
};

/**
 * Explica em uma linha como o valor da visita foi montado.
 *
 * Sem isso o relatório é um número sem defesa: quem confere não sabe se os
 * R$ 180 vieram da tabela, da exceção do quinto chamado ou de um desconto.
 */
export function memoriaDeCalculo(repasse: Repasse): string {
  const partes: string[] = [];
  const { servicos, evidencias } = repasse;

  if (servicos.quantidade) {
    let texto = `faixa de ${servicos.quantidade} atuaç${servicos.quantidade === 1 ? 'ão' : 'ões'} = ${reais(servicos.faixaCents)}`;
    if (servicos.descobertos) {
      texto += ` (${servicos.descobertos} apareceu na loja`;
      texto += servicos.excecaoQuintoChamado ? ', faixa seguinte por não render nada)' : ')';
    }
    partes.push(texto);
    if (servicos.produtivos) {
      partes.push(`${servicos.produtivos} resolvida${servicos.produtivos === 1 ? '' : 's'} = ${reais(servicos.produtivosCents)}`);
    }
  }

  if (evidencias.quantidade) {
    partes.push(
      `${evidencias.quantidade} FSA${evidencias.quantidade === 1 ? '' : 's'} de evidência = ${reais(evidencias.baseCents)}`,
    );
  }

  // Improdutiva entra somando, com o valor que ela vale, e não como um abatimento
  // do que veio antes: é assim que a operação lê a categoria. Só atuação entra
  // aqui — evidência não tem improdutiva.
  if (repasse.improdutivas.quantidade) {
    partes.push(
      `${repasse.improdutivas.quantidade} improdutiva${repasse.improdutivas.quantidade === 1 ? '' : 's'} pela metade = ${reais(repasse.improdutivas.totalCents)}`,
    );
  }

  partes.push(`total ${reais(repasse.totalCents)}`);
  return partes.join('; ');
}

/**
 * Uma linha por FSA, repetindo os dados da visita.
 *
 * Repetir é de propósito: a planilha vai ser filtrada e ordenada por quem
 * recebe, e uma linha que só faz sentido junto da de cima se perde no caminho.
 */
export function linhasDoRelatorio(visitas: readonly VisitaDoRelatorio[]): LinhaDoRelatorio[] {
  return visitas.flatMap((visita) => {
    const calculo = memoriaDeCalculo(visita.repasse);
    const total = reais(visita.repasse.totalCents);
    const situacao = ROTULO_STATUS[visita.status];
    // As três categorias repetidas por linha, para a planilha ser somável por
    // qualquer recorte que quem recebe resolver filtrar.
    const categorias = {
      atuacaoVisita: reais(visita.repasse.servicos.produtivosCents),
      evidenciasVisita: reais(visita.repasse.evidencias.totalCents),
      improdutivasVisita: reais(visita.repasse.improdutivas.totalCents),
    };

    // Visita sem nenhuma FSA ainda assim aparece: sumir do relatório seria pior
    // do que mostrar uma linha vazia que a gerência vai estranhar.
    if (!visita.fsas.length) {
      return [
        {
          data: dia(visita.data),
          tecnico: visita.tecnico,
          grupo: visita.grupo ?? '',
          fsa: '',
          tipo: '',
          resolveu: '',
          motivo: '',
          observacao: '',
          calculo,
          ...categorias,
          totalVisita: total,
          situacao,
        },
      ];
    }

    return visita.fsas.map((fsa) => ({
      data: dia(visita.data),
      tecnico: visita.tecnico,
      grupo: visita.grupo ?? '',
      fsa: fsa.ticketKey,
      tipo: fsa.tipo === 'servico' ? 'Serviço' : fsa.tipo === 'evidencia' ? 'Evidência' : 'Sem classificação',
      resolveu: fsa.tipo ? (fsa.improdutiva ? 'Não' : 'Sim') : '',
      motivo: fsa.motivo ? (ROTULO_MOTIVO[fsa.motivo as MotivoImprodutivo] ?? fsa.motivo) : '',
      observacao: fsa.observacao ?? '',
      calculo,
      ...categorias,
      totalVisita: total,
      situacao,
    }));
  });
}

const CABECALHO = [
  'Data',
  'Técnico',
  'Grupo',
  'FSA',
  'Tipo',
  'Resolveu',
  'Motivo',
  'Observação',
  'Como foi calculado',
  'Atuação da visita',
  'Evidências da visita',
  'Improdutivas da visita',
  'Total da visita',
  'Situação',
] as const;

const celula = (valor: string) => `"${valor.replace(/"/g, '""')}"`;

/**
 * CSV no formato que o Excel brasileiro abre sem perguntar nada: ponto e
 * vírgula como separador e BOM na frente, senão os acentos viram lixo.
 */
export function paraCsv(linhas: readonly LinhaDoRelatorio[]): string {
  const corpo = linhas.map((linha) =>
    [
      linha.data,
      linha.tecnico,
      linha.grupo,
      linha.fsa,
      linha.tipo,
      linha.resolveu,
      linha.motivo,
      linha.observacao,
      linha.calculo,
      linha.atuacaoVisita,
      linha.evidenciasVisita,
      linha.improdutivasVisita,
      linha.totalVisita,
      linha.situacao,
    ]
      .map(celula)
      .join(';'),
  );
  return `﻿${[CABECALHO.map(celula).join(';'), ...corpo].join('\r\n')}`;
}
