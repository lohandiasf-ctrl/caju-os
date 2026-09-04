'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/auth-provider';
import { roleLabels } from '@/lib/permissions';

export function UserMenu() {
  const { user, role } = useAuth();
  const label = user?.email?.slice(0, 2).toUpperCase() || 'US';

  return (
    <div className="cockpit-inset mt-3 rounded-xl p-3">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-xs font-bold text-emerald-200">{label}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{user?.email}</p>
          <p className="text-xs text-muted-foreground">{role ? roleLabels[role] : 'Sem perfil definido'}</p>
        </div>
        <button type="button" onClick={() => void signOut(auth)} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Sair da conta" title="Sair">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}
