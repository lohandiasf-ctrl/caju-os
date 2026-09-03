'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, CalendarClock, CircleDollarSign, ClipboardList, ExternalLink, Eye, Filter, Headphones, LayoutDashboard, List, Loader2, Map, MapPin, Menu, MessageCircle, PackageOpen, Plus, Save, Search, Settings, ShieldCheck, Users, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserMenu } from '@/components/user-menu';
import { useAuth } from '@/components/auth-provider';

type Status = 'Triagem' | 'Agendar' | 'Agendado' | 'Em atendimento';
type Ticket = { id: string; title: string; store: string; city: string; status: Status; rawStatus: string; priority: 'Alta' | 'Media' | 'Baixa'; technician?: string; schedule?: string; partnerTriggeredAt?: string };
type JiraTicket = { key: string; summary: string; status: string; statusCategory: string; priority: string; assignee: string | null; updatedAt: string; store: string | null; city: string | null; scheduledAt: string | null; partnerTriggeredAt: string | null };
type JiraDetails = JiraTicket & { description: string; reporter: string | null; issueType: string; project: string; createdAt: string; jiraUrl: string };
const columns: Status[] = ['Triagem', 'Agendar', 'Agendado', 'Em atendimento'];
const nav = [
  ['Visao geral', LayoutDashboard], ['Chamados', ClipboardList], ['Mapa operacional', Map], ['Agenda', CalendarClock],
  ['Central N1', Headphones], ['Tecnicos', Users], ['Projetos e lojas', Building2], ['Spares', PackageOpen], ['Financeiro', CircleDollarSign],
] as const;
const dots: Record<Status, string> = { Triagem: 'bg-amber-400', Agendar: 'bg-violet-400', Agendado: 'bg-blue-400', 'Em atendimento': 'bg-emerald-400' };

export default function Home() {
  const { role, user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [jiraLoading, setJiraLoading] = useState(true);
  const [jiraError, setJiraError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [menu, setMenu] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [details, setDetails] = useState<JiraDetails | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [dialogLoading, setDialogLoading] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tickets.filter((t) => [t.id, t.title, t.store, t.city, t.technician].filter(Boolean).some((v) => v!.toLowerCase().includes(q))) : tickets;
  }, [query, tickets]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setJiraLoading(true);
    setJiraError('');
    void user.getIdToken().then((token) => fetch('/api/jira/issues?limit=100', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }))
      .then(async (response) => {
        const payload = await response.json() as { issues?: JiraTicket[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o Jira.');
        if (active) setTickets((payload.issues ?? []).map(toTicket));
      })
      .catch((error: unknown) => { if (active) setJiraError(error instanceof Error ? error.message : 'Falha ao consultar o Jira.'); })
      .finally(() => { if (active) setJiraLoading(false); });
    return () => { active = false; };
  }, [user]);

  async function openTicket(ticket: Ticket) {
    if (!user) return;
    setSelected(ticket);
    setDetails(null);
    setDetailsVisible(false);
    setWhatsappUrl('');
    setDialogError('');
    setDialogLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [detailsResponse, linkResponse] = await Promise.all([
        fetch(`/api/jira/issues/${ticket.id}`, { headers, cache: 'no-store' }),
        fetch(`/api/jira/issues/${ticket.id}/whatsapp`, { headers, cache: 'no-store' }),
      ]);
      const detailsPayload = await detailsResponse.json() as JiraDetails & { error?: string };
      const linkPayload = await linkResponse.json() as { whatsappUrl?: string | null; error?: string };
      if (!detailsResponse.ok) throw new Error(detailsPayload.error || 'Não foi possível carregar os detalhes.');
      if (!linkResponse.ok) throw new Error(linkPayload.error || 'Não foi possível carregar o grupo.');
      setDetails(detailsPayload);
      setWhatsappUrl(linkPayload.whatsappUrl ?? '');
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Não foi possível carregar o chamado.');
    } finally {
      setDialogLoading(false);
    }
  }

  async function saveWhatsappLink() {
    if (!user || !selected) return;
    setLinkSaving(true);
    setDialogError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/jira/issues/${selected.id}/whatsapp`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappUrl }),
      });
      const payload = await response.json() as { whatsappUrl?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar o link.');
      setWhatsappUrl(payload.whatsappUrl ?? '');
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : 'Não foi possível salvar o link.');
    } finally {
      setLinkSaving(false);
    }
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'filter_operational_tickets',
      title: 'Filtrar chamados',
      description: 'Filtra o quadro operacional por chamado, loja, cidade ou tecnico.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Texto para buscar no quadro.' } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input: unknown) {
        if (!input || typeof input !== 'object' || typeof (input as { query?: unknown }).query !== 'string') throw new Error('query deve ser texto');
        const nextQuery = (input as { query: string }).query;
        setQuery(nextQuery);
        return { query: nextQuery, matchingTickets: tickets.filter((ticket) => [ticket.id, ticket.title, ticket.store, ticket.city, ticket.technician].filter(Boolean).some((value) => value!.toLowerCase().includes(nextQuery.toLowerCase()))).length };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  return <main className="min-h-screen bg-background text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-40 w-[252px] border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-12 items-center gap-3 px-2">
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground shadow-[0_8px_28px_rgba(229,98,35,.25)]">C</div>
        <div><div className="text-[15px] font-extrabold tracking-tight">Caju OS</div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Central de operacoes</div></div>
      </div>
      <nav className="mt-8 space-y-1" aria-label="Navegacao principal">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Operacao</p>
        {nav.filter(([label]) => role === 'gerencia' || (role === 'n1' ? !['Financeiro', 'Spares', 'Projetos e lojas'].includes(label) : !['Financeiro', 'Spares', 'Central N1', 'Projetos e lojas', 'Tecnicos'].includes(label))).map(([label, Icon], i) => ['Financeiro', 'Central N1', 'Spares', 'Mapa operacional'].includes(label)
          ? <a href={label === 'Financeiro' ? '/financeiro' : label === 'Central N1' ? '/central-n1' : label === 'Spares' ? '/spares' : '/mapa'} key={label} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"><Icon className="size-[18px]" />{label}</a>
          : <button key={label} className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${i === 0 ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Icon className={`size-[18px] ${i === 0 ? 'text-primary' : ''}`} />{label}</button>)}
      </nav>
      <div className="absolute inset-x-4 bottom-5 border-t border-sidebar-border pt-4">
        {role === 'gerencia' && <button className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Settings className="size-[18px]" /> Configurações</button>}
        <UserMenu />
      </div>
    </aside>
    {menu && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenu(false)} />}
    <section className="min-h-screen lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu /></Button>
        <div className="relative max-w-[440px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar chamado, loja ou tecnico..." className="h-10 bg-card pl-9" /></div>
        <div className={`ml-auto hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex ${jiraError ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}><span className={`size-1.5 rounded-full ${jiraError ? 'bg-amber-400' : 'bg-emerald-400'}`} />{jiraLoading ? 'Sincronizando Jira...' : jiraError ? 'Jira indisponível' : 'Jira conectado'}</div>
        <Button variant="ghost" size="icon" aria-label="Notificacoes" className="relative"><Bell /><span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" /></Button>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.14em] text-primary">Terca-feira, 1 de setembro</p><h1 className="text-2xl font-extrabold tracking-[-.03em] sm:text-3xl">Central de operacoes</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe a fila, a equipe e os atendimentos em andamento.</p></div><Button size="lg" className="h-10 px-4 font-bold shadow-[0_8px_24px_rgba(229,98,35,.2)]"><Plus /> Novo chamado</Button></div>
        <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Chamados carregados', String(tickets.length), 'Projeto FSA · dados do Jira', ClipboardList, 'text-blue-300'], ['Em atendimento', String(tickets.filter((item) => item.status === 'Em atendimento').length), 'Fila atual', Headphones, 'text-emerald-300'],
            ['Aguardando agenda', String(tickets.filter((item) => item.status === 'Agendar').length), 'Fila atual', CalendarClock, 'text-violet-300'], ['Prioridade alta', String(tickets.filter((item) => item.priority === 'Alta').length), 'Requer atenção', ShieldCheck, 'text-amber-300'],
          ].map(([label, value, note, Icon, color]) => <article key={label as string} className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,.08)] sm:p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">{label as string}</p><p className="mt-2 text-2xl font-extrabold sm:text-3xl">{value as string}</p></div><div className={`grid size-9 place-items-center rounded-lg bg-muted ${color}`}><Icon className="size-[18px]" /></div></div><p className="mt-3 text-[11px] text-muted-foreground">{note as string}</p></article>)}
        </div>
        {jiraError && <div role="alert" className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm text-amber-200">{jiraError}</div>}
        <div className="mt-8 flex flex-wrap items-center gap-2"><div className="mr-auto"><h2 className="text-lg font-bold">Fluxo de chamados</h2><p className="text-xs text-muted-foreground">{jiraLoading ? 'Carregando chamados reais...' : `${filtered.length} chamados exibidos`}</p></div><Button variant="outline" className="h-9"><Filter /> Filtros</Button><div className="flex rounded-lg border border-border bg-card p-1"><Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('kanban')}><Wrench /> Kanban</Button><Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('list')}><List /> Lista</Button></div></div>
        {view === 'kanban' ? <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">{columns.map((column) => {
          const items = filtered.filter((ticket) => ticket.status === column);
          return <section key={column} className="min-h-[280px] rounded-xl border border-border bg-muted/25 p-3"><div className="mb-3 flex items-center justify-between px-1"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${dots[column]}`} /><h3 className="text-xs font-bold uppercase tracking-[.08em]">{column}</h3></div><span className="rounded-md bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{items.length}</span></div><div className="space-y-3">{items.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={() => void openTicket(ticket)} />)}{!items.length && <div className="grid h-32 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">Nenhum chamado encontrado</div>}</div></section>;
        })}</div> : <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">{filtered.map((ticket) => <button type="button" onClick={() => void openTicket(ticket)} key={ticket.id} className="grid w-full gap-3 border-b border-border p-4 text-left transition hover:bg-muted/50 last:border-0 sm:grid-cols-[120px_1fr_150px_140px] sm:items-center"><span className="font-mono text-xs font-bold text-primary">{ticket.id}</span><div><p className="text-sm font-semibold">{ticket.title}</p><p className="text-xs text-muted-foreground">{ticket.store} · {ticket.city}</p></div><Badge variant="outline">{ticket.status}</Badge><span className="text-xs text-muted-foreground">{ticket.technician || 'Nao atribuido'}</span></button>)}</div>}
      </div>
    </section>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-primary">{selected?.id}</Badge><Badge variant="outline">{selected?.rawStatus}</Badge></div>
          <DialogTitle className="pr-8 text-lg leading-snug">{selected?.title}</DialogTitle>
          <DialogDescription>Escolha para onde deseja seguir.</DialogDescription>
        </DialogHeader>
        {dialogLoading ? <div className="grid min-h-40 place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" /><span className="sr-only">Carregando chamado</span></div> : <div className="space-y-4">
          {dialogError && <div role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{dialogError}</div>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" onClick={() => setDetailsVisible((value) => !value)} disabled={!details}><Eye className="size-5 text-blue-300" /><span><span className="block font-bold">Ver detalhes</span><span className="block text-xs font-normal text-muted-foreground">Dados completos</span></span></Button>
            <Button variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" render={<a href={details?.jiraUrl ?? '#'} target="_blank" rel="noreferrer" aria-disabled={!details} />} disabled={!details}><ExternalLink className="size-5 text-primary" /><span><span className="block font-bold">Abrir no Jira</span><span className="block text-xs font-normal text-muted-foreground">Chamado original</span></span></Button>
            <Button variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" render={<a href={whatsappUrl || '#'} target="_blank" rel="noreferrer" aria-disabled={!whatsappUrl} />} disabled={!whatsappUrl}><MessageCircle className="size-5 text-emerald-400" /><span><span className="block font-bold">Abrir WhatsApp</span><span className="block text-xs font-normal text-muted-foreground">{whatsappUrl ? 'Ir para o grupo' : 'Link não cadastrado'}</span></span></Button>
          </div>
          {detailsVisible && details && <section className="rounded-xl border border-border bg-muted/30 p-4"><div className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Status" value={details.status} /><Detail label="Prioridade" value={details.priority} /><Detail label="Responsável" value={details.assignee || 'Não atribuído'} /><Detail label="Solicitante" value={details.reporter || 'Não informado'} /><Detail label="Tipo" value={details.issueType || 'Não informado'} /><Detail label="Criado em" value={formatDate(details.createdAt)} /></div>{details.description && <div className="mt-4 border-t border-border pt-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Descrição</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{details.description}</p></div>}</section>}
          {(role === 'analista' || role === 'gerencia') && <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4"><div className="flex items-center gap-2"><MessageCircle className="size-5 text-emerald-400" /><div><h3 className="text-sm font-bold">Grupo do WhatsApp</h3><p className="text-xs text-muted-foreground">Cole o link de convite deste chamado.</p></div></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="url" value={whatsappUrl} onChange={(event) => setWhatsappUrl(event.target.value)} placeholder="https://chat.whatsapp.com/..." className="flex-1" /><Button onClick={() => void saveWhatsappLink()} disabled={linkSaving || !whatsappUrl.trim()}>{linkSaving ? <Loader2 className="animate-spin" /> : <Save />} Salvar link</Button></div></section>}
        </div>}
      </DialogContent>
    </Dialog>
  </main>;
}

function TicketCard({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-[0_10px_30px_rgba(0,0,0,.08)] transition hover:-translate-y-0.5 hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex justify-between gap-3"><span className="font-mono text-[11px] font-bold text-primary">{ticket.id}</span><Badge variant="outline" className={ticket.priority === 'Alta' ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'text-muted-foreground'}>{ticket.priority}</Badge></div><h4 className="mt-3 text-sm font-bold leading-snug">{ticket.title}</h4><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><p className="flex items-center gap-1.5"><Building2 className="size-3.5" />{ticket.store}</p><p className="flex items-center gap-1.5"><MapPin className="size-3.5" />{ticket.city}</p>{ticket.schedule && <p className="flex items-center gap-1.5 text-blue-300"><CalendarClock className="size-3.5" />Agendamento: {ticket.schedule}</p>}{ticket.partnerTriggeredAt && <p className="flex items-center gap-1.5 text-amber-300"><CalendarClock className="size-3.5" />Acionamento: {ticket.partnerTriggeredAt}</p>}</div><div className="mt-3 flex items-center justify-between border-t border-border pt-3"><span className="text-[10px] text-muted-foreground">{ticket.rawStatus}</span>{ticket.technician && <span className="text-[11px] font-semibold">{ticket.technician}</span>}</div></button>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }

function formatDate(value: string) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Não informado'; }

function toTicket(issue: JiraTicket): Ticket {
  const statusText = issue.status.trim().toLowerCase();
  const status: Status = statusText === 'agendado' ? 'Agendado' : statusText === 'agendamento' ? 'Agendar' : statusText === 'tec-campo' || issue.statusCategory === 'indeterminate' || statusText.includes('atendimento') ? 'Em atendimento' : 'Triagem';
  const priorityText = issue.priority.toLowerCase();
  const priority: Ticket['priority'] = priorityText.includes('highest') || priorityText.includes('high') || priorityText.includes('alta') ? 'Alta' : priorityText.includes('low') || priorityText.includes('baixa') ? 'Baixa' : 'Media';
  const updated = issue.updatedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(issue.updatedAt)) : 'sem data';
  const storeFromTitle = issue.summary.match(/^Loja\s+([^|]+)/i)?.[0]?.trim();
  return { id: issue.key, title: issue.summary, store: issue.store || storeFromTitle || 'Loja não informada', city: issue.city || `Atualizado em ${updated}`, status, rawStatus: issue.status, priority, technician: issue.assignee ?? undefined, schedule: formatJiraDate(issue.scheduledAt), partnerTriggeredAt: formatJiraDate(issue.partnerTriggeredAt) };
}

function formatJiraDate(value: string | null) {
  if (!value) return undefined;
  const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  const date = brazilian ? new Date(Number(brazilian[3]), Number(brazilian[2]) - 1, Number(brazilian[1]), Number(brazilian[4]), Number(brazilian[5]), Number(brazilian[6] ?? 0)) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
