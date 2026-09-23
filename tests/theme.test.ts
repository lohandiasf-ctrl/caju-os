import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME, parseThemePreference, resolveTheme, themeBootScript, THEME_STORAGE_KEY } from '../lib/theme.ts';

test('preferência desconhecida cai no escuro (padrão da produção)', () => {
  assert.equal(DEFAULT_THEME, 'dark');
  assert.equal(parseThemePreference(null), 'dark');
  assert.equal(parseThemePreference('azul'), 'dark');
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('system'), 'system');
});

test('"system" segue o sistema; escolhas explícitas o ignoram', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('script de boot lê a mesma chave e é autocontido', () => {
  assert.ok(themeBootScript.includes(`'${THEME_STORAGE_KEY}'`));
  assert.ok(!themeBootScript.includes('import'));
  assert.doesNotThrow(() => new Function(themeBootScript));
});
