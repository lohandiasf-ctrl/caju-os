import test from 'node:test';
import assert from 'node:assert/strict';
import { fullNameError, needsProfileSetup, normalizeName } from '../lib/profile.ts';

const photo = 'data:image/jpeg;base64,AAAA';

test('asks only who is missing name or photo', () => {
  assert.equal(needsProfileSetup({ displayName: 'Lohan Dias', photoUrl: photo }), false);
  assert.equal(needsProfileSetup({ displayName: 'Lohan Dias', photoUrl: null }), true);
  assert.equal(needsProfileSetup({ displayName: '   ', photoUrl: photo }), true);
  assert.equal(needsProfileSetup({ displayName: null, photoUrl: photo }), true);
  // Sem linha de presença ainda (primeiro acesso).
  assert.equal(needsProfileSetup(null), true);
  assert.equal(needsProfileSetup(undefined), true);
});

test('someone who already has name and photo is never asked, even with a single-word name', () => {
  assert.equal(needsProfileSetup({ displayName: 'Aiã', photoUrl: photo }), false);
});

test('photo must be an image data URL (what /api/colleagues accepts)', () => {
  assert.equal(needsProfileSetup({ displayName: 'Lohan Dias', photoUrl: 'https://example.com/a.png' }), true);
});

test('name needs first and last name', () => {
  assert.equal(fullNameError('Lohan Dias'), null);
  assert.equal(fullNameError('  aiã   souza '), null);
  assert.equal(fullNameError('Maria da Silva'), null);
  assert.match(fullNameError('Lohan') ?? '', /sobrenome/);
  assert.match(fullNameError('Lohan D') ?? '', /sobrenome/);
  assert.match(fullNameError('   ') ?? '', /Informe seu nome/);
  assert.match(fullNameError('a'.repeat(50) + ' ' + 'b'.repeat(40)) ?? '', /80/);
});

test('normalizes spaces before saving', () => {
  assert.equal(normalizeName('  Lohan    Dias  '), 'Lohan Dias');
});
