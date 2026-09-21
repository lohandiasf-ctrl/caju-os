// Quem é quem no cadastro de técnicos.
//
// O cadastro chegou a ter 1.794 linhas para ~900 pessoas: a importação casava o
// técnico só pelo e-mail, e quem não tem e-mail virava uma linha nova a cada
// planilha importada. Estas regras decidem quando duas linhas são a mesma
// pessoa — tanto para unificar o que já duplicou quanto para a importação não
// duplicar de novo.
//
// O CPF é a prova, mas não sozinho: há CPF de parente cadastrado em outra
// pessoa (mesmo CPF, nomes diferentes), e há CPF com um dígito errado (mesmo
// nome, CPFs diferentes). Por isso CPF e nome são conferidos juntos.

export type TecnicoDoCadastro = {
  id: number;
  name: string;
  cpf: string | null;
  email: string | null;
  baseCity: string;
  createdAt: string;
};

/** Nome comparável: sem acento, caixa, espaço repetido nem o prefixo "APAGAR -". */
export function nomeComparavel(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Alguém já marcou cópias para apagar escrevendo no nome; é a mesma pessoa.
    .replace(/^\s*apagar\s*[-–—:]?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alguém já escreveu "APAGAR" no nome desta linha: ela é a cópia, não a pessoa. */
export function marcadaParaApagar(nome: string): boolean {
  return /^\s*apagar\b/i.test(nome);
}

export function cidadeComparavel(cidade: string): string {
  return nomeComparavel(cidade);
}

/** Só os dígitos do CPF; o cadastro tem "123.456.789-00" e "12345678900". */
export function digitosDoCpf(cpf: string | null | undefined): string {
  return (cpf ?? '').replace(/\D/g, '');
}

/** CPF com os dois dígitos verificadores batendo. */
export function cpfValido(cpf: string | null | undefined): boolean {
  const d = digitosDoCpf(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

function digitosDiferentes(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let diferentes = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diferentes += 1;
  return diferentes;
}

export type Conflito = { motivo: string; ids: number[] };
export type Unificacao = { manter: number; remover: number[] };

/**
 * Agrupa as linhas que são a mesma pessoa.
 *
 * São a mesma pessoa:
 * - mesmo CPF **e** mesmo nome (acento, caixa e "APAGAR -" não contam);
 * - mesmo nome **e** mesma cidade, quando os CPFs só diferem num dígito e um
 *   deles é inválido — erro de digitação, não outra pessoa;
 * - mesmo nome e mesma cidade, com a linha sem CPF, quando o resto do grupo
 *   tem um CPF só.
 *
 * Não se decide sozinho, e vai para `conflitos`:
 * - mesmo CPF com nomes diferentes (CPF de parente, ou erro de cadastro);
 * - mesmo nome e cidade com CPFs válidos diferentes (homônimos).
 */
export function planejarUnificacao(tecnicos: readonly TecnicoDoCadastro[]): {
  unificacoes: Unificacao[];
  conflitos: Conflito[];
} {
  const pai = new Map<number, number>(tecnicos.map((t) => [t.id, t.id]));
  const raiz = (id: number): number => {
    let r = id;
    while (pai.get(r) !== r) r = pai.get(r)!;
    pai.set(id, r);
    return r;
  };
  const unir = (a: number, b: number) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) pai.set(Math.max(ra, rb), Math.min(ra, rb));
  };
  const conflitos: Conflito[] = [];

  // 1. Mesmo CPF e mesmo nome.
  const porCpf = new Map<string, TecnicoDoCadastro[]>();
  for (const t of tecnicos) {
    const d = digitosDoCpf(t.cpf);
    if (!d) continue;
    porCpf.set(d, [...(porCpf.get(d) ?? []), t]);
  }
  for (const grupo of porCpf.values()) {
    const porNome = new Map<string, TecnicoDoCadastro[]>();
    for (const t of grupo) porNome.set(nomeComparavel(t.name), [...(porNome.get(nomeComparavel(t.name)) ?? []), t]);
    for (const mesmos of porNome.values()) mesmos.slice(1).forEach((t) => unir(mesmos[0].id, t.id));
    if (porNome.size > 1) {
      conflitos.push({ motivo: 'mesmo CPF com nomes diferentes', ids: grupo.map((t) => t.id).sort((a, b) => a - b) });
    }
  }

  // 2. Mesmo nome e mesma cidade: erro de um dígito no CPF, ou linha sem CPF.
  const porNomeCidade = new Map<string, TecnicoDoCadastro[]>();
  for (const t of tecnicos) {
    const chave = `${nomeComparavel(t.name)}|${cidadeComparavel(t.baseCity)}`;
    porNomeCidade.set(chave, [...(porNomeCidade.get(chave) ?? []), t]);
  }
  for (const grupo of porNomeCidade.values()) {
    if (grupo.length < 2) continue;
    const cpfs = [...new Set(grupo.map((t) => digitosDoCpf(t.cpf)).filter(Boolean))];
    const validos = cpfs.filter((c) => cpfValido(c));
    const mesmaPessoa =
      cpfs.length <= 1 ||
      (validos.length === 1 &&
        cpfs.filter((c) => c !== validos[0]).every((c) => digitosDiferentes(c, validos[0]) <= 1));
    if (mesmaPessoa) {
      grupo.slice(1).forEach((t) => unir(grupo[0].id, t.id));
    } else {
      conflitos.push({ motivo: 'mesmo nome e cidade com CPFs diferentes', ids: grupo.map((t) => t.id).sort((a, b) => a - b) });
    }
  }

  // Quem fica: nunca uma linha que alguém já marcou "APAGAR" no nome; depois a
  // com e-mail (a única chave que a importação antiga reconhecia), a de CPF
  // válido e a mais antiga. O e-mail de uma cópia marcada passa para a mantida.
  const componentes = new Map<number, TecnicoDoCadastro[]>();
  for (const t of tecnicos) componentes.set(raiz(t.id), [...(componentes.get(raiz(t.id)) ?? []), t]);
  const unificacoes: Unificacao[] = [];
  for (const membros of componentes.values()) {
    if (membros.length < 2) continue;
    const ordem = [...membros].sort(
      (a, b) =>
        Number(marcadaParaApagar(a.name)) - Number(marcadaParaApagar(b.name)) ||
        Number(!!b.email) - Number(!!a.email) ||
        Number(cpfValido(b.cpf)) - Number(cpfValido(a.cpf)) ||
        a.id - b.id,
    );
    unificacoes.push({ manter: ordem[0].id, remover: ordem.slice(1).map((t) => t.id).sort((a, b) => a - b) });
  }
  unificacoes.sort((a, b) => a.manter - b.manter);
  return { unificacoes, conflitos };
}

/**
 * O técnico já cadastrado que é esta linha da planilha, se houver.
 *
 * A importação usa isto para atualizar em vez de inserir. A ordem é a da força
 * da prova: CPF com mesmo nome, depois e-mail, depois nome e cidade — este só
 * quando a linha não traz CPF, para um homônimo não sobrescrever outra pessoa.
 */
export function acharNoCadastro(
  cadastro: readonly TecnicoDoCadastro[],
  linha: { name: string; cpf?: string | null; email?: string | null; city: string },
): TecnicoDoCadastro | null {
  const nome = nomeComparavel(linha.name);
  const cpf = digitosDoCpf(linha.cpf);
  if (cpf) {
    const porCpf = cadastro.find((t) => digitosDoCpf(t.cpf) === cpf && nomeComparavel(t.name) === nome);
    if (porCpf) return porCpf;
  }
  const email = (linha.email ?? '').trim().toLowerCase();
  if (email) {
    const porEmail = cadastro.find((t) => (t.email ?? '').toLowerCase() === email);
    if (porEmail) return porEmail;
  }
  if (!cpf) {
    const cidade = cidadeComparavel(linha.city);
    const mesmos = cadastro.filter((t) => nomeComparavel(t.name) === nome && cidadeComparavel(t.baseCity) === cidade);
    if (mesmos.length === 1) return mesmos[0];
  }
  return null;
}
