import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function token(name: string) {
  const match = new RegExp(`^\\s*--${name}: (#[0-9a-f]{6});`, 'im').exec(css);
  assert.ok(match, `Missing color token ${name}`);
  return match[1];
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((channel) => parseInt(channel, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

// Bloco `.dark { ... }` isolado, para medir o tema escuro separado do claro.
const darkBlock = /\n\.dark \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
function darkToken(name: string) {
  const match = new RegExp(`^\\s*--${name}: (#[0-9a-f]{6});`, 'im').exec(darkBlock);
  assert.ok(match, `Missing dark token ${name}`);
  return match[1];
}

test('dark theme uses surface levels, not absolute black, with readable muted text', () => {
  assert.notEqual(darkToken('background'), '#000000');
  // Cada nível um pouco mais claro que o anterior.
  const levels = ['background', 'card', 'card-elevated', 'popover'].map((name) => luminance(darkToken(name)));
  for (let index = 1; index < levels.length; index += 1) assert.ok(levels[index] > levels[index - 1], 'níveis de superfície fora de ordem');
  assert.ok(contrast(darkToken('muted-foreground'), darkToken('card')) >= 4.5);
  assert.ok(contrast(darkToken('primary'), darkToken('card')) >= 4.5);
});

test('static surfaces carry no decorative shadow, glow or gradient', () => {
  for (const name of ['shadow-card', 'shadow-panel', 'shadow-hero', 'body-glow']) {
    for (const match of css.matchAll(new RegExp(`--${name}: ([^;]+);`, 'g'))) assert.equal(match[1].trim(), 'none', `--${name} deve ser none`);
  }
  assert.doesNotMatch(css, /--surface-glass: [^;]*gradient/);
  assert.doesNotMatch(css, /\.metric-glow::after/);
  assert.doesNotMatch(css, /\[data-variant='default'\][^{]*\{[^}]*gradient/);
});

test('brand controls and chat bubbles meet normal-text AA contrast', () => {
  assert.ok(contrast(token('primary'), token('primary-foreground')) >= 4.5);
  assert.ok(contrast(token('sidebar-primary'), token('sidebar-primary-foreground')) >= 4.5);
  assert.ok(contrast(token('chat-out'), '#ffffff') >= 4.5);
  assert.ok(contrast(token('primary'), token('card')) >= 4.5);
});
