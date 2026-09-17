import test from 'node:test';
import assert from 'node:assert/strict';
import { canScrollUp, type ScrollNode } from '../lib/pull-refresh-guard.ts';

function node(partial: Partial<ScrollNode>): ScrollNode {
  return { scrollTop: 0, scrollHeight: 100, clientHeight: 100, overflowY: 'visible', parent: null, ...partial };
}

test('a lista já rolada pode subir: o gesto não é barrado', () => {
  const list = node({ overflowY: 'auto', scrollHeight: 900, clientHeight: 400, scrollTop: 120 });
  const item = node({ parent: list });
  assert.equal(canScrollUp(item), true);
});

test('lista no topo não tem para onde subir: o gesto é barrado', () => {
  const list = node({ overflowY: 'auto', scrollHeight: 900, clientHeight: 400, scrollTop: 0 });
  const item = node({ parent: list });
  assert.equal(canScrollUp(item), false);
});

test('um ancestral rolado mais acima na cadeia conta', () => {
  const page = node({ overflowY: 'scroll', scrollHeight: 2000, clientHeight: 800, scrollTop: 300 });
  const list = node({ overflowY: 'auto', scrollHeight: 900, clientHeight: 400, scrollTop: 0, parent: page });
  assert.equal(canScrollUp(node({ parent: list })), true);
});

test('overflow rolável sem conteúdo excedente não conta', () => {
  const list = node({ overflowY: 'auto', scrollHeight: 400, clientHeight: 400, scrollTop: 5 });
  assert.equal(canScrollUp(list), false);
});

test('sem cadeia nenhuma o gesto é barrado', () => {
  assert.equal(canScrollUp(null), false);
});
