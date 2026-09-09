'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { CajuLoading } from '@/components/caju-loading';
import { canAccess, isUserRole, type UserRole } from '@/lib/permissions';

type AuthContextValue = { user: User | null; role: UserRole | null; loading: boolean; accessError: string };
const AuthContext = createContext<AuthContextValue>({ user: null, role: null, loading: true, accessError: '' });
const PROFILE_CACHE_KEY = 'caju-os-auth-profile';

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      const cachedRole = readCachedRole(nextUser.email);
      if (cachedRole) {
        setRole(cachedRole);
        setLoading(false);
      }
      try {
        const token = await nextUser.getIdToken();
        const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const profile = await response.json() as { role?: unknown; error?: string };
        if (!response.ok || !isUserRole(profile.role)) {
          sessionStorage.removeItem(PROFILE_CACHE_KEY);
          setAccessError(profile.error || 'Seu perfil não possui acesso ativo.');
          setRole(null);
        } else {
          setAccessError('');
          setRole(profile.role);
          sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ email: nextUser.email?.toLowerCase(), role: profile.role }));
        }
      } catch {
        if (!cachedRole) {
          setAccessError('Não foi possível validar seu perfil. Tente novamente.');
          setRole(null);
        }
      }
    } else {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
      setAccessError('');
      setRole(null);
    }
    setLoading(false);
  }), []);

  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== '/login') router.replace('/login');
    if (user && pathname === '/login') router.replace('/');
    if (user && pathname !== '/login' && pathname !== '/acesso-negado' && !canAccess(role, pathname)) router.replace('/acesso-negado');
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
    const cached = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY) ?? '{}') as { email?: unknown; role?: unknown };
    return cached.email === email.toLowerCase() && isUserRole(cached.role) ? cached.role : null;
  } catch {
    return null;
  }
}

function AuthLoading() {
  return <CajuLoading label="Verificando acesso..." />;
}
