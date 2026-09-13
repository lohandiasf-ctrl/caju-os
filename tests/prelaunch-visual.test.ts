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

test('brand controls and chat bubbles meet normal-text AA contrast', () => {
  assert.ok(contrast(token('primary'), token('primary-foreground')) >= 4.5);
  assert.ok(contrast(token('sidebar-primary'), token('sidebar-primary-foreground')) >= 4.5);
  assert.ok(contrast(token('chat-out'), '#ffffff') >= 4.5);
  assert.ok(contrast(token('primary'), token('card')) >= 4.5);
});
