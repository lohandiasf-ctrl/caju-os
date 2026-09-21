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

/**
 * Separa o que o grupo rendeu entre quem resolveu e quem não.
 *
 * Improdutiva não é desconto: é uma categoria à parte, com valor próprio (uma
 * atuação de R$ 70 que não saiu vale R$ 35, e é assim que ela aparece). A parte
 * improdutiva sai da subtração em vez de ter arredondamento próprio, senão as
 * duas metades podem somar um centavo a mais ou a menos que o total do grupo.
 */
function repartir(baseCents: number, total: number, improdutivas: number) {
  if (!total) return { totalCents: 0, produtivasCents: 0, improdutivasCents: 0 };
  const totalCents = aplicarImprodutivas(baseCents, total, improdutivas);
  const produtivasCents = Math.round((baseCents * (total - improdutivas)) / total);
  return { totalCents, produtivasCents, improdutivasCents: totalCents - produtivasCents };
}

export type Repasse = {
  // Atuação: a FSA em que o técnico resolveu alguma coisa. `quantidade` conta
  // todas, inclusive as improdutivas, porque é ela que define a faixa de preço;
  // `produtivosCents` é só o que as resolvidas renderam.
  servicos: {
    quantidade: number;
    produtivos: number;
    descobertos: number;
    improdutivos: number;
    faixaCents: number;
    excecaoQuintoChamado: boolean;
    produtivosCents: number;
    improdutivosCents: number;
    totalCents: number;
  };
  evidencias: {
    quantidade: number;
    produtivas: number;
    improdutivas: number;
    baseCents: number;
    produtivasCents: number;
    improdutivasCents: number;
    totalCents: number;
  };
  // A terceira categoria da leitura: reúne o que as improdutivas renderam, de
  // atuação e de evidência. Não é um desconto a subtrair — é uma linha que soma
  // como as outras duas, e as três fecham o total.
  improdutivas: {
    quantidade: number;
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

  const porServico = repartir(faixaCents, servicos.length, servicosImprodutivos);
  const porEvidencia = repartir(evidenciasBaseCents, evidencias.length, evidenciasImprodutivas);

  const cheio = faixaCents + evidenciasBaseCents;
  const totalCents = porServico.totalCents + porEvidencia.totalCents;

  return {
    servicos: {
      quantidade: servicos.length,
      produtivos: servicos.length - servicosImprodutivos,
      descobertos,
      improdutivos: servicosImprodutivos,
      faixaCents,
      excecaoQuintoChamado,
      produtivosCents: porServico.produtivasCents,
      improdutivosCents: porServico.improdutivasCents,
      totalCents: porServico.totalCents,
    },
    evidencias: {
      quantidade: evidencias.length,
      produtivas: evidencias.length - evidenciasImprodutivas,
      improdutivas: evidenciasImprodutivas,
      baseCents: evidenciasBaseCents,
      produtivasCents: porEvidencia.produtivasCents,
      improdutivasCents: porEvidencia.improdutivasCents,
      totalCents: porEvidencia.totalCents,
    },
    improdutivas: {
      quantidade: servicosImprodutivos + evidenciasImprodutivas,
      totalCents: porServico.improdutivasCents + porEvidencia.improdutivasCents,
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
