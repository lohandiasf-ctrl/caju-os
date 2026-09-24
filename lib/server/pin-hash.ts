// Deriva o hash guardado em pin_credentials (db/schema.ts) a partir do
// deviceSecret do aparelho + o PIN digitado. PBKDF2 é padrão da Web Crypto,
// disponível tanto no Workers (produção) quanto no Node (testes) — mesmo
// padrão de crypto.subtle já usado em lib/server/firebase-auth.ts.
//
// 100.000 é o teto: o runtime do Workers (BoringSSL) rejeita PBKDF2 acima
// disso com "NotSupportedError: iteration counts above 100000 are not
// supported" — só apareceu em produção porque o Node (testes) não tem esse
// limite. app/api/auth/pin/unlock/route.ts sempre confere com o `iterations`
// gravado na linha, então não é preciso migration para credenciais futuras.
export const PIN_HASH_ITERATIONS = 100_000;

export function isValidPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function randomHex(byteLength: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function derivePinHash(deviceSecret: string, pin: string, saltHex: string, iterations = PIN_HASH_ITERATIONS): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${deviceSecret}:${pin}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

/** Compara em tempo constante: evita vazar por timing quantos bytes do hash bateram. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.length % 2 ? `0${hex}` : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
