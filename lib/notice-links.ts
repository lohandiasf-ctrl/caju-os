// Avisos do sistema no grupo "Distribuição" ("✅ FSA-1, FSA-2 (L158) aceito por
// Fulano pelo WhatsApp."): separa o texto em partes clicáveis — o chamado abre o
// chamado, a loja abre o histórico da loja e o técnico abre a conversa dele.

export type NoticePart =
  | { type: 'text'; value: string }
  | { type: 'ticket'; value: string }
  | { type: 'store'; value: string }
  | { type: 'technician'; value: string };

export const SYSTEM_NOTICE_SENDER = 'distribuicao@caju-os';

export function noticeParts(text: string): NoticePart[] {
  const hits: Array<{ start: number; end: number; part: NoticePart }> = [];
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]+-\d{3,}\b/g)) hits.push({ start: m.index!, end: m.index! + m[0].length, part: { type: 'ticket', value: m[0] } });
  for (const m of text.matchAll(/\((L\d+)\)/g)) {
    const start = m.index! + 1;
    hits.push({ start, end: start + m[1].length, part: { type: 'store', value: m[1] } });
  }
  const tech = text.match(/aceito por (.+?) pelo WhatsApp/);
  if (tech) {
    const start = tech.index! + 'aceito por '.length;
    hits.push({ start, end: start + tech[1].length, part: { type: 'technician', value: tech[1] } });
  }
  hits.sort((a, b) => a.start - b.start);
  const parts: NoticePart[] = [];
  let at = 0;
  for (const hit of hits) {
    if (hit.start < at) continue;
    if (hit.start > at) parts.push({ type: 'text', value: text.slice(at, hit.start) });
    parts.push(hit.part);
    at = hit.end;
  }
  if (at < text.length) parts.push({ type: 'text', value: text.slice(at) });
  return parts;
}
