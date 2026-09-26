// Fim da sessão por inatividade: depois de 2 horas sem uso, o login é pedido
// de novo (PIN ou senha). Fechar o app continua encerrando a sessão na hora
// (sessionStorage, lib/firebase.ts). O último uso fica no localStorage, que é
// compartilhado entre abas: mexer em uma aba mantém as outras vivas.
// Quem liga isto é o AuthProvider (components/auth-provider.tsx).

export const IDLE_LIMIT_MS = 2 * 60 * 60_000;
export const LAST_ACTIVITY_KEY = 'caju-last-activity';
export const IDLE_EXPIRED_KEY = 'caju-session-idle-expired';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readLastActivity(storage: StorageLike | null | undefined): number | null {
  try {
    const value = Number(storage?.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function markActivity(storage: StorageLike | null | undefined, now = Date.now()) {
  try { storage?.setItem(LAST_ACTIVITY_KEY, String(now)); } catch { /* sem storage: não expira por inatividade */ }
}

/** Sem registro de uso não expira: o primeiro uso grava o horário. */
export function isIdleExpired(lastActivity: number | null, now = Date.now(), limitMs = IDLE_LIMIT_MS) {
  return lastActivity !== null && now - lastActivity >= limitMs;
}

/** Marca que a última sessão caiu por inatividade, para o login explicar. */
export function flagIdleExpired(storage: StorageLike | null | undefined) {
  try { storage?.setItem(IDLE_EXPIRED_KEY, '1'); } catch { /* aviso é só conveniência */ }
}

export function wasIdleExpired(storage: StorageLike | null | undefined): boolean {
  try { return storage?.getItem(IDLE_EXPIRED_KEY) === '1'; } catch { return false; }
}

/** Apaga o aviso depois de mostrado: aparece uma vez só. */
export function clearIdleExpiredFlag(storage: StorageLike | null | undefined) {
  try { storage?.removeItem(IDLE_EXPIRED_KEY); } catch { /* nada a limpar */ }
}
