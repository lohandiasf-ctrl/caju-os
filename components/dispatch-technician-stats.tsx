'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TechnicianStats } from '@/lib/dispatch-stats';

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso)) : '—');

/** Histórico do que cada técnico respondeu às ofertas: para tirar quem nunca aceita e controlar o custo. */
export function DispatchTechnicianStats({ user }: { user: { getIdToken: () => Promise<string> } | null }) {
  const [rows, setRows] = useState<TechnicianStats[] | null>(null);
  const [error, setError] = useState('');
  const [onlyNever, setOnlyNever] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/dispatch/technicians', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const payload = await response.json() as { technicians?: TechnicianStats[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar o histórico dos técnicos.');
        if (active) setRows(payload.technicians ?? []);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico dos técnicos.'); }
    })();
    return () => { active = false; };
  }, [user]);
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const shown = (rows ?? []).filter((r) => (!onlyNever || r.neverAccepted) && (!term || `${r.name} ${r.city ?? ''}`.toLocaleLowerCase('pt-BR').includes(term)));
  const never = (rows ?? []).filter((r) => r.neverAccepted).length;
  return (
    <article className="surface-panel mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Histórico por técnico</h2>
          <p className="mt-1 text-xs text-muted-foreground">O que cada um respondeu às ofertas reais. Quem recebe muito e nunca aceita só aumenta o custo das mensagens.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Buscar técnico" placeholder="Buscar técnico ou cidade" value={query} onChange={(event) => setQuery(event.target.value)} className="field min-h-9 w-52 py-0 text-sm" />
          <Button size="sm" variant={onlyNever ? 'default' : 'outline'} aria-pressed={onlyNever} onClick={() => setOnlyNever((v) => !v)}>Nunca aceitaram{never ? ` (${never})` : ''}</Button>
        </div>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : rows === null ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</p>
      ) : !shown.length ? (
        <p className="mt-3 text-sm text-muted-foreground">{rows.length ? 'Nenhum técnico neste filtro.' : 'Ainda não há ofertas reais enviadas.'}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-2 pr-3 font-medium">Técnico</th><th className="px-2 font-medium">Recebeu</th><th className="px-2 font-medium">Leu</th><th className="px-2 font-medium">Aceitou</th><th className="px-2 font-medium">Recusou</th><th className="px-2 font-medium">Sem resposta</th><th className="px-2 font-medium">Taxa</th><th className="px-2 font-medium">Última resposta</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.technicianId} className="border-t border-border tabular-nums">
                  <td className="py-2 pr-3"><span className="font-medium">{r.name}</span>{r.city && <span className="block text-xs text-muted-foreground">{r.city}</span>}
                    {r.neverAccepted && <Badge variant="outline" className="mt-1 border-warning/30 bg-warning-soft text-warning">nunca aceitou</Badge>}</td>
                  <td className="px-2">{r.received}</td><td className="px-2">{r.read}</td><td className="px-2 font-semibold text-success">{r.accepted}</td><td className="px-2">{r.declined}</td><td className="px-2">{r.ignored}</td>
                  <td className="px-2">{r.acceptRate === null ? '—' : `${r.acceptRate}%`}</td><td className="px-2 text-xs text-muted-foreground">{when(r.lastResponseAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
