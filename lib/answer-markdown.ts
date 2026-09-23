// O modelo responde em Markdown simples (tabela, lista, negrito). O painel
// da Caju IA mostrava esse texto cru: `|` e `**` na tela, e tabela quebrando
// linha no meio da célula. Aqui o texto vira blocos que a tela sabe desenhar.
// Só o subconjunto que o assistente usa; o resto passa como parágrafo.

export type AnswerBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; header: string[] | null; rows: string[][] };

export type InlineSegment = { text: string; bold: boolean };

const TABLE_LINE = /^\s*\|.*\|?\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
const HEADING = /^\s*#{1,4}\s+(.*)$/;

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

export function answerBlocks(text: string): AnswerBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (TABLE_LINE.test(line) && line.includes('|', line.indexOf('|') + 1)) {
      flush();
      const group: string[] = [];
      while (index < lines.length && TABLE_LINE.test(lines[index])) group.push(lines[index++]);
      index -= 1;
      const hasHeader = group.length > 1 && TABLE_SEPARATOR.test(group[1]);
      const body = group.filter((row) => !TABLE_SEPARATOR.test(row)).map(cells);
      blocks.push(hasHeader ? { type: 'table', header: body[0], rows: body.slice(1) } : { type: 'table', header: null, rows: body });
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      flush();
      const items = [item[1]];
      while (index + 1 < lines.length && LIST_ITEM.test(lines[index + 1])) items.push(lines[++index].match(LIST_ITEM)![1]);
      blocks.push({ type: 'list', items });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', text: heading[1] });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

// `**negrito**` vira segmento em negrito; asterisco solto fica como está.
export function inlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*(.+?)\*\*/g)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), bold: false });
    segments.push({ text: match[1], bold: true });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments;
}
