// Lembra o e-mail da última pessoa que entrou neste aparelho. A sessão do
// Firebase só vive enquanto a janela está aberta (lib/firebase.ts); ao voltar,
// o login já mostra o e-mail e pede só a senha. O e-mail não é segredo — a
// senha nunca é guardada.

export const REMEMBERED_EMAIL_KEY = 'caju-last-email';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function normalizeEmail(value: string | null | undefined) {
  const email = (value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function readRememberedEmail(storage: StorageLike | null | undefined) {
  try {
    return normalizeEmail(storage?.getItem(REMEMBERED_EMAIL_KEY));
  } catch {
    return '';
  }
}

export function rememberEmail(storage: StorageLike | null | undefined, email: string) {
  const clean = normalizeEmail(email);
  if (!clean) return;
  try { storage?.setItem(REMEMBERED_EMAIL_KEY, clean); } catch { /* sem storage: pede o e-mail de novo */ }
}

export function forgetRememberedEmail(storage: StorageLike | null | undefined) {
  try { storage?.removeItem(REMEMBERED_EMAIL_KEY); } catch { /* nada a limpar */ }
}

/** "maria.silva@cajutech.net" → "MS" para o avatar da tela de desbloqueio. */
export function emailInitials(email: string) {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._\-\s]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)) || '?';
  return letters.toUpperCase();
}
