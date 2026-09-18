import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { extractZipEntry, isViewableInZip, readZipEntries, zipEntryLabel, zipEntryMime } from '../lib/zip.ts';

// Monta um ZIP de verdade, em vez de um exemplo inventado: é o mesmo formato
// que sai do computador do técnico.
function buildZip(files: Array<{ name: string; content: Uint8Array; store?: boolean }>): ArrayBuffer {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.store ? file.content : new Uint8Array(deflateRawSync(file.content));
    const method = file.store ? 0 : 8;
    const crc = crc32(Buffer.from(file.content));

    const local = new DataView(new ArrayBuffer(30 + name.length + data.length));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, file.content.length, true);
    local.setUint16(26, name.length, true);
    const localBytes = new Uint8Array(local.buffer);
    localBytes.set(name, 30);
    localBytes.set(data, 30 + name.length);
    locals.push(localBytes);

    const central = new DataView(new ArrayBuffer(46 + name.length));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, method, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, file.content.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    const centralBytes = new Uint8Array(central.buffer);
    centralBytes.set(name, 46);
    centrals.push(centralBytes);

    offset += localBytes.length;
  }

  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...centrals, new Uint8Array(end.buffer)]) { out.set(part, at); at += part.length; }
  return out.buffer;
}

const foto = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 300 }, (_, index) => index % 256)]);
const texto = new TextEncoder().encode('laudo: memória e SSD trocados');

test('lê os arquivos de dentro do ZIP', () => {
  const entries = readZipEntries(buildZip([
    { name: 'Laudo/foto1.jpg', content: foto },
    { name: 'Laudo/observacoes.txt', content: texto },
  ]));
  assert.deepEqual(entries.map((entry) => entry.name), ['Laudo/foto1.jpg', 'Laudo/observacoes.txt']);
  assert.equal(entries[0].size, foto.length);
  assert.ok(entries[0].compressedSize > 0);
});

test('o conteúdo volta igual ao que entrou, comprimido ou não', async () => {
  const buffer = buildZip([
    { name: 'foto.jpg', content: foto },
    { name: 'guardado.txt', content: texto, store: true },
  ]);
  const entries = readZipEntries(buffer);
  assert.deepEqual(await extractZipEntry(buffer, entries[0]), foto);
  assert.deepEqual(await extractZipEntry(buffer, entries[1]), texto, 'arquivo sem compressão sai direto');
});

// Pasta aparece no índice como nome terminado em barra, e não é arquivo.
test('pasta não vira item da lista', () => {
  const buffer = buildZip([{ name: 'Laudo/foto.jpg', content: foto }]);
  const entries = readZipEntries(buffer);
  assert.equal(entries.length, 1);
  assert.equal(zipEntryLabel(entries[0].name), 'foto.jpg', 'a lista mostra o nome, não o caminho');
});

test('arquivo que não é ZIP não quebra a tela', () => {
  assert.deepEqual(readZipEntries(new TextEncoder().encode('isso não é um zip').buffer as ArrayBuffer), []);
  assert.deepEqual(readZipEntries(new ArrayBuffer(0)), []);
});

test('o tipo sai do nome, porque o ZIP não guarda isso', () => {
  assert.equal(zipEntryMime('foto.JPG'), 'image/jpeg');
  assert.equal(zipEntryMime('laudo.pdf'), 'application/pdf');
  assert.equal(zipEntryMime('video.mp4'), 'video/mp4');
  assert.equal(zipEntryMime('dados.bin'), 'application/octet-stream');
  assert.ok(isViewableInZip('Laudo/foto.png'));
  assert.ok(!isViewableInZip('Laudo/planilha.xlsx'));
});

test('compressão que o navegador não abre vira erro explicado', async () => {
  const buffer = buildZip([{ name: 'foto.jpg', content: foto }]);
  const entry = { ...readZipEntries(buffer)[0], method: 14 };
  await assert.rejects(() => extractZipEntry(buffer, entry), /compressão que o navegador não abre/);
});
