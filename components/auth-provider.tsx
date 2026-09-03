'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';

type AuthContextValue = { user: User | null; loading: boolean };
const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setLoading(false);
  }), []);

  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== '/login') router.replace('/login');
    if (user && pathname === '/login') router.replace('/');
  }, [loading, pathname, router, user]);

  const value = useMemo(() => ({ user, loading }), [user, loading]);
  const canRender = !loading && ((pathname === '/login' && !user) || (pathname !== '/login' && user));

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
