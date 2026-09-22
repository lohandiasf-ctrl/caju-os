// Nome do grupo de chamados: cidade e número da loja.
//
// O nome sai dos próprios chamados, e não de um campo livre: quem olha a fila
// precisa reconhecer o grupo pelo lugar ("Candeias — Loja L497"), e um nome
// digitado à mão ("gvnd") não diz nada a mais ninguém.

type ChamadoDoGrupo = { store?: string | null; city?: string | null };

const TAMANHO_MAXIMO = 120;
const SEM_NOME = 'Chamados agrupados';

/**
 * Número da loja a partir do texto que o kanban mostra.
 *
 * O kanban escreve "Código da loja: L443"; o Jira às vezes manda "Loja L443" ou
 * só "L443". Texto que não é código (nome de loja por extenso) segue como veio;
 * "Loja não informada" não vira nome de grupo.
 */
export function numeroDaLoja(store: string | null | undefined): string | null {
  const texto = (store ?? '').replace(/^c[óo]digo da loja:?\s*/i, '').replace(/^loja\s+/i, '').trim();
  if (!texto || /^n[ãa]o informada$/i.test(texto)) return null;
  return texto;
}

/**
 * Cidade do chamado, ou nada.
 *
 * Quando o Jira não informa a cidade, o kanban preenche o campo com "Atualizado
 * em …" para o card não ficar vazio. Isso não é cidade e não pode ir para o nome.
 */
export function cidadeDoChamado(city: string | null | undefined): string | null {
  const texto = (city ?? '').trim();
  if (!texto || /^atualizado em/i.test(texto)) return null;
  return texto;
}

const chaveDaCidade = (cidade: string) =>
  cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

/**
 * Cidades diferentes entre os chamados, escritas como no primeiro chamado de
 * cada uma. "Nazaré da Mata" e "NAZARE DA MATA" contam como a mesma. Chamado
 * sem cidade não entra: não há com o que comparar.
 */
export function cidadesDosChamados(chamados: readonly ChamadoDoGrupo[]): string[] {
  const vistas = new Map<string, string>();
  for (const chamado of chamados) {
    const cidade = cidadeDoChamado(chamado.city);
    if (cidade && !vistas.has(chaveDaCidade(cidade))) vistas.set(chaveDaCidade(cidade), cidade);
  }
  return [...vistas.values()];
}

/**
 * Um grupo é uma visita: técnico, dia e cidade. Chamados de cidades diferentes
 * são visitas diferentes e não podem dividir a faixa de preço.
 */
export function erroDeCidades(chamados: readonly ChamadoDoGrupo[]): string | null {
  const cidades = cidadesDosChamados(chamados);
  if (cidades.length < 2) return null;
  const lista = `${cidades.slice(0, -1).join(', ')} e ${cidades.at(-1)}`;
  return `Um grupo é uma visita, então os chamados precisam ser da mesma cidade. Estes são de ${lista}.`;
}

/**
 * "Candeias — Loja L497"; com mais de uma loja na cidade, "Candeias — Lojas
 * L497, L500"; com mais de uma cidade, as partes separadas por " · ".
 *
 * A ordem é a da seleção, para o nome começar pelo que a pessoa marcou primeiro.
 */
export function nomeDoGrupo(chamados: readonly ChamadoDoGrupo[]): string {
  const porCidade = new Map<string, string[]>();
  for (const chamado of chamados) {
    const cidade = cidadeDoChamado(chamado.city) ?? '';
    const loja = numeroDaLoja(chamado.store);
    const lojas = porCidade.get(cidade) ?? [];
    if (loja && !lojas.includes(loja)) lojas.push(loja);
    porCidade.set(cidade, lojas);
  }

  const partes = [...porCidade].flatMap(([cidade, lojas]) => {
    const rotuloLojas = lojas.length ? `${lojas.length === 1 ? 'Loja' : 'Lojas'} ${lojas.join(', ')}` : '';
    if (cidade && rotuloLojas) return [`${cidade} — ${rotuloLojas}`];
    return cidade || rotuloLojas ? [cidade || rotuloLojas] : [];
  });

  const nome = partes.join(' · ') || SEM_NOME;
  return nome.length > TAMANHO_MAXIMO ? `${nome.slice(0, TAMANHO_MAXIMO - 1)}…` : nome;
}
