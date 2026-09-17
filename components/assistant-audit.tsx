'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Loader2, ShieldCheck, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type User = { getIdToken: () => Promise<string> } | null;
type AuditRow = {
  id: string; ticketKey: string; kind: string; description: string; source: string;
  status: string; proposedTo: string; confirmedBy: string | null; error: string | null;
  createdAt: string; resolvedAt: string | null;
};

const STATUS: Record<string, { label: string; className: string; icon: typeof Check }> = {
  applied: { label: 'Aplicada', className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100', icon: Check },
  cancelled: { label: 'Recusada', className: 'border-border bg-muted/40 text-muted-foreground', icon: X },
  failed: { label: 'Falhou', className: 'border-red-400/25 bg-red-400/10 text-red-100', icon: XCircle },
  pending: { label: 'Pendente', className: 'border-amber-400/25 bg-amber-400/10 text-amber-100', icon: Clock3 },
};

const RANGES: Array<[number, string]> = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']];

// Trilha da escrita assistida. Mostra também o que foi proposto e recusado —
// auditar só o que passou esconde metade da história.
export function AssistantAudit({ user }: { user: User }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/assistant/actions?days=${days}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = await response.json() as { actions?: AuditRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a auditoria.');
      setRows(payload.actions ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a auditoria.');
    } finally { setLoading(false); }
  }, [user, days]);

  useEffect(() => { void load(); }, [load]);

  return <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4" aria-labelledby="auditoria-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="auditoria-title" className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-violet-300" />Auditoria da escrita assistida</h2>
        <p className="mt-1 text-xs text-muted-foreground">Toda ação que o assistente propôs, e o que foi feito com ela.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {RANGES.map(([value, label]) => <Button key={value} size="sm" variant={days === value ? 'default' : 'ghost'} aria-pressed={days === value} onClick={() => setDays(value)}>{label}</Button>)}
      </div>
    </div>

    {error && <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</p>}
    {!loading && !error && !rows.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma ação assistida no período.</p>}

    <div className="space-y-2">
      {rows.map((row) => {
        const status = STATUS[row.status] ?? STATUS.pending;
        const Icon = status.icon;
        return <article key={row.id} className={`rounded-xl border p-3 text-sm ${status.className}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="size-4 shrink-0" />
            <b className="font-mono">{row.ticketKey}</b>
            <span className="rounded-md border border-current/20 px-2 py-0.5 text-xs font-semibold">{status.label}</span>
            {row.source === 'rovo' && <span className="rounded-md border border-current/20 px-2 py-0.5 text-xs">via Rovo</span>}
            <span className="ml-auto text-xs opacity-80">{formatWhen(row.createdAt)}</span>
          </div>
          <p className="mt-2 font-semibold">{row.description}</p>
          <p className="mt-1 text-xs opacity-80">
            Sugerida para {row.proposedTo}
            {row.confirmedBy && row.status === 'applied' ? ` · confirmada por ${row.confirmedBy}` : ''}
            {row.confirmedBy && row.status === 'cancelled' ? ` · recusada por ${row.confirmedBy}` : ''}
          </p>
          {row.error && <p className="mt-1 text-xs">Erro: {row.error}</p>}
        </article>;
      })}
    </div>
  </section>;
}

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
