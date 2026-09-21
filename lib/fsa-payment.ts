// Repasse ao técnico por FSA atendida numa visita.
//
// Nada aqui volta para o Jira: a classificação é do Caju, e o valor é sempre
// recalculado a partir das FSAs, nunca guardado como total solto. Assim o
// técnico pode reclassificar uma FSA a qualquer momento sem deixar rastro de
// um valor que não fecha mais com as regras.

export type TipoFsa = 'servico' | 'evidencia';

export const MOTIVOS_IMPRODUTIVO = [
  'gerente-recusou',
  'defeito-maior',
  'problema-impeditivo',
  'loja-fechada',
  'tempo-excedido',
  'loja-fechando',
] as const;

export type MotivoImprodutivo = (typeof MOTIVOS_IMPRODUTIVO)[number];

export type Fsa = {
  tipo: TipoFsa;
  // Improdutiva = o técnico não conseguiu resolver. Exige motivo.
  improdutiva?: boolean;
  motivo?: MotivoImprodutivo;
  observacao?: string;
  // Apareceu durante a visita, não estava no agendamento. Só muda o cálculo
  // no caso da exceção do quinto chamado, abaixo.
  descobertaNaLoja?: boolean;
};

// Faixa de serviços, em centavos. Repare que 4 e 5 pagam o mesmo: é proposital
// no acordo, e é justamente o que cria a exceção tratada em faixaServicos().
const FAIXA_SERVICOS_CENTS = [0, 7_000, 10_000, 12_000, 15_000, 15_000];

// Da sexta em diante a faixa é linear: R$ 30 por serviço (6 = R$ 180,
// 11 = R$ 330, 12 = R$ 360...). Não há teto.
const SERVICO_ADICIONAL_CENTS = 3_000;

// Evidência avulsa: R$ 70 cobrem as 14 primeiras, depois R$ 5 por FSA.
const EVIDENCIA_BASE_CENTS = 7_000;
const EVIDENCIA_BASE_ATE = 14;
const EVIDENCIA_ADICIONAL_CENTS = 500;

/** Valor de tabela para uma quantidade de FSAs de serviço. */
export function faixaServicosCents(quantidade: number): number {
  const qtd = Math.max(0, Math.floor(quantidade));
  if (!qtd) return 0;
  return FAIXA_SERVICOS_CENTS[qtd] ?? qtd * SERVICO_ADICIONAL_CENTS;
}

/**
 * Valor dos serviços já considerando os que apareceram na loja.
 *
 * Serviço novo não paga bônus fixo: o total é recalculado pela tabela e o
 * técnico fica com a diferença. Como a tabela repete R$ 150 em 4 e em 5, um
 * técnico agendado para 4 que descobre 1 na loja teria diferença zero — faria
 * o serviço a mais de graça. Quando o recálculo não rende nada, paga-se a
 * faixa seguinte. Com 2 serviços novos a exceção não aparece, porque 6 já
 * valem R$ 180 por tabela.
 */
function baseServicosCents(total: number, descobertos: number): {
  cents: number;
  excecaoQuintoChamado: boolean;
} {
  const cents = faixaServicosCents(total);
  if (descobertos > 0) {
    const agendados = Math.max(0, total - descobertos);
    if (agendados > 0 && cents === faixaServicosCents(agendados)) {
      return { cents: faixaServicosCents(total + 1), excecaoQuintoChamado: true };
    }
  }
  return { cents, excecaoQuintoChamado: false };
}

/**
 * Valor das FSAs de evidência.
 *
 * Conta por FSA, nunca por foto: uma FSA com dez comprovantes continua sendo
 * uma evidência. Sozinhas elas têm piso de R$ 70; acompanhadas de serviço
 * valem R$ 5 cada, porque o piso já está pago pela faixa de serviço.
 */
export function evidenciasCents(quantidade: number, houveServico: boolean): number {
  const qtd = Math.max(0, Math.floor(quantidade));
  if (!qtd) return 0;
  if (houveServico) return qtd * EVIDENCIA_ADICIONAL_CENTS;
  if (qtd <= EVIDENCIA_BASE_ATE) return EVIDENCIA_BASE_CENTS;
  return EVIDENCIA_BASE_CENTS + (qtd - EVIDENCIA_BASE_ATE) * EVIDENCIA_ADICIONAL_CENTS;
}

// Improdutiva vale metade. O desconto é proporcional dentro do grupo: a faixa
// é do conjunto, não de cada FSA, então divide-se o valor do grupo pela
// quantidade antes de cortar ao meio a parte de quem não resolveu.
function aplicarImprodutivas(baseCents: number, total: number, improdutivas: number): number {
  if (!total) return 0;
  const produtivas = total - improdutivas;
  return Math.round((baseCents * (produtivas + improdutivas / 2)) / total);
}

export type Repasse = {
  servicos: {
    quantidade: number;
    descobertos: number;
    improdutivos: number;
    faixaCents: number;
    excecaoQuintoChamado: boolean;
    totalCents: number;
  };
  evidencias: {
    quantidade: number;
    improdutivas: number;
    baseCents: number;
    totalCents: number;
  };
  descontoImprodutivoCents: number;
  totalCents: number;
};

/** Lista os problemas que impedem o cálculo, para a tela avisar antes de salvar. */
export function validarFsas(fsas: readonly Fsa[]): string[] {
  const erros: string[] = [];
  fsas.forEach((fsa, i) => {
    if (fsa.tipo !== 'servico' && fsa.tipo !== 'evidencia') {
      erros.push(`FSA ${i + 1}: precisa ser classificada como serviço ou evidência.`);
    }
    if (fsa.improdutiva && !fsa.motivo) {
      erros.push(`FSA ${i + 1}: marcada como não resolvida, mas sem motivo.`);
    }
  });
  return erros;
}

/**
 * Repasse de uma visita. Recebe as FSAs como estão agora — a função não sabe
 * o que mudou desde o agendamento, só quais apareceram na loja.
 *
 * Uma visita inteira improdutiva é válida e paga metade; o que não é válido é
 * marcar improdutiva sem dizer o porquê.
 */
export function calcularRepasse(fsas: readonly Fsa[]): Repasse {
  const erros = validarFsas(fsas);
  if (erros.length) throw new Error(erros.join(' '));

  const servicos = fsas.filter((f) => f.tipo === 'servico');
  const evidencias = fsas.filter((f) => f.tipo === 'evidencia');

  const descobertos = servicos.filter((f) => f.descobertaNaLoja).length;
  const servicosImprodutivos = servicos.filter((f) => f.improdutiva).length;
  const evidenciasImprodutivas = evidencias.filter((f) => f.improdutiva).length;

  const { cents: faixaCents, excecaoQuintoChamado } = baseServicosCents(
    servicos.length,
    descobertos,
  );
  const evidenciasBaseCents = evidenciasCents(evidencias.length, servicos.length > 0);

  const servicosTotal = aplicarImprodutivas(faixaCents, servicos.length, servicosImprodutivos);
  const evidenciasTotal = aplicarImprodutivas(
    evidenciasBaseCents,
    evidencias.length,
    evidenciasImprodutivas,
  );

  const cheio = faixaCents + evidenciasBaseCents;
  const totalCents = servicosTotal + evidenciasTotal;

  return {
    servicos: {
      quantidade: servicos.length,
      descobertos,
      improdutivos: servicosImprodutivos,
      faixaCents,
      excecaoQuintoChamado,
      totalCents: servicosTotal,
    },
    evidencias: {
      quantidade: evidencias.length,
      improdutivas: evidenciasImprodutivas,
      baseCents: evidenciasBaseCents,
      totalCents: evidenciasTotal,
    },
    descontoImprodutivoCents: cheio - totalCents,
    totalCents,
  };
}

export type RepasseDoDia = {
  visitas: Repasse[];
  consolidado: Repasse;
};

/**
 * Várias visitas no mesmo dia.
 *
 * O consolidado não é a soma das visitas: as FSAs do dia entram numa faixa só,
 * porque 4 + 3 + 2 serviços pagam como 9 e não como três visitas pequenas. As
 * visitas continuam detalhadas para o técnico conferir loja a loja.
 */
export function calcularRepasseDoDia(visitas: readonly (readonly Fsa[])[]): RepasseDoDia {
  return {
    visitas: visitas.map(calcularRepasse),
    consolidado: calcularRepasse(visitas.flat()),
  };
}
