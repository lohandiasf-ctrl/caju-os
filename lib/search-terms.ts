// A operação recebe listas de chamados prontas ("FSA-132030 | FSA-132032 |
// FSA-132034"), então a busca aceita vários termos de uma vez: casa o chamado
// que bater com qualquer um deles.

// Separadores explícitos (| , ; quebra de linha) sempre dividem. Espaço só
// divide quando todos os pedaços são códigos de chamado — senão "loja 441"
// viraria duas buscas e traria a loja errada junto.
export function searchTerms(query: string): string[] {
  const parts = query.split(/[|,;\n\r\t]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 1 && /\s/.test(parts[0])) {
    const words = parts[0].split(/\s+/);
    if (words.length > 1 && words.every(isTicketTerm)) return words;
  }
  return parts;
}

// "FSA-132030", "fsa132030" ou só "132030", como a operação escreve.
function isTicketTerm(word: string) {
  return /^(fsa-?)?\d{3,}$/.test(word);
}

export function matchesSearch(values: Array<string | null | undefined>, terms: string[]) {
  if (!terms.length) return true;
  const haystack = values.filter(Boolean).map((value) => value!.toLowerCase());
  return terms.some((term) => haystack.some((value) => value.includes(term)));
}
