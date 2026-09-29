import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, isPublicPath } from '../lib/permissions.ts';

test('só a política de privacidade abre sem login', () => {
  assert.equal(isPublicPath('/privacidade'), true);
  assert.equal(isPublicPath('/privacidade/x'), false);
  assert.equal(isPublicPath('/distribuicao'), false);
  assert.equal(isPublicPath('/'), false);
  // Rota pública não muda o acesso das demais.
  assert.equal(canAccess(null, '/distribuicao'), false);
});
