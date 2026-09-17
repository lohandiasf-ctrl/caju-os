// O pull-to-refresh nativo do Chrome Android recarregava o app quando o dedo
// arrastava para baixo numa lista já no topo (a aba WhatsApp caía no
// "Verificando acesso..."). `overscroll-behavior: contain` no html/body não
// bastou em todos os aparelhos, então o gesto é barrado também no JS.
//
// Regra: só bloqueamos quando NADA na cadeia de scroll pode rolar para cima —
// exatamente o caso em que o navegador assumiria o gesto como refresh. Se
// alguma lista ainda tem conteúdo acima, o toque segue normal.

export type ScrollNode = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  overflowY: string;
  parent: ScrollNode | null;
};

const SCROLLABLE_OVERFLOW = ['auto', 'scroll', 'overlay'];

export function canScrollUp(node: ScrollNode | null): boolean {
  for (let current = node; current; current = current.parent) {
    const scrollable = SCROLLABLE_OVERFLOW.includes(current.overflowY)
      && current.scrollHeight > current.clientHeight;
    if (scrollable && current.scrollTop > 0) return true;
  }
  return false;
}
