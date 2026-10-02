'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { auth } from '@/lib/firebase';
import type { StoreVisit } from '@/lib/store-history';

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);
};

/** Histórico de uma loja: o que foi feito, quando, por quê, por quem e quanto foi lançado. */
export function StoreHistoryDialog({ code, onClose, onOpenTicket }: { code: string | null; onClose: () => void; onOpenTicket?: (ticketKey: string) => void }) {
  const [data, setData] = useState<{ visits: StoreVisit[]; total: number; count: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!code) return;
    let active = true;
    setData(null); setError('');
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const response = await fetch(`/api/stores/history?code=${encodeURIComponent(code)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const payload = await response.json() as { visits?: StoreVisit[]; total?: number; count?: number; error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar o histórico da loja.');
        if (active) setData({ visits: payload.visits ?? [], total: payload.total ?? 0, count: payload.count ?? 0 });
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico da loja.'); }
    })();
    return () => { active = false; };
  }, [code]);
  return (
    <Dialog open={Boolean(code)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle>Histórico da loja {code}</DialogTitle>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</p>
        ) : !data.visits.length ? (
          <p className="text-sm text-muted-foreground">Nenhum chamado registrado para esta loja ainda. Os chamados entram no histórico quando recebem alguma ação da operação.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{data.count} {data.count === 1 ? 'chamado' : 'chamados'} · total lançado <b className="text-foreground">{money(data.total)}</b></p>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {data.visits.map((visit) => (
                <li key={visit.ticketKey} className="p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <button type="button" onClick={() => onOpenTicket?.(visit.ticketKey)} className="font-mono text-sm font-bold text-primary hover:underline">{visit.ticketKey}</button>
                    <span className="text-xs text-muted-foreground">{when(visit.when)}{visit.status ? ` · ${visit.status}` : ''}</span>
                  </div>
                  <p className="mt-1 text-sm">{visit.title}</p>
                  {visit.defect && <p className="mt-1 text-xs text-muted-foreground"><b>Por quê:</b> {visit.defect}</p>}
                  {visit.summary && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground"><b>O que foi feito:</b> {visit.summary}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {visit.technician && <span>Técnico: {visit.technician}</span>}
                    {visit.visitCost1 !== null && <span>Visita: {money(visit.visitCost1)}</span>}
                    {visit.equipmentTotal !== null && visit.equipmentTotal > 0 && <span>Equipamentos: {money(visit.equipmentTotal)}</span>}
                    {visit.total !== null && <span className="font-semibold text-foreground">Total: {money(visit.total)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
