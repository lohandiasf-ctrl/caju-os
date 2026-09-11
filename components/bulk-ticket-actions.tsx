'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, Clipboard, ClipboardCheck, Clock3, Loader2, Search, UserRound, Wrench, X, XCircle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { canBulkTransition, isBulkEligible, MAX_BULK_TICKETS, ticketsToClipboard, type BulkStatus, type BulkTicket, type ClipboardFormat } from '@/lib/bulk-actions';
import { copyToClipboard } from '@/lib/clipboard';

type User = { getIdToken: () => Promise<string> } | null;
type Technician = { id: number; technicianCode: string | null; name: string; cpf: string | null; phone: string | null; city: string; state: string };
type Result = { key: string; ok: boolean; queued?: boolean; error?: string };

const SOURCE_LABEL: Record<BulkStatus, string> = { scheduled: 'Pendente de agendamento', in_service: 'Agendado' };
const COPY_OPTIONS: Array<[ClipboardFormat, string, string]> = [
  ['keys', 'Só as FSAs', 'Uma por linha'],
  ['message', 'Resumo para mensagem', 'WhatsApp, e-mail, Teams'],
  ['sheet', 'Planilha', 'Colunas para colar no Excel'],
];

function count(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function BulkTicketActions({ tickets, role, user, onClear, onApplied }: {
  tickets: BulkTicket[];
  role: string | null | undefined;
  user: User;
  onClear: () => void;
  onApplied: (status: BulkStatus, keys: string[], scheduledAt?: string) => void;
}) {
  const [mode, setMode] = useState<BulkStatus | null>(null);
  const [targets, setTargets] = useState<BulkTicket[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [technicianQuery, setTechnicianQuery] = useState('');
  const [technicianData, setTechnicianData] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');

  const canTransition = canBulkTransition(role);
  const toSchedule = useMemo(() => tickets.filter((ticket) => isBulkEligible(ticket.rawStatus, 'scheduled')), [tickets]);
  const toField = useMemo(() => tickets.filter((ticket) => isBulkEligible(ticket.rawStatus, 'in_service')), [tickets]);

  useEffect(() => {
    if (mode !== 'scheduled' || !user) return;
    let active = true;
    setLoadingTechnicians(true);
    void user.getIdToken()
      .then((token) => fetch('/api/technicians', { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (response) => response.ok ? await response.json() as { technicians?: Technician[] } : { technicians: [] })
      .then((payload) => { if (active) setTechnicians(payload.technicians ?? []); })
      .catch(() => { if (active) setTechnicians([]); })
      .finally(() => { if (active) setLoadingTechnicians(false); });
    return () => { active = false; };
  }, [mode, user]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2200);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const matches = useMemo(() => {
    const query = technicianQuery.trim().toLocaleLowerCase('pt-BR');
    if (!query) return [];
    return technicians.filter((technician) => `${technician.name} ${technician.technicianCode ?? ''} ${technician.cpf ?? ''} ${technician.city} ${technician.state}`.toLocaleLowerCase('pt-BR').includes(query)).slice(0, 7);
  }, [technicianQuery, technicians]);

  function open(status: BulkStatus) {
    const eligible = status === 'scheduled' ? toSchedule : toField;
    setTargets(eligible);
    setSkipped(tickets.length - eligible.length);
    setTechnicianQuery(''); setTechnicianData(''); setScheduledAt(''); setError(''); setResults(null);
    setMode(status);
  }

  function selectTechnician(technician: Technician) {
    setTechnicianQuery(technician.name);
    setTechnicianData(`Nome: ${technician.name}\nCPF: ${technician.cpf || 'Não informado'}\nRG: Não informado\nTEL: ${technician.phone || 'Não informado'}`);
  }

  async function copy(format: ClipboardFormat) {
    const ok = await copyToClipboard(ticketsToClipboard(tickets, format)).catch(() => false);
    setCopyState(ok ? 'ok' : 'fail');
  }

  async function submit() {
    if (!user || !mode || saving) return;
    if (mode === 'scheduled' && (!technicianData.trim() || !scheduledAt)) {
      setError('Selecione um técnico e informe a data/hora que será aplicada a todos os chamados.');
      return;
    }
    setSaving(true); setError(''); setResults(null);
    try {
      const response = await fetch('/api/jira/issues/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: mode,
          keys: targets.map((ticket) => ticket.id),
          ...(mode === 'scheduled' ? { technicianData, scheduledDateTime: toJiraDateTime(scheduledAt) } : {}),
        }),
      });
      const payload = await response.json() as { error?: string; results?: Result[] };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível alterar os chamados.');
      const next = payload.results ?? [];
      setResults(next);
      const done = next.filter((item) => item.ok).map((item) => item.key);
      if (done.length) onApplied(mode, done, mode === 'scheduled' ? scheduledAt : undefined);
      else if (!next.some((item) => item.queued)) setError('Nenhum chamado foi alterado. Revise os motivos abaixo.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar os chamados.');
    } finally {
      setSaving(false);
    }
  }

  const successCount = results?.filter((item) => item.ok).length ?? 0;
  const queuedCount = results?.filter((item) => item.queued).length ?? 0;
  const accent = mode === 'in_service'
    ? { icon: 'text-emerald-300', box: 'border-emerald-400/25 bg-emerald-400/8', label: 'text-emerald-200', chip: 'border-emerald-300/20 text-emerald-100' }
    : { icon: 'text-violet-300', box: 'border-violet-400/25 bg-violet-400/8', label: 'text-violet-200', chip: 'border-violet-300/20 text-violet-100' };
  const title = mode === 'in_service'
    ? `Mover ${count(targets.length, 'chamado', 'chamados')} para Técnico em campo`
    : `Agendar ${count(targets.length, 'chamado', 'chamados')}`;

  return <>
    {tickets.length > 0 && <>
      {/* Espaço para a barra fixa não cobrir os últimos cards. */}
      <div aria-hidden="true" className="h-20" />
      <div role="toolbar" aria-label="Ações em lote" className="fixed bottom-4 left-4 right-20 z-(--z-float) flex flex-wrap items-center gap-2 rounded-2xl border border-violet-400/30 bg-card/95 p-2 shadow-2xl backdrop-blur-xl xl:left-1/2 xl:right-auto xl:-translate-x-1/2">
        <span className="px-2 text-sm font-semibold"><b className="text-violet-200">{tickets.length}</b> {tickets.length === 1 ? 'selecionado' : 'selecionados'}</span>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', className: 'h-9' })}>
            {copyState === 'ok' ? <ClipboardCheck className="text-emerald-300" /> : <Clipboard />}
            {copyState === 'ok' ? 'Copiado' : copyState === 'fail' ? 'Falhou' : 'Copiar'}
            <ChevronDown className="size-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            {COPY_OPTIONS.map(([format, label, hint]) => <DropdownMenuItem key={format} onClick={() => void copy(format)} className="flex-col items-start gap-0 py-2">
              <span className="font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        {canTransition && toSchedule.length > 0 && <Button className="h-9" onClick={() => open('scheduled')} disabled={toSchedule.length > MAX_BULK_TICKETS} title={toSchedule.length > MAX_BULK_TICKETS ? `Máximo de ${MAX_BULK_TICKETS} chamados por vez` : undefined}>
          <CalendarClock /> Agendar {toSchedule.length}
        </Button>}
        {canTransition && toField.length > 0 && <Button variant="secondary" className="h-9" onClick={() => open('in_service')} disabled={toField.length > MAX_BULK_TICKETS} title={toField.length > MAX_BULK_TICKETS ? `Máximo de ${MAX_BULK_TICKETS} chamados por vez` : undefined}>
          <Wrench /> Técnico em campo {toField.length}
        </Button>}
        <Button variant="ghost" className="size-9 p-0" onClick={onClear} aria-label="Limpar seleção" title="Limpar seleção"><X /></Button>
        <span className="sr-only" aria-live="polite">{copyState === 'ok' ? `${count(tickets.length, 'chamado copiado', 'chamados copiados')}.` : copyState === 'fail' ? 'Não foi possível copiar.' : ''}</span>
      </div>
    </>}

    <Dialog open={mode !== null} onOpenChange={(next) => { if (!next && !saving) setMode(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{mode === 'in_service' ? <Wrench className={`size-5 ${accent.icon}`} /> : <CalendarClock className={`size-5 ${accent.icon}`} />}{title}</DialogTitle>
          <DialogDescription>
            {mode === 'in_service'
              ? 'Cada FSA sai de “Agendado” e vai para “Técnico em campo” no Jira. Use quando o técnico já estiver a caminho ou no local.'
              : 'As mesmas informações serão enviadas ao Jira e a transição para “Agendado” será feita em cada FSA.'}
          </DialogDescription>
        </DialogHeader>

        <section className={`rounded-xl border p-3 ${accent.box}`} aria-label="Chamados que serão alterados">
          <p className={`text-xs font-bold uppercase tracking-wide ${accent.label}`}>Chamados que serão alterados</p>
          <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {targets.map((ticket) => <span key={ticket.id} className={`rounded-md border bg-background/40 px-2 py-1 font-mono text-xs font-bold ${accent.chip}`} title={`${ticket.title} · ${ticket.store}`}>{ticket.id}</span>)}
          </div>
          {skipped > 0 && mode && <p className="mt-2 text-xs text-amber-200">{count(skipped, 'selecionado ficou', 'selecionados ficaram')} de fora por não estar em “{SOURCE_LABEL[mode]}”.</p>}
        </section>

        {mode === 'scheduled' && !results && <div className="space-y-4">
          <div className="relative">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="bulk-technician-search">Técnico responsável</label>
            <div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="bulk-technician-search" type="search" value={technicianQuery} onChange={(event) => setTechnicianQuery(event.target.value)} placeholder={loadingTechnicians ? 'Carregando técnicos...' : 'Digite nome, cidade, CPF ou código'} className="min-h-11 pl-9" autoComplete="off" disabled={saving} /></div>
            {matches.length > 0 && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl">{matches.map((technician) => <button key={technician.id} type="button" onClick={() => selectTechnician(technician)} className="block min-h-11 w-full rounded-lg px-3 py-2 text-left transition hover:bg-primary/10 focus-visible:bg-primary/10"><span className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-3.5 text-primary" />{technician.name}</span><span className="block pl-5 text-xs text-muted-foreground">{technician.city}/{technician.state}{technician.technicianCode ? ` · ${technician.technicianCode}` : ''}</span></button>)}</div>}
          </div>
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="bulk-technician-data">Dados que serão enviados ao Jira<textarea id="bulk-technician-data" rows={4} value={technicianData} onChange={(event) => setTechnicianData(event.target.value)} className="field mt-1.5 min-h-24 w-full text-foreground" disabled={saving} /><span className="mt-1 block text-[11px] font-normal text-muted-foreground">Nome, CPF, RG e telefone são aplicados igualmente em todos os chamados.</span></label>
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="bulk-scheduled-at">Data e hora do atendimento<input id="bulk-scheduled-at" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="field mt-1.5 min-h-11 w-full text-foreground" disabled={saving} /></label>
        </div>}

        {error && <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {results && <section aria-live="polite" className="space-y-2">
          <p className="text-sm font-semibold">{successCount} de {count(results.length, 'chamado alterado', 'chamados alterados')}{queuedCount ? ` · ${queuedCount} guardado${queuedCount === 1 ? '' : 's'} para sincronizar` : ''}.</p>
          {results.map((result) => <div key={result.key} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-400/25 bg-emerald-400/8 text-emerald-100' : result.queued ? 'border-amber-400/25 bg-amber-400/8 text-amber-100' : 'border-red-400/25 bg-red-400/8 text-red-100'}`}>
            {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : result.queued ? <Clock3 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
            <span><b className="font-mono">{result.key}</b>{result.ok ? ' · Atualizado no Jira.' : ` · ${result.error}`}</span>
          </div>)}
        </section>}

        <DialogFooter showCloseButton={Boolean(results)}>
          {!results && <>
            <Button variant="outline" onClick={() => setMode(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={saving || !targets.length}>
              {saving ? <><Loader2 className="animate-spin" />Enviando ao Jira...</> : mode === 'in_service' ? <><Wrench />Mover {targets.length} para campo</> : <><CalendarClock />Agendar {targets.length}</>}
            </Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function toJiraDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00.000-0300` : value;
}
