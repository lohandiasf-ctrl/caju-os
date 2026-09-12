import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { apiFetch } from '../api/client';
import { auth } from '../firebase';
import type { AuthUser } from '../api/types';

type AuthState = {
  /** null = deslogado; undefined = ainda verificando a sessão guardada. */
  user: User | null | undefined;
  profile: AuthUser | null;
  profileError: string | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: undefined,
  profile: null,
  profileError: null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    if (!next) {
      setProfile(null);
      setProfileError(null);
    }
  }), []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    // O papel (gerência, n1, técnico...) mora no D1, não no Firebase: quem
    // decide o que cada tela mostra é o /api/auth/me.
    apiFetch<AuthUser>('/api/auth/me')
      .then((value) => {
        if (active) {
          setProfile(value);
          setProfileError(null);
        }
      })
      .catch((error: Error) => {
        if (active) {
          setProfile(null);
          setProfileError(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({ user, profile, profileError, logout: () => signOut(auth) }),
    [user, profile, profileError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
