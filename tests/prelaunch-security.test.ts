import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSafeDataUrlType, isSafeDataUrl, isSafeUpload } from '../lib/safe-data-url.ts';
import { withSecurityHeaders } from '../scripts/security-headers.mjs';

const dataUrl = (mime: string, bytes: number[]) => `data:${mime};base64,${btoa(String.fromCharCode(...bytes))}`;

test('accepts only matching media data URLs with real signatures', () => {
  const png = dataUrl('image/png', [137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.equal(isSafeDataUrl(png, 'image/png', 100), true);
  assert.equal(isSafeDataUrl(png, 'image/jpeg', 100), false);
  assert.equal(isSafeDataUrl(png.replace('image/png', 'image/svg+xml'), 'image/svg+xml', 100), false);
  assert.equal(isSafeDataUrl('data:image/png;base64,SGVsbG8=', 'image/png', 100), false);
  assert.equal(isSafeDataUrl('data:image/png;base64,%%%%', 'image/png', 100), false);
  assert.equal(isSafeDataUrl(png, 'image/png', 20), false);
  const voice = dataUrl('audio/webm;codecs=opus', [0x1a, 0x45, 0xdf, 0xa3, 0]);
  assert.equal(isSafeDataUrl(voice, 'audio/webm;codecs=opus', 100), true);
  assert.equal(hasSafeDataUrlType(png, 'image/png'), true);
  assert.equal(hasSafeDataUrlType('data:text/html;base64,PHNjcmlwdD4=', 'text/html'), false);
});

test('checks uploaded file bytes independently from its claimed type', async () => {
  assert.equal(await isSafeUpload(new File([Uint8Array.from([37, 80, 68, 70, 45, 49])], 'rat.pdf', { type: 'application/pdf' }), 100), true);
  assert.equal(await isSafeUpload(new File(['<script>'], 'rat.pdf', { type: 'application/pdf' }), 100), false);
});

test('security headers protect HTTPS responses without forcing localhost HTTP', () => {
  const secure = withSecurityHeaders(Response.json({ ok: true }), 'https://operacoes.cajutech.net/');
  assert.equal(secure.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(secure.headers.get('X-Frame-Options'), 'DENY');
  assert.match(secure.headers.get('Strict-Transport-Security') ?? '', /max-age=/);
  const local = withSecurityHeaders(new Response('ok'), 'http://localhost:5173/');
  assert.equal(local.headers.get('Strict-Transport-Security'), null);
});
