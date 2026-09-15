import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseDashboardView, canUseNavItem, isDashboardView } from '../lib/navigation.ts';

test('shared navigation preserves financial and N1 access restrictions', () => {
  for (const role of ['coordenador', 'n1', 'analista', 'tecnico'] as const) {
    assert.equal(canUseNavItem(role, 'finance'), false);
    assert.equal(canUseNavItem(role, 'spares'), false);
    assert.equal(canUseNavItem(role, 'map'), true);
  }
  assert.equal(canUseNavItem('gerencia', 'finance'), true);
  assert.equal(canUseNavItem('gerencia', 'spares'), true);
  assert.equal(canUseDashboardView('n1', 'central'), true);
  assert.equal(canUseDashboardView('analista', 'central'), false);
  assert.equal(canUseDashboardView('tecnico', 'tickets'), false);
  assert.equal(canUseNavItem('n1', 'projects'), false);
});

test('WhatsApp tab is limited to the pilot login, whatever the role', () => {
  assert.equal(canUseNavItem('gerencia', 'whatsapp', 'lohandiasf@gmail.com'), true);
  assert.equal(canUseNavItem('gerencia', 'whatsapp', ' LohanDiasF@gmail.com '), true);
  assert.equal(canUseNavItem('gerencia', 'whatsapp', 'outro@cajutech.net'), false);
  assert.equal(canUseNavItem('coordenador', 'whatsapp'), false);
  assert.equal(canUseDashboardView('n1', 'whatsapp', null), false);
});

test('unknown navigation targets are never offered', () => {
  assert.equal(isDashboardView('feedback'), true);
  assert.equal(isDashboardView(null), false);
  assert.equal(isDashboardView('invalid'), false);
  assert.equal(canUseNavItem('gerencia', 'invalid'), false);
  assert.equal(canUseNavItem(null, 'map'), false);
});
