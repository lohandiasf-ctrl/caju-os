// Empilha no kanban os chamados que estão no mesmo grupo de repasse.
//
// Quem agrupa quatro FSAs da mesma loja não quer ver quatro cards soltos na
// coluna: é um atendimento só. A pilha ocupa o lugar de um card e abre as quatro
// ao clicar.

export type VinculoDeGrupo = {
  ticketKey: string;
  groupId: number;
  nome: string | null;
  tecnico: string;
};

export type EntradaDoKanban<T> =
  | { tipo: 'chamado'; chamado: T }
  | { tipo: 'pilha'; grupo: VinculoDeGrupo; chamados: T[] };

/**
 * Troca, numa coluna, os chamados do mesmo grupo por uma pilha.
 *
 * A pilha só existe com dois ou mais chamados do grupo **na mesma coluna**. Se
 * um deles mudou de etapa — foi para "aguardando spare" enquanto os outros
 * seguem em campo —, ele aparece sozinho onde está: a pilha mostra onde cada
 * chamado está de fato, e não onde o grupo nasceu.
 *
 * A ordem da coluna é preservada: a pilha entra no lugar do primeiro chamado do
 * grupo, para ela não pular de posição quando é montada.
 */
export function empilhar<T extends { id: string }>(
  chamados: readonly T[],
  vinculos: ReadonlyMap<string, VinculoDeGrupo>,
): EntradaDoKanban<T>[] {
  const porGrupo = new Map<number, T[]>();
  for (const chamado of chamados) {
    const vinculo = vinculos.get(chamado.id);
    if (!vinculo) continue;
    const lista = porGrupo.get(vinculo.groupId) ?? [];
    lista.push(chamado);
    porGrupo.set(vinculo.groupId, lista);
  }

  const entradas: EntradaDoKanban<T>[] = [];
  const jaEmpilhados = new Set<number>();
  for (const chamado of chamados) {
    const vinculo = vinculos.get(chamado.id);
    const irmaos = vinculo ? porGrupo.get(vinculo.groupId) : undefined;
    if (!vinculo || !irmaos || irmaos.length < 2) {
      entradas.push({ tipo: 'chamado', chamado });
      continue;
    }
    if (jaEmpilhados.has(vinculo.groupId)) continue;
    jaEmpilhados.add(vinculo.groupId);
    entradas.push({ tipo: 'pilha', grupo: vinculo, chamados: irmaos });
  }
  return entradas;
}
