'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/auth-provider';

export function UserMenu() {
  const { user } = useAuth();
  const label = user?.email?.slice(0, 2).toUpperCase() || 'US';

  return (
    <div className="mt-3 rounded-xl border border-sidebar-border bg-background/40 p-3">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#28344a] text-xs font-bold text-[#9fb4d5]">{label}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{user?.email}</p>
          <p className="text-[10px] text-muted-foreground">Usuário autenticado</p>
        </div>
        <button type="button" onClick={() => void signOut(auth)} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Sair da conta" title="Sair">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}
