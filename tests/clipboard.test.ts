import test from 'node:test';
import assert from 'node:assert/strict';
import { copyToClipboardLazy } from '../lib/clipboard.ts';

type Item = Record<string, Promise<unknown>>;

// Fake mínimo da Clipboard API: registra quando `write()` foi chamado e resolve
// os tipos MIME, que a API aceita como Promise.
function fakeClipboard() {
  const calls: Array<{ at: number; item: Item }> = [];
  let tick = 0;
  (globalThis as Record<string, unknown>).ClipboardItem = class {
    data: Item;
    constructor(data: Item) { this.data = data; }
  };
  (globalThis as Record<string, unknown>).Blob = class {
    parts: unknown[];
    constructor(parts: unknown[]) { this.parts = parts; }
  };
  // `navigator` no Node só tem getter; defineProperty é o caminho.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        // Como o navegador: marca a chamada na hora e só então espera o conteúdo.
        write: async (items: Array<{ data: Item }>) => {
          calls.push({ at: tick++, item: items[0].data });
          await Promise.all(Object.values(items[0].data));
        },
      },
    },
  });
  return { calls, next: () => tick++ };
}

test('a escrita começa antes do conteúdo ficar pronto (o gesto ainda vale)', async () => {
  const clipboard = fakeClipboard();
  let loadedAt = -1;
  await copyToClipboardLazy(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    loadedAt = clipboard.next();
    return { text: 'FSA-1', html: '<b>FSA-1</b>' };
  });
  assert.equal(clipboard.calls.length, 1);
  assert.ok(clipboard.calls[0].at < loadedAt, 'write() precisa sair antes da espera pelos dados');
});

test('texto e html chegam nos dois tipos MIME', async () => {
  const clipboard = fakeClipboard();
  await copyToClipboardLazy(async () => ({ text: 'FSA-1', html: '<b>FSA-1</b>' }));
  const item = clipboard.calls[0].item;
  assert.deepEqual(Object.keys(item).sort(), ['text/html', 'text/plain']);
  assert.deepEqual((await item['text/plain'] as { parts: string[] }).parts, ['FSA-1']);
  assert.deepEqual((await item['text/html'] as { parts: string[] }).parts, ['<b>FSA-1</b>']);
});

test('sem html, o texto simples vale para os dois tipos', async () => {
  const clipboard = fakeClipboard();
  await copyToClipboardLazy(async () => ({ text: 'FSA-1' }));
  const item = clipboard.calls[0].item;
  assert.deepEqual((await item['text/html'] as { parts: string[] }).parts, ['FSA-1']);
});
