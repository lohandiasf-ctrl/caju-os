// Converte o valor do secret FIREBASE_SERVICE_ACCOUNT_KEY nos bytes DER
// (PKCS#8) que o crypto.subtle.importKey espera. Fica separado de
// firebase-custom-token.ts para ser testável sem o runtime do Workers.
//
// O secret costuma ser colado direto do JSON da conta de serviço, onde as
// quebras de linha do PEM aparecem como "\n" literal (barra + n). Filtrar só
// os caracteres de base64 NÃO basta: a barra some mas o "n" é base64 válido e
// fica grudado na chave — uma sobra por linha, que quebra o atob() ("invalid
// base64-encoded data") ou o importKey, conforme a conta de linhas.
// Por isso o "\n" literal vira quebra de verdade ANTES de qualquer filtro.
// Também aceita o JSON inteiro da conta de serviço e o valor entre aspas.

const PEM_BODY = /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/;

export function privateKeyBase64FromSecret(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as { private_key?: unknown };
      if (typeof parsed.private_key === 'string') value = parsed.private_key;
    } catch { /* não era o JSON inteiro: segue com o texto como veio */ }
  }
  value = value.replace(/\\r/g, '').replace(/\\n/g, '\n');
  const body = PEM_BODY.exec(value)?.[1] ?? value;
  const stripped = body.replace(/[^A-Za-z0-9+/]/g, '');
  return stripped + '='.repeat((4 - (stripped.length % 4)) % 4);
}

export function privateKeyDerFromSecret(raw: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(privateKeyBase64FromSecret(raw)), (character) => character.charCodeAt(0));
}
