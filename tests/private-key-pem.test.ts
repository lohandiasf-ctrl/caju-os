import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { privateKeyDerFromSecret } from '../lib/server/private-key-pem.ts';

// Chave RSA de verdade, gerada na hora: o teste só passa se o importKey aceita
// o resultado — mesmo critério do login por PIN em produção.
const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const jsonEscaped = JSON.stringify(pem).slice(1, -1);

async function importsAsRsaKey(secret: string) {
  const key = await crypto.subtle.importKey('pkcs8', privateKeyDerFromSecret(secret), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  assert.equal(key.type, 'private');
}

test('PEM com quebra de linha real', async () => {
  await importsAsRsaKey(pem);
});

test('PEM colado do JSON da conta de serviço, com \\n literal (bug de produção)', async () => {
  assert.ok(jsonEscaped.includes('\\n'));
  await importsAsRsaKey(jsonEscaped);
});

test('valor entre aspas e com vírgula sobrando', async () => {
  await importsAsRsaKey(`"${jsonEscaped}",`);
});

test('JSON inteiro da conta de serviço', async () => {
  await importsAsRsaKey(JSON.stringify({ type: 'service_account', private_key_id: 'abc123', private_key: pem, client_email: 'x@y.iam.gserviceaccount.com' }));
});

test('\\r\\n literal (colagem vinda do Windows)', async () => {
  await importsAsRsaKey(jsonEscaped.replace(/\\n/g, '\\r\\n'));
});
