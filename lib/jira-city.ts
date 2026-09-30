// Puro e sem import de valor (os testes rodam com strip-types).
const hasUf = (city: string) => /[-/,(]\s*[A-Za-z]{2}\)?\s*$/.test(city.trim());

// The city text field is the one the operation fills and trusts, so it wins;
// "Cidade / UF" (customfield_12317, a cascading select) fills in when the text is
// empty and supplies the UF, e.g. "Itabuna" -> "Itabuna - BA" (the WhatsApp group
// name needs it). Checked on FSA-133833: the text city was right, so preferring
// the select was a regression and was reverted.
export function cityWithUf(city: string | null, cascade: unknown): string | null {
  const parts = cascadingValues(cascade);
  const uf = parts.find((part) => /^[A-Z]{2}$/.test(part.toUpperCase()) && part.length === 2)?.toUpperCase() ?? null;
  const cascadeCity = parts.find((part) => part.length > 2) ?? null;
  const base = city ?? cascadeCity;
  if (!base) return null;
  if (!uf || hasUf(base)) return base;
  return `${base} - ${uf}`;
}

function cascadingValues(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const node = value as { value?: unknown; child?: unknown };
  const own = typeof node.value === 'string' && node.value.trim() ? [node.value.trim()] : [];
  return [...own, ...cascadingValues(node.child)];
}
