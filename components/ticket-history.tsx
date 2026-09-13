'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Archive, ArrowDownAZ, ArrowUpAZ, CalendarClock, ChevronRight, FileCheck2, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type User = { getIdToken: () => Promise<string> } | null;
type ArchiveItem = {
  ticketKey: string; title: string; jiraStatus: string | null; operationalStatus: string | null;
  storeName: string | null; city: string | null; capturedAt: string; capturedBy: string; captureReason: string;
};
type HistoryDetail = {
  archive: (ArchiveItem & { snapshot: unknown }) | null;
  workflow: Record<string, unknown> | null;
  visits: Array<Record<string, unknown>>;
  evidence: Array<{ id: number; kind: string; name: string; mimeType: string; uploadedBy: string; createdAt: string }>;
  tasks: Array<Record<string, unknown>>;
  shipments: Array<Record<string, unknown>>;
  snapshots: Array<{ id: number; actorEmail: string; reason: string; createdAt: string }>;
  audit: Array<{ id: number; action: string; actorEmail: string; details: string | null; createdAt: string }>;
  n1: Record<string, unknown> | null;
};

export function TicketHistory({ user }: { user: User }) {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ascending, setAscending] = useState(false);
  const [selected, setSelected] = useState<ArchiveItem | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch('/api/ticket-history', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const payload = await response.json() as { items?: ArchiveItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar o histórico.');
        if (alive) setItems(payload.items ?? []);
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.'); }
      finally { if (alive) setLoading(false); }
    };
    void load();
    return () => { alive = false; };
  }, [user]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const current = !normalized ? items : items.filter((item) => [item.ticketKey, item.title, item.storeName, item.city, item.jiraStatus, item.operationalStatus].some((value) => value?.toLowerCase().includes(normalized)));
    return [...current].sort((a, b) => ascending ? Date.parse(a.capturedAt) - Date.parse(b.capturedAt) : Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  }, [ascending, items, query]);

  async function open(item: ArchiveItem) {
    if (!user) return;
    setSelected(item); setDetail(null); setDetailLoading(true);
    try {
      const response = await fetch(`/api/ticket-history/${encodeURIComponent(item.ticketKey)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as HistoryDetail & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível abrir este histórico.');
      setDetail(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir este histórico.'); }
    finally { setDetailLoading(false); }
  }

  return <section className="mt-6" aria-labelledby="ticket-history-title">
    <div className="surface-panel rounded-2xl p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Memória operacional</p><h2 id="ticket-history-title" className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Histórico de chamados</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Registros salvos no Caju OS continuam acessíveis mesmo depois que a FSA deixa de aparecer no Jira.</p></div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setAscending((value) => !value)} aria-pressed={ascending}>
          {ascending ? <ArrowUpAZ aria-hidden="true" /> : <ArrowDownAZ aria-hidden="true" />}{ascending ? 'Mais antigos primeiro' : 'Mais recentes primeiro'}
        </Button>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 pl-9" placeholder="Buscar por FSA, loja, cidade, título ou status" aria-label="Buscar no histórico de chamados" /></div>
        <p className="self-center text-sm tabular-nums text-muted-foreground">{filtered.length} registro{filtered.length === 1 ? '' : 's'}</p>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p>}
      {loading ? <div className="grid min-h-56 place-items-center"><Loader2 className="size-6 animate-spin text-primary" aria-label="Carregando histórico" /></div> : filtered.length ? <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/25">{filtered.map((item) => <li key={item.ticketKey}><button type="button" className="flex min-h-20 w-full items-center gap-3 p-3 text-left transition hover:bg-white/[.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4" onClick={() => void open(item)}><div className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100"><Archive className="size-5" aria-hidden="true" /></div><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><b className="font-mono text-sm text-primary">{item.ticketKey}</b><span className="text-sm font-semibold">{item.title}</span></span><span className="mt-1 block text-xs text-muted-foreground">{[item.storeName, item.city, item.operationalStatus ?? item.jiraStatus].filter(Boolean).join(' · ') || 'Dados salvos da operação'}</span></span><span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block"><time dateTime={item.capturedAt}>{formatDate(item.capturedAt)}</time><span className="mt-1 block">por {item.capturedBy.split('@')[0]}</span></span><ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" /></button></li>)}</ul> : <div className="mt-5 grid min-h-56 place-items-center rounded-xl border border-dashed border-border p-6 text-center"><Archive className="size-7 text-muted-foreground" aria-hidden="true" /><p className="mt-3 font-semibold">Nenhum chamado salvo ainda</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Os chamados passam a ser registrados automaticamente nas ações de operação, direcionamento, validação e finalização.</p></div>}
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setDetail(null); } }}>
      <DialogContent className="max-h-[min(88dvh,860px)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{selected?.ticketKey} · detalhes salvos</DialogTitle><DialogDescription>Esta é uma cópia persistente do sistema; ela não depende de o chamado ainda existir na fila do Jira.</DialogDescription></DialogHeader>
        {detailLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-6 animate-spin text-primary" aria-label="Carregando detalhes" /></div> : detail && <HistoryDetails detail={detail} />}
      </DialogContent>
    </Dialog>
  </section>;
}

function HistoryDetails({ detail }: { detail: HistoryDetail }) {
  const snapshot = detail.archive?.snapshot as Record<string, unknown> | null;
  const jira = snapshot && typeof snapshot.jira === 'object' && snapshot.jira ? snapshot.jira as Record<string, unknown> : null;
  return <div className="space-y-5 text-sm">
    <div className="grid gap-3 sm:grid-cols-2"><Info label="Último status Jira" value={detail.archive?.jiraStatus ?? string(jira?.status)} /><Info label="Etapa operacional" value={detail.archive?.operationalStatus ?? string(detail.workflow?.status)} /><Info label="Última captura" value={detail.archive ? `${formatDate(detail.archive.capturedAt)} · ${detail.archive.capturedBy}` : null} /><Info label="Motivo" value={detail.archive?.captureReason ?? null} /></div>
    <DetailGroup icon={<FileCheck2 aria-hidden="true" />} title="Dados do chamado"><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2"><Info label="Título" value={detail.archive?.title ?? string(jira?.summary)} /><Info label="Loja" value={detail.archive?.storeName ?? string(jira?.store)} /><Info label="Cidade" value={detail.archive?.city ?? string(jira?.city)} /><Info label="Prioridade" value={string(jira?.priority)} /><Info label="Descrição" value={string(jira?.description) ?? string(detail.workflow?.description)} wide /></dl></DetailGroup>
    <DetailGroup icon={<CalendarClock aria-hidden="true" />} title={`Auditoria e atividades (${detail.audit.length})`}><ol className="space-y-2">{detail.audit.length ? detail.audit.map((item) => <li key={item.id} className="rounded-lg border border-border bg-background/35 p-3"><p className="font-semibold">{item.action}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)} · {item.actorEmail}</p></li>) : <p className="text-muted-foreground">Nenhuma atividade local registrada.</p>}</ol></DetailGroup>
    <div className="grid gap-5 lg:grid-cols-2"><DetailGroup icon={<Archive aria-hidden="true" />} title={`Evidências (${detail.evidence.length})`}><ul className="space-y-1.5">{detail.evidence.length ? detail.evidence.map((item) => <li key={item.id} className="rounded-lg border border-border bg-background/35 px-3 py-2"><b>{item.name}</b><span className="block text-xs text-muted-foreground">{item.kind} · {formatDate(item.createdAt)}</span></li>) : <p className="text-muted-foreground">Sem evidências locais.</p>}</ul></DetailGroup><DetailGroup icon={<CalendarClock aria-hidden="true" />} title={`Visitas (${detail.visits.length})`}><ul className="space-y-1.5">{detail.visits.length ? detail.visits.map((item, index) => <li key={String(item.id ?? index)} className="rounded-lg border border-border bg-background/35 px-3 py-2">Visita {String(item.visitNumber ?? index + 1)} · {string(item.status) ?? 'Planejada'}<span className="block text-xs text-muted-foreground">{string(item.scheduledAt) ? formatDate(String(item.scheduledAt)) : 'Sem data registrada'}</span></li>) : <p className="text-muted-foreground">Sem visitas locais.</p>}</ul></DetailGroup></div>
    {(detail.tasks.length || detail.shipments.length || detail.snapshots.length) && <DetailGroup icon={<Archive aria-hidden="true" />} title="Registros associados"><p className="text-muted-foreground">{detail.tasks.length} tarefa(s), {detail.shipments.length} rastreio(s) e {detail.snapshots.length} backup(s) de alterações disponíveis neste histórico.</p></DetailGroup>}
  </div>;
}
function DetailGroup({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) { return <section className="rounded-xl border border-border bg-background/25 p-4"><h3 className="flex items-center gap-2 font-bold">{icon}{title}</h3><div className="mt-3">{children}</div></section>; }
function Info({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) { return <div className={wide ? 'sm:col-span-2' : ''}><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words font-medium">{value || 'Não informado'}</dd></div>; }
function string(value: unknown) { return typeof value === 'string' && value.trim() ? value : null; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
