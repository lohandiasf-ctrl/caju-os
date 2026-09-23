'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { roleLabels, type UserRole } from '@/lib/permissions';

type Member = { email: string; role: UserRole; active: boolean; displayName: string | null };

/**
 * Gerência: quem está na equipe e quem foi retirado. Retirar desativa o acesso
 * (a pessoa sai do Caju OS e da lista de colegas); nada é apagado e dá para
 * readmitir aqui mesmo. A confirmação fica na própria linha.
 */
export function TeamManagementPanel() {
  const { user, role } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user || role !== 'gerencia') return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/users/team', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const payload = (await response.json()) as { members?: Member[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a equipe.');
        if (active) { setMembers(payload.members ?? []); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a equipe.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [role, user]);

  async function setActive(member: Member, active: boolean) {
    if (!user) return;
    setBusy(member.email);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/users/team', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: member.email, active }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar a equipe.');
      setMembers((current) => current.map((item) => item.email === member.email ? { ...item, active } : item));
      setNotice(active ? `${nameOf(member)} voltou para a equipe.` : `${nameOf(member)} saiu da equipe e perdeu o acesso ao Caju OS.`);
      setConfirming(null);
      window.dispatchEvent(new Event('caju-presence-updated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a equipe.');
    } finally {
      setBusy(null);
    }
  }

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members
      .filter((member) => !term || `${member.displayName ?? ''} ${member.email} ${roleLabels[member.role]}`.toLowerCase().includes(term))
      .sort((a, b) => Number(b.active) - Number(a.active) || nameOf(a).localeCompare(nameOf(b), 'pt-BR'));
  }, [members, query]);
  const activeCount = members.filter((member) => member.active).length;

  if (role !== 'gerencia') return null;
  const me = user?.email?.toLowerCase();
  return (
    <section className="surface-panel mt-4 rounded-2xl p-5" aria-labelledby="team-management-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="team-management-title" className="font-semibold">Pessoas na equipe</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? 'Carregando…' : `${activeCount} com acesso${members.length > activeCount ? ` · ${members.length - activeCount} retiradas` : ''}. Quem é retirado perde o acesso na hora; nada é apagado.`}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <label htmlFor="team-management-search" className="sr-only">Buscar pessoa</label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="team-management-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nome, e-mail ou função…" className="pl-9" />
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <output className="mt-3 block rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-sm text-success">{notice}</output>}
      {loading ? (
        <div className="mt-4 space-y-2" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <span key={index} className="skeleton block h-12 rounded-lg" />)}</div>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((member) => {
            const self = member.email.toLowerCase() === me;
            const asking = confirming === member.email;
            return (
              <li key={member.email} className={`px-3 py-2.5 ${member.active ? '' : 'bg-(--surface-inset)'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${member.active ? '' : 'text-muted-foreground'}`}>{nameOf(member)}{self && <span className="font-normal text-muted-foreground"> (você)</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{member.displayName ? `${member.email} · ` : ''}{roleLabels[member.role]}</span>
                  </span>
                  {!member.active && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Retirado</span>}
                  {member.active && !self && !asking && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(member.email)} className="text-danger hover:bg-danger-soft hover:text-danger">
                      <UserMinus aria-hidden="true" />Retirar
                    </Button>
                  )}
                  {!member.active && (
                    <Button variant="outline" size="sm" disabled={busy === member.email} onClick={() => void setActive(member, true)}>
                      {busy === member.email ? <Loader2 aria-hidden="true" className="animate-spin" /> : <UserPlus aria-hidden="true" />}Readmitir
                    </Button>
                  )}
                </div>
                {asking && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2">
                    <p className="min-w-0 flex-1 text-sm">Retirar <b>{nameOf(member)}</b> da equipe? A pessoa perde o acesso ao Caju OS agora.</p>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={busy === member.email}>Cancelar</Button>
                    <Button variant="destructive" size="sm" onClick={() => void setActive(member, false)} disabled={busy === member.email}>
                      {busy === member.email && <Loader2 aria-hidden="true" className="animate-spin" />}Retirar da equipe
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {!visible.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{query.trim() ? `Ninguém encontrado para “${query.trim()}”.` : 'Nenhuma pessoa cadastrada.'}</li>}
        </ul>
      )}
    </section>
  );
}

function nameOf(member: Member) {
  return member.displayName?.trim() || member.email.split('@')[0];
}
