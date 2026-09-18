// Regra de repasse ao técnico.
//
// A primeira visita vale R$ 120 e **não se altera**: é o valor base acordado
// da operação, não uma configuração. Antes disso a tela deixava editar as duas
// faixas, e o padrão era R$ 70.
export const FIRST_VISIT_CENTS = 12_000;

// Repasse do técnico no período: a primeira visita pelo valor base, as
// seguintes pela faixa que a gerência configura.
export function payoutCents(tickets: number, additionalCents: number): number {
  const visitas = Math.max(0, Math.floor(tickets));
  if (!visitas) return 0;
  return FIRST_VISIT_CENTS + (visitas - 1) * Math.max(0, additionalCents);
}
