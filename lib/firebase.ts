'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { browserSessionPersistence, getAuth, initializeAuth, signOut, type Auth } from 'firebase/auth';
import { firebaseConfig } from '@/lib/firebase-config';
import { forgetRememberedEmail } from '@/lib/login-memory';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// A sessão vive só enquanto a janela está aberta (sessionStorage): recarregar
// mantém o login; fechar a aba, o navegador ou o app desktop pede a senha de
// novo. O e-mail fica lembrado (lib/login-memory.ts) para a volta pedir só a
// senha. Antes a sessão ficava no IndexedDB e sobrevivia ao fechamento.
// Com a janela aberta, 2 horas sem uso também encerram (lib/session-idle.ts).
function createAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: browserSessionPersistence });
  } catch {
    // Já inicializado (recarga a quente do dev): reaproveita a instância.
    return getAuth(app);
  }
}

export const auth = createAuth();

// Sessões antigas gravadas em disco (persistência local do Firebase) não são
// mais lidas; apaga o token que sobrou lá para não ficar credencial parada.
if (typeof window !== 'undefined') {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('firebase:authUser:')) window.localStorage.removeItem(key);
    }
    window.indexedDB?.deleteDatabase('firebaseLocalStorageDb');
  } catch {
    /* storage bloqueado: nada a limpar */
  }
}

/** "Sair" de verdade: encerra a sessão e esquece o e-mail deste aparelho. */
export function signOutAndForget() {
  try { forgetRememberedEmail(window.localStorage); } catch { /* storage bloqueado */ }
  return signOut(auth);
}
