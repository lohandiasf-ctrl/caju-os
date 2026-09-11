'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, Search, UserRound, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type User = { getIdToken: () => Promise<string> } | null;
type Ticket = { id: string; title: string; store: string; city: string };
type Technician = { id: number; technicianCode: string | null; name: string; cpf: string | null; phone: string | null; city: string; state: string };
type Result = { key: string; ok: boolean; error?: string };

export function BulkScheduleDialog({ open, tickets, user, onOpenChange, onScheduled }: {
  open: boolean;
  tickets: Ticket[];
  user: User;
  onOpenChange: (open: boolean) => void;
  onScheduled: (keys: string[], scheduledAt: string) => void;
}) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [technicianQuery, setTechnicianQuery] = useState('');
  const [technicianData, setTechnicianData] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    setLoadingTechnicians(true);
    void user.getIdToken()
      .then((token) => fetch('/api/technicians', { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (response) => response.ok ? await response.json() as { technicians?: Technician[] } : { technicians: [] })
      .then((payload) => { if (active) setTechnicians(payload.technicians ?? []); })
      .catch(() => { if (active) setTechnicians([]); })
      .finally(() => { if (active) setLoadingTechnicians(false); });
    return () => { active = false; };
  }, [open, user]);

  useEffect(() => {
    if (open) return;
    setTechnicianQuery(''); setTechnicianData(''); setScheduledAt(''); setError(''); setResults(null);
  }, [open]);

  const matches = useMemo(() => {
    const query = technicianQuery.trim().toLocaleLowerCase('pt-BR');
    if (!query) return [];
    return technicians.filter((technician) => `${technician.name} ${technician.technicianCode ?? ''} ${technician.cpf ?? ''} ${technician.city} ${technician.state}`.toLocaleLowerCase('pt-BR').includes(query)).slice(0, 7);
  }, [technicianQuery, technicians]);
  const successCount = results?.filter((item) => item.ok).length ?? 0;

  function selectTechnician(technician: Technician) {
    setTechnicianQuery(technician.name);
    setTechnicianData(`Nome: ${technician.name}\nCPF: ${technician.cpf || 'Não informado'}\nRG: Não informado\nTEL: ${technician.phone || 'Não informado'}`);
  }

  async function submit() {
    if (!user || saving) return;
    if (!technicianData.trim() || !scheduledAt) {
      setError('Selecione um técnico e informe a data/hora que será aplicada a todos os chamados.');
      return;
    }
    setSaving(true); setError(''); setResults(null);
    try {
      const response = await fetch('/api/jira/issues/batch-schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: tickets.map((ticket) => ticket.id), technicianData, scheduledDateTime: toJiraDateTime(scheduledAt) }),
      });
      const payload = await response.json() as { error?: string; results?: Result[] };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível agendar os chamados.');
      const next = payload.results ?? [];
      setResults(next);
      const successes = next.filter((item) => item.ok).map((item) => item.key);
      if (successes.length) onScheduled(successes, scheduledAt);
      if (!successes.length) setError('Nenhum chamado foi agendado. Revise os erros abaixo e tente novamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível agendar os chamados.');
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-violet-300" />Agendar {tickets.length} chamado{tickets.length === 1 ? '' : 's'}</DialogTitle>
        <DialogDescription>As mesmas informações serão enviadas ao Jira e a transição para “Agendado” será feita em cada FSA selecionada.</DialogDescription>
      </DialogHeader>

      <section className="rounded-xl border border-violet-400/25 bg-violet-400/8 p-3" aria-label="Chamados selecionados">
        <p className="text-xs font-bold uppercase tracking-wide text-violet-200">Chamados selecionados</p>
        <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {tickets.map((ticket) => <span key={ticket.id} className="rounded-md border border-violet-300/20 bg-background/40 px-2 py-1 font-mono text-xs font-bold text-violet-100" title={`${ticket.title} · ${ticket.store}`}>{ticket.id}</span>)}
        </div>
      </section>

      {!results && <div className="space-y-4">
        <div className="relative">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="bulk-technician-search">Técnico responsável</label>
          <div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="bulk-technician-search" type="search" value={technicianQuery} onChange={(event) => setTechnicianQuery(event.target.value)} placeholder={loadingTechnicians ? 'Carregando técnicos...' : 'Digite nome, cidade, CPF ou código'} className="min-h-11 pl-9" autoComplete="off" disabled={saving} /></div>
          {matches.length > 0 && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl">{matches.map((technician) => <button key={technician.id} type="button" onClick={() => selectTechnician(technician)} className="block min-h-11 w-full rounded-lg px-3 py-2 text-left transition hover:bg-primary/10 focus-visible:bg-primary/10"><span className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-3.5 text-primary" />{technician.name}</span><span className="block pl-5 text-xs text-muted-foreground">{technician.city}/{technician.state}{technician.technicianCode ? ` · ${technician.technicianCode}` : ''}</span></button>)}</div>}
        </div>
        <label className="block text-xs font-semibold text-muted-foreground" htmlFor="bulk-technician-data">Dados que serão enviados ao Jira<textarea id="bulk-technician-data" rows={4} value={technicianData} onChange={(event) => setTechnicianData(event.target.value)} className="field mt-1.5 min-h-24 w-full text-foreground" disabled={saving} /><span className="mt-1 block text-[11px] font-normal text-muted-foreground">Nome, CPF, RG e telefone são aplicados igualmente em todos os chamados.</span></label>
        <label className="block text-xs font-semibold text-muted-foreground" htmlFor="bulk-scheduled-at">Data e hora do atendimento<input id="bulk-scheduled-at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="field mt-1.5 min-h-11 w-full text-foreground" disabled={saving} /></label>
      </div>}

      {error && <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      {results && <section aria-live="polite" className="space-y-2"><p className="text-sm font-semibold">{successCount} de {results.length} chamado{results.length === 1 ? '' : 's'} agendado{successCount === 1 ? '' : 's'}.</p>{results.map((result) => <div key={result.key} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-400/25 bg-emerald-400/8 text-emerald-100' : 'border-red-400/25 bg-red-400/8 text-red-100'}`}>{result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}<span><b className="font-mono">{result.key}</b>{result.ok ? ' · Agendado no Jira.' : ` · ${result.error}`}</span></div>)}</section>}

      <DialogFooter showCloseButton={Boolean(results)}>
        {!results && <><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button onClick={() => void submit()} disabled={saving || !tickets.length}>{saving ? <><Loader2 className="animate-spin" />Agendando...</> : <><CalendarClock />Agendar {tickets.length} chamado{tickets.length === 1 ? '' : 's'}</>}</Button></>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function toJiraDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00.000-0300` : value;
}
