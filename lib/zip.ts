// Leitura de arquivo ZIP no navegador.
//
// O laudo do técnico costuma chegar como um .zip com as fotos dentro, e a
// visualização de anexo dizia só "este arquivo não possui visualização" —
// quem quisesse conferir a evidência tinha que baixar, extrair e abrir fora
// do sistema.
//
// Sem biblioteca: o formato ZIP é simples de percorrer, e o próprio navegador
// descomprime com `DecompressionStream('deflate-raw')`.

export type ZipEntry = {
  name: string;
  size: number;
  compressedSize: number;
  // 0 = guardado como está, 8 = deflate. Os outros métodos são raros e ficam
  // de fora com uma mensagem, em vez de devolver bytes errados.
  method: number;
  offset: number;
};

const SIGNATURE_END = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;
const STORED = 0;
const DEFLATE = 8;

// O diretório central fica no fim do arquivo, depois de um comentário de
// tamanho variável — daí a busca de trás para frente.
function findEndRecord(view: DataView): number {
  const start = Math.max(0, view.byteLength - 66_000);
  for (let at = view.byteLength - 22; at >= start; at -= 1) {
    if (view.getUint32(at, true) === SIGNATURE_END) return at;
  }
  return -1;
}

export function readZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const end = findEndRecord(view);
  if (end === -1) return [];
  const total = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder('utf-8');
  for (let index = 0; index < total; index += 1) {
    if (at + 46 > view.byteLength || view.getUint32(at, true) !== SIGNATURE_CENTRAL) break;
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, at + 46, nameLength));
    // Pastas entram no índice como nomes terminados em barra; não são arquivo.
    if (!name.endsWith('/')) entries.push({ name, size, compressedSize, method, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// O cabeçalho local repete nome e extras com tamanhos próprios, então o início
// dos dados só se sabe lendo ele.
function dataStart(view: DataView, entry: ZipEntry): number {
  if (view.getUint32(entry.offset, true) !== SIGNATURE_LOCAL) return -1;
  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  return entry.offset + 30 + nameLength + extraLength;
}

export async function extractZipEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const start = dataStart(view, entry);
  if (start === -1) throw new Error('Arquivo corrompido dentro do ZIP.');
  const raw = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === STORED) return raw;
  if (entry.method !== DEFLATE) throw new Error('Este arquivo usa uma compressão que o navegador não abre.');

  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
};

// O ZIP não guarda o tipo do arquivo, só o nome.
export function zipEntryMime(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_TYPES[extension]) return IMAGE_TYPES[extension];
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'txt') return 'text/plain';
  return 'application/octet-stream';
}

export function isViewableInZip(name: string): boolean {
  const mime = zipEntryMime(name);
  return mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('video/');
}

// Nome para mostrar: o ZIP do laudo costuma vir com pastas dentro, e o
// caminho inteiro não cabe na lista.
export function zipEntryLabel(name: string): string {
  return name.split('/').pop() || name;
}
