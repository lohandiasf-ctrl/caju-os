// Técnico do grupo de repasse digitado pelo nome, sem estar na lista.
//
// O grupo continua ligado a um cadastro (`fsa_groups.technician_id`), porque
// é por ele que o relatório soma o que cada pessoa recebe. Quando o nome não
// está na lista, o servidor procura um cadastro com o mesmo nome — ignorando
// acento, maiúscula e espaço, a variação que o Jira produz ("Carlos Antonio" e
// "CARLOS ANTÔNIO") — e só cria um cadastro mínimo se não achar nenhum.

export const TECNICO_NOME_MAX = 80;

/** Espaços extras fora: "  ana   souza " → "ana souza". */
export function nomeDoTecnico(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Chave de comparação: sem acento, minúscula, um espaço entre palavras. */
export function chaveDoTecnico(value: string): string {
  return nomeDoTecnico(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

/** Mensagem de erro para o nome digitado, ou null quando serve. */
export function erroDoNomeDoTecnico(value: string): string | null {
  const nome = nomeDoTecnico(value);
  if (!nome) return 'Informe o técnico que vai atender.';
  if (nome.length > TECNICO_NOME_MAX) return `Use até ${TECNICO_NOME_MAX} caracteres no nome do técnico.`;
  if (!/\p{L}{2,}/u.test(nome)) return 'Escreva o nome do técnico.';
  return null;
}

/** Cadastro com o mesmo nome (pela chave), se houver. */
export function tecnicoComMesmoNome<T extends { name: string }>(cadastro: readonly T[], nome: string): T | null {
  const chave = chaveDoTecnico(nome);
  return cadastro.find((tecnico) => chaveDoTecnico(tecnico.name) === chave) ?? null;
}

/** "Nova Cruz/RN" → { cidade: "Nova Cruz", uf: "RN" }; sem UF, uf vazia. */
export function cidadeEUf(value: string | null | undefined): { cidade: string; uf: string } {
  const texto = (value ?? '').trim();
  const match = texto.match(/^(.*?)\s*[/-]\s*([A-Za-z]{2})$/);
  if (match) return { cidade: match[1].trim(), uf: match[2].toUpperCase() };
  return { cidade: texto, uf: '' };
}
