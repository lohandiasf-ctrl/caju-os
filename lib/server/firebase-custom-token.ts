import { env } from 'cloudflare:workers';
import { privateKeyBase64FromSecret, privateKeyDerFromSecret } from '@/lib/server/private-key-pem';

// Assina um "custom token" do Firebase manualmente (RS256 com a chave da conta
// de serviço), sem o Admin SDK — que não roda no Workers. Formato exigido pelo
// Identity Toolkit: https://firebase.google.com/docs/auth/admin/create-custom-tokens
// Usado só depois que app/api/auth/pin/unlock já conferiu o PIN: o cliente
// troca este token por uma sessão de verdade com signInWithCustomToken.

const IDENTITY_TOOLKIT_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const CUSTOM_TOKEN_TTL_SECONDS = 3600;

export function firebaseServiceAccountConfigured(): boolean {
  return Boolean(env.FIREBASE_SERVICE_ACCOUNT_EMAIL?.trim() && env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim());
}

export async function createFirebaseCustomToken(uid: string): Promise<string> {
  const serviceAccountEmail = env.FIREBASE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyPem = env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!serviceAccountEmail || !privateKeyPem) throw new Error('Chave de serviço do Firebase não configurada.');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: IDENTITY_TOOLKIT_AUDIENCE,
    iat: now,
    exp: now + CUSTOM_TOKEN_TTL_SECONDS,
    uid,
  };
  const unsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function importPrivateKey(secret: string) {
  // Formatos de colagem (\n literal do JSON, aspas, JSON inteiro): ver
  // lib/server/private-key-pem.ts.
  let der: Uint8Array<ArrayBuffer>;
  try {
    der = privateKeyDerFromSecret(secret);
  } catch (cause) {
    // Diagnóstico seguro: só tamanho/formato, nunca o conteúdo da chave.
    console.error(`importPrivateKey: atob falhou (comprimento bruto=${secret.length}, limpo=${privateKeyBase64FromSecret(secret).length})`, cause);
    throw cause;
  }
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}
