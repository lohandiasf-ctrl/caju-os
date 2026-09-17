import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { isWhatsappGroupPhoto, WHATSAPP_GROUP_PHOTOS, whatsappGroupPhotoSrc } from '../lib/whatsapp-group-photos.ts';

test('every group photo has its file in public', () => {
  for (const photo of WHATSAPP_GROUP_PHOTOS) {
    assert.ok(existsSync(`public${whatsappGroupPhotoSrc(photo.id)}`), photo.id);
  }
});

test('ids stay within what the bridge accepts', () => {
  for (const photo of WHATSAPP_GROUP_PHOTOS) assert.match(photo.id, /^[a-z0-9-]{1,40}$/);
});

test('only listed photos are accepted', () => {
  assert.equal(isWhatsappGroupPhoto('pendencia-tecnica'), true);
  assert.equal(isWhatsappGroupPhoto('../secrets'), false);
  assert.equal(isWhatsappGroupPhoto(null), false);
  assert.equal(isWhatsappGroupPhoto(1), false);
});
