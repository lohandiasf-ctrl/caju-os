'use client';

import { LogOut, ShieldX } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/auth-provider';

export default function AccessDeniedPage() {
  const { user, role } = useAuth();
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><ShieldX className="size-7" /></div>
        <h1 className="mt-5 text-2xl font-extrabold">Acesso não autorizado</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Sua conta está ativa, mas não possui permissão para acessar esta área. Peça à Gerência para revisar seu perfil.</p>
        <div className="mt-5 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground"><p className="truncate">{user?.email}</p><p className="mt-1">Perfil: {role || 'não definido'}</p></div>
        <Button className="mt-6 w-full" variant="outline" onClick={() => void signOut(auth)}><LogOut />Sair e usar outra conta</Button>
      </section>
    </main>
  );
}
