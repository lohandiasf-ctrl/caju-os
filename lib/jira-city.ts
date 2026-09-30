// Puro e sem import de valor (os testes rodam com strip-types).
const hasUf = (city: string) => /[-/,(]\s*[A-Za-z]{2}\)?\s*$/.test(city.trim());

// "Cidade / UF" (customfield_12317) is a cascading select with both levels and
// is the reliable source: the free-text city field (customfield_11994) is typed
// by the requester and sometimes holds the street instead (FSA-133833: street
// "Gandu", city Jaboatão dos Guararapes, and the offer went to technicians in
// Gandu/BA). So the select wins whenever it has a city; the text is the fallback.
// The UF is appended when the chosen city has none, e.g. "Itabuna" -> "Itabuna - BA"
// (the WhatsApp group name needs it).
export function cityWithUf(city: string | null, cascade: unknown): string | null {
  const parts = cascadingValues(cascade);
  const uf = parts.find((part) => /^[A-Z]{2}$/.test(part.toUpperCase()) && part.length === 2)?.toUpperCase() ?? null;
  const cascadeCity = parts.find((part) => part.length > 2) ?? null;
  const base = cascadeCity ?? city;
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
