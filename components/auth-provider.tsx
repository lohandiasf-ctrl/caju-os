'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { CajuLoading } from '@/components/caju-loading';
import { canAccess, isUserRole, type UserRole } from '@/lib/permissions';

type AuthContextValue = { user: User | null; role: UserRole | null; loading: boolean; accessError: string };
const AuthContext = createContext<AuthContextValue>({ user: null, role: null, loading: true, accessError: '' });
const PROFILE_CACHE_KEY = 'caju-os-auth-profile';

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Resolve o perfil do usuário. Distingue negação definitiva de falha
 * transitória: um 401/403 revoga o acesso; um 5xx ou erro de rede **não** —
 * senão uma instabilidade do Worker durante um refresh de token derrubava a
 * gerência para /acesso-negado. Tenta de novo algumas vezes antes de desistir.
 */
async function resolveProfile(user: User): Promise<
  | { kind: 'ok'; role: UserRole }
  | { kind: 'denied'; message: string }
  | { kind: 'transient'; message: string }
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const token = await user.getIdToken(attempt > 0); // força refresh nas retentativas
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return { kind: 'denied', message: body.error || 'Seu perfil não possui acesso ativo.' };
      }
      if (!response.ok) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue; // 5xx: tenta de novo
      }
      const body = (await response.json()) as { role?: unknown };
      if (isUserRole(body.role)) return { kind: 'ok', role: body.role };
      // 200 com papel inválido/ausente = sem perfil ativo, definitivo
      return { kind: 'denied', message: 'Seu perfil não possui acesso ativo.' };
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return { kind: 'transient', message: 'Não foi possível validar seu perfil agora. Tente recarregar.' };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  // onAuthStateChanged pode disparar em paralelo (login + hidratação de token).
  // Só o resultado da chamada mais recente pode escrever no estado.
  const runId = useRef(0);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (nextUser) => {
        const myRun = (runId.current += 1);
        setUser(nextUser);

        if (!nextUser) {
          try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* modo privado */ }
          if (myRun === runId.current) {
            setRole(null);
            setAccessError('');
            setLoading(false);
          }
          return;
        }

        // Confia no cache de imediato — a chamada abaixo confirma ou corrige.
        const cachedRole = readCachedRole(nextUser.email);
        if (cachedRole && myRun === runId.current) {
          setRole(cachedRole);
          setLoading(false);
        }

        const result = await resolveProfile(nextUser);
        if (myRun !== runId.current) return; // uma chamada mais nova assumiu

        if (result.kind === 'ok') {
          setRole(result.role);
          setAccessError('');
          try {
            sessionStorage.setItem(
              PROFILE_CACHE_KEY,
              JSON.stringify({ email: nextUser.email?.toLowerCase(), role: result.role }),
            );
          } catch { /* modo privado */ }
        } else if (result.kind === 'denied') {
          setRole(null);
          setAccessError(result.message);
          try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* modo privado */ }
        } else {
          // transitório: mantém o que já temos (cache/estado atual) e o cache.
          if (!cachedRole) setAccessError(result.message);
        }
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== '/login') {
      router.replace('/login');
      return;
    }
    if (user && pathname === '/login') {
      router.replace('/');
      return;
    }
    // Já resolveu um papel válido enquanto estava preso em /acesso-negado?
    // Sai automaticamente — antes só o clique manual em "Voltar" resolvia.
    if (user && pathname === '/acesso-negado' && role && canAccess(role, '/')) {
      router.replace('/');
      return;
    }
    if (
      user &&
      pathname !== '/login' &&
      pathname !== '/acesso-negado' &&
      !canAccess(role, pathname)
    ) {
      router.replace('/acesso-negado');
    }
  }, [loading, pathname, role, router, user]);

  const value = useMemo(() => ({ user, role, loading, accessError }), [user, role, loading, accessError]);
  const authorized = user && (pathname === '/acesso-negado' || canAccess(role, pathname));
  const canRender = !loading && ((pathname === '/login' && !user) || (pathname !== '/login' && authorized));

  return (
    <AuthContext.Provider value={value}>
      {canRender ? children : <AuthLoading />}
    </AuthContext.Provider>
  );
}

function readCachedRole(email: string | null) {
  if (!email) return null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) ?? '{}') as {
      email?: unknown;
      role?: unknown;
    };
    return cached.email === email.toLowerCase() && isUserRole(cached.role) ? cached.role : null;
  } catch {
    return null;
  }
}

function AuthLoading() {
  return <CajuLoading label="Verificando acesso..." />;
}
