// PIN de 4 dígitos como atalho de login (ver app/login/page.tsx e
// app/api/auth/pin/*). Cada aparelho guarda, por e-mail, um par {deviceId,
// deviceSecret} gerado aqui e nunca enviado a ninguém além de
// /api/auth/pin/setup e /api/auth/pin/unlock — sozinho, sem o deviceSecret
// deste aparelho, o PIN não abre nada em outro lugar (o servidor guarda só o
// hash de deviceSecret+PIN, ver lib/server/pin-hash.ts).

export type PinDevice = { deviceId: string; deviceSecret: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function browserStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }
}

export function isValidPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

function deviceKey(email: string) {
  return `caju-pin-device:${email.trim().toLowerCase()}`;
}

function offeredKey(email: string) {
  return `caju-pin-offered:${email.trim().toLowerCase()}`;
}

export function readPinDevice(storage: StorageLike | null | undefined, email: string): PinDevice | null {
  if (!email) return null;
  try {
    const raw = storage?.getItem(deviceKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PinDevice>;
    return typeof parsed.deviceId === 'string' && typeof parsed.deviceSecret === 'string' ? { deviceId: parsed.deviceId, deviceSecret: parsed.deviceSecret } : null;
  } catch {
    return null;
  }
}

export function savePinDevice(storage: StorageLike | null | undefined, email: string, device: PinDevice) {
  try { storage?.setItem(deviceKey(email), JSON.stringify(device)); } catch { /* sem storage: PIN não fica salvo neste aparelho */ }
}

export function forgetPinDevice(storage: StorageLike | null | undefined, email: string) {
  try { storage?.removeItem(deviceKey(email)); } catch { /* nada a limpar */ }
}

export function wasPinOffered(storage: StorageLike | null | undefined, email: string): boolean {
  try { return storage?.getItem(offeredKey(email)) === '1'; } catch { return true; }
}

export function markPinOffered(storage: StorageLike | null | undefined, email: string) {
  try { storage?.setItem(offeredKey(email), '1'); } catch { /* melhor oferecer de novo do que travar */ }
}

/** Par novo para este aparelho: 16 bytes de id (só precisa ser único) + 32 de segredo. */
export function generatePinDevice(): PinDevice {
  return { deviceId: randomBase64Url(16), deviceSecret: randomBase64Url(32) };
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Confere se o servidor já tem a chave de serviço do Firebase para logar com PIN (ver GET /api/auth/pin/setup). */
export async function pinLoginAvailable(idToken: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/pin/setup', { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' });
    if (!response.ok) return false;
    const payload = await response.json() as { configured?: boolean };
    return Boolean(payload.configured);
  } catch {
    return false;
  }
}

/** Cadastra o PIN no servidor para um par novo; lança com a mensagem do servidor se falhar. */
export async function registerPinDevice(idToken: string, pin: string): Promise<PinDevice> {
  const device = generatePinDevice();
  const response = await fetch('/api/auth/pin/setup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: device.deviceId, deviceSecret: device.deviceSecret, pin }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Não foi possível cadastrar o PIN.');
  return device;
}

export async function removePinDevice(idToken: string, deviceId: string): Promise<void> {
  const response = await fetch('/api/auth/pin/setup', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || 'Não foi possível remover o PIN.');
  }
}
