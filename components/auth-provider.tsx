'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { canAccess, isUserRole, type UserRole } from '@/lib/permissions';

type AuthContextValue = { user: User | null; role: UserRole | null; loading: boolean };
const AuthContext = createContext<AuthContextValue>({ user: null, role: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      try {
        const token = await nextUser.getIdToken();
        const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const profile = await response.json() as { role?: unknown };
        setRole(response.ok && isUserRole(profile.role) ? profile.role : null);
      } catch {
        setRole(null);
      }
    } else {
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

  const value = useMemo(() => ({ user, role, loading }), [user, role, loading]);
  const authorized = user && (pathname === '/acesso-negado' || canAccess(role, pathname));
  const canRender = !loading && ((pathname === '/login' && !user) || (pathname !== '/login' && authorized));

  return (
    <AuthContext.Provider value={value}>
      {canRender ? children : <AuthLoading />}
    </AuthContext.Provider>
  );
}

function AuthLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin text-primary" />
        Verificando acesso...
      </div>
    </main>
  );
}
