'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, CalendarClock, CircleDollarSign, ClipboardList, ExternalLink, Eye, Filter, Headphones, LayoutDashboard, List, Loader2, Map, MapPin, Menu, MessageCircle, PackageOpen, Plus, Save, Search, Settings, ShieldCheck, Users, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserMenu } from '@/components/user-menu';
import { useAuth } from '@/components/auth-provider';

type Status = 'Pendente de agendamento' | 'Agendado' | 'Aguardando spare' | 'Direcionado' | 'Técnico em campo';
type DashboardView = 'overview' | 'tickets' | 'central' | 'agenda' | 'technicians' | 'projects' | 'settings';
type Ticket = { id: string; title: string; store: string; city: string; status: Status; rawStatus: string; priority: 'Alta' | 'Media' | 'Baixa'; technician?: string; schedule?: string; partnerTriggeredAt?: string };
type JiraTicket = { key: string; summary: string; status: string; statusCategory: string; priority: string; assignee: string | null; updatedAt: string; store: string | null; city: string | null; scheduledAt: string | null; partnerTriggeredAt: string | null };
type JiraDetails = JiraTicket & { description: string; reporter: string | null; issueType: string; project: string; createdAt: string; jiraUrl: string };
type N1User = { email: string; role: 'n1' };
const columns: Status[] = ['Pendente de agendamento', 'Agendado', 'Aguardando spare', 'Direcionado', 'Técnico em campo'];
const nav = [
  ['Visão geral', LayoutDashboard, '/?view=overview', 'overview'], ['Chamados', ClipboardList, '/?view=tickets', 'tickets'], ['Mapa operacional', Map, '/mapa', 'map'], ['Agenda', CalendarClock, '/?view=agenda', 'agenda'],
  ['Central N1', Headphones, '/?view=central', 'central'], ['Equipe N1', Users, '/?view=technicians', 'technicians'], ['Projetos e lojas', Building2, '/?view=projects', 'projects'], ['Spares', PackageOpen, '/spares', 'spares'], ['Financeiro', CircleDollarSign, '/financeiro', 'finance'],
] as const;
const dots: Record<Status, string> = { 'Pendente de agendamento': 'bg-violet-400', Agendado: 'bg-blue-400', 'Aguardando spare': 'bg-amber-400', Direcionado: 'bg-cyan-400', 'Técnico em campo': 'bg-emerald-400' };
const viewCopy: Record<DashboardView, [string, string, string]> = {
  overview: ['Operação em tempo real', 'Visão geral dos chamados', 'Fila, prioridade e execução em uma única visão.'],
  tickets: ['Central de atendimento', 'Chamados operacionais', 'Consulte, filtre e abra cada chamado sem perder contexto.'],
  central: ['Atendimento N1', 'Central N1', 'Fila real de chamados que exige acompanhamento da equipe N1.'],
  agenda: ['Planejamento de campo', 'Agenda de atendimentos', 'Agendamentos e itens que ainda precisam de data.'],
  technicians: ['Atendimento interno', 'Equipe N1', 'Contas N1 ativas e autorizadas no sistema.'],
  projects: ['Cobertura operacional', 'Projetos e lojas', 'Locais com chamados ativos e volume por unidade.'],
  settings: ['Administração', 'Configurações do sistema', 'Perfil, integrações e estado dos serviços.'],
};

export default function Home() {
  const { role, user } = useAuth();
  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [jiraLoading, setJiraLoading] = useState(true);
  const [jiraError, setJiraError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | 'Todos'>('Todos');
  const [menu, setMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [details, setDetails] = useState<JiraDetails | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [dialogLoading, setDialogLoading] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [n1Users, setN1Users] = useState<N1User[]>([]);
  const [n1Loading, setN1Loading] = useState(true);

  useEffect(() => {
    const syncView = () => setActiveView(dashboardViewFromLocation());
    syncView();
    window.addEventListener('popstate', syncView);
    return () => window.removeEventListener('popstate', syncView);
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesQuery = !q || [ticket.id, ticket.title, ticket.store, ticket.city, ticket.technician].filter(Boolean).some((value) => value!.toLowerCase().includes(q));
      return matchesQuery && (statusFilter === 'Todos' || ticket.status === statusFilter);
    });
  }, [query, statusFilter, tickets]);
  const stores = useMemo(() => Array.from(new Set(tickets.map((ticket) => `${ticket.store}|||${ticket.city}`))).map((value) => {
    const [store, city] = value.split('|||');
    return { store, city, tickets: tickets.filter((ticket) => ticket.store === store).length };
  }).sort((a, b) => b.tickets - a.tickets), [tickets]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setJiraLoading(true);
    setJiraError('');
    void user.getIdToken().then(async (token) => {
      const issues: JiraTicket[] = [];
      let cursor: string | null = null;
      let isLast = false;

      while (!isLast) {
        const params = new URLSearchParams({ limit: '100' });
        if (cursor) params.set('cursor', cursor);
        const response = await fetch(`/api/jira/issues?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const payload = await response.json() as { issues?: JiraTicket[]; nextPageToken?: string | null; isLast?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Não foi possível consultar o Jira.');
        issues.push(...(payload.issues ?? []));
        cursor = payload.nextPageToken ?? null;
        isLast = payload.isLast ?? !cursor;
        if (!cursor) isLast = true;
      }
      if (active) setTickets(issues.map(toTicket));
    })
      .catch((error: unknown) => { if (active) setJiraError(error instanceof Error ? error.message : 'Falha ao consultar o Jira.'); })
      .finally(() => { if (active) setJiraLoading(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setN1Loading(true);
    void user.getIdToken().then(async (token) => {
      const response = await fetch('/api/users/n1', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json() as { users?: N1User[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar equipe N1.');
      if (active) setN1Users(payload.users ?? []);
    }).catch(() => { if (active) setN1Users([]); }).finally(() => { if (active) setN1Loading(false); });
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

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith('/?view=') || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, '', href);
    setActiveView(dashboardViewFromLocation());
    setMenu(false);
    setNotificationsOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
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

  return <main className="min-h-screen text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-12 items-center gap-3 px-2">
        <div className="grid size-10 place-items-center rounded-xl border border-primary/30 bg-primary/12 text-lg font-black text-primary shadow-[0_10px_30px_rgba(240,122,63,.18)]">C</div>
        <div><div className="text-[15px] font-extrabold tracking-tight">Caju OS</div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Comando operacional</div></div>
      </div>
      <nav className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-4 pr-1" aria-label="Navegacao principal">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Operacao</p>
        {nav.filter(([label]) => role === 'gerencia' || (role === 'n1' ? !['Financeiro', 'Spares', 'Projetos e lojas'].includes(label) : !['Financeiro', 'Spares', 'Central N1', 'Projetos e lojas', 'Técnicos'].includes(label))).map(([label, Icon, href, key]) => {
          const isActive = key === activeView;
          return <a href={href} onClick={(event) => navigate(event, href)} key={label} aria-current={isActive ? 'page' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${isActive ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary),0_8px_24px_rgba(0,0,0,.12)]' : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'}`}><Icon aria-hidden="true" className={`size-[18px] ${isActive ? 'text-primary' : ''}`} />{label}</a>;
        })}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border pt-3">
        {role === 'gerencia' && <a href="/?view=settings" onClick={(event) => navigate(event, '/?view=settings')} aria-current={activeView === 'settings' ? 'page' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition ${activeView === 'settings' ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Settings aria-hidden="true" className="size-[18px]" /> Configurações</a>}
        <UserMenu />
      </div>
    </aside>
    {menu && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenu(false)} />}
    <section className="min-h-screen lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-5">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu /></Button>
        <div className="relative max-w-[440px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar chamado, loja ou tecnico..." className="h-10 bg-card pl-9" /></div>
        <div className={`ml-auto hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex ${jiraError ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}><span className={`size-1.5 rounded-full ${jiraError ? 'bg-amber-400' : 'bg-emerald-400'}`} />{jiraLoading ? 'Sincronizando Jira...' : jiraError ? 'Jira indisponível' : 'Jira conectado'}</div>
        <Button variant="ghost" size="icon" aria-label="Notificações" aria-expanded={notificationsOpen} className="relative" onClick={() => setNotificationsOpen((value) => !value)}><Bell /><span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" /></Button>
        {notificationsOpen && <div className="surface-panel absolute right-4 top-[60px] z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl p-4 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Central de alertas</h2><Badge variant="outline">{tickets.filter((ticket) => ticket.priority === 'Alta').length}</Badge></div><p className="mt-3 text-sm text-muted-foreground">{tickets.some((ticket) => ticket.priority === 'Alta') ? 'Há chamados de prioridade alta que precisam de atenção.' : 'Nenhum alerta crítico no momento.'}</p><a href="/?view=tickets" onClick={(event) => navigate(event, '/?view=tickets')} className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">Ver chamados</a></div>}
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-primary">{viewCopy[activeView][0]}</p><h1 className="text-2xl font-semibold tracking-[-.04em] sm:text-[2rem]">{viewCopy[activeView][1]}</h1><p className="mt-2 text-sm text-muted-foreground">{viewCopy[activeView][2]}</p></div>{activeView !== 'settings' && <Button size="lg" className="h-11 px-4 font-bold shadow-[0_10px_28px_color-mix(in_oklab,var(--primary)_20%,transparent)]" render={<a href="https://delfia.atlassian.net/secure/CreateIssue!default.jspa" target="_blank" rel="noreferrer" />}><Plus /> Novo chamado</Button>}</div>
        {activeView === 'overview' && <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Chamados relevantes', String(tickets.length), 'Fluxo operacional ativo', ClipboardList, 'text-blue-300'], ['Técnico em campo', String(tickets.filter((item) => item.status === 'Técnico em campo').length), 'Atendimentos atuais', Headphones, 'text-emerald-300'],
            ['Pendente de agenda', String(tickets.filter((item) => item.status === 'Pendente de agendamento').length), 'Requer agendamento', CalendarClock, 'text-violet-300'], ['Aguardando spare', String(tickets.filter((item) => item.status === 'Aguardando spare').length), 'Material pendente', ShieldCheck, 'text-amber-300'],
          ].map(([label, value, note, Icon, color]) => <article key={label as string} className="surface-panel metric-glow rounded-2xl p-4 sm:p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{label as string}</p><p className="mt-3 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">{value as string}</p></div><div className={`grid size-10 place-items-center rounded-xl border border-white/5 bg-black/15 ${color}`}><Icon className="size-[18px]" /></div></div><p className="mt-4 text-xs text-muted-foreground">{note as string}</p></article>)}
        </div>}
        {jiraError && <div role="alert" className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm text-amber-200">{jiraError}</div>}
        {(activeView === 'overview' || activeView === 'tickets' || activeView === 'central') && <><div className="mt-8 flex flex-wrap items-center gap-2"><div className="mr-auto"><h2 className="text-lg font-bold">Fluxo de chamados</h2><p className="text-xs text-muted-foreground">{jiraLoading ? 'Carregando chamados reais...' : `${filtered.length} chamados exibidos`}</p></div><Button variant={showFilters ? 'secondary' : 'outline'} className="h-9" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}><Filter /> Filtros</Button><div className="flex rounded-lg border border-border bg-card p-1"><Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('kanban')}><Wrench /> Kanban</Button><Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('list')}><List /> Lista</Button></div></div>
        {showFilters && <div className="surface-panel mt-3 flex flex-wrap gap-2 rounded-xl p-3" aria-label="Filtrar por status">{(['Todos', ...columns] as const).map((status) => <Button key={status} size="sm" variant={statusFilter === status ? 'default' : 'ghost'} onClick={() => setStatusFilter(status)}>{status}</Button>)}</div>}
        {view === 'kanban' ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">{columns.map((column) => {
          const items = filtered.filter((ticket) => ticket.status === column);
          return <section key={column} className="surface-panel min-h-[280px] rounded-2xl p-3"><div className="mb-3 flex items-center justify-between px-1"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${dots[column]}`} /><h3 className="text-xs font-bold uppercase tracking-[.08em]">{column}</h3></div><span className="rounded-lg border border-white/5 bg-black/15 px-2 py-1 text-[10px] font-bold text-muted-foreground">{items.length}</span></div><div className="space-y-3">{items.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={() => void openTicket(ticket)} />)}{!items.length && <div className="grid h-32 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">Nenhum chamado encontrado</div>}</div></section>;
        })}</div> : <div className="surface-panel mt-4 overflow-hidden rounded-2xl">{filtered.map((ticket) => <button type="button" onClick={() => void openTicket(ticket)} key={ticket.id} className="grid w-full gap-3 border-b border-border p-4 text-left transition hover:bg-white/[.035] last:border-0 sm:grid-cols-[120px_1fr_150px_140px] sm:items-center"><span className="font-mono text-xs font-bold text-primary">{ticket.id}</span><div><p className="text-sm font-semibold">{ticket.title}</p><p className="text-xs text-muted-foreground">{ticket.store} · {ticket.city}</p></div><Badge variant="outline">{ticket.status}</Badge><span className="text-xs text-muted-foreground">{ticket.technician || 'Não atribuído'}</span></button>)}{!filtered.length && <EmptyState label="Nenhum chamado encontrado" />}</div>}</>}
        {activeView === 'agenda' && <AgendaView tickets={tickets} loading={jiraLoading} onOpen={openTicket} />}
        {activeView === 'technicians' && <TechniciansView users={n1Users} loading={n1Loading} />}
        {activeView === 'projects' && <ProjectsView stores={stores} loading={jiraLoading} />}
        {activeView === 'settings' && <SettingsView email={user?.email ?? ''} role={role} jiraError={jiraError} />}
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
  return <button type="button" onClick={onOpen} className="w-full rounded-xl border border-white/[.07] bg-black/15 p-4 text-left shadow-[0_14px_32px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex justify-between gap-3"><span className="font-mono text-xs font-bold text-primary">{ticket.id}</span><Badge variant="outline" className={ticket.priority === 'Alta' ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'text-muted-foreground'}>{ticket.priority}</Badge></div><h4 className="mt-3 text-sm font-semibold leading-snug">{ticket.title}</h4><div className="mt-3 space-y-2 text-xs text-muted-foreground"><p className="flex items-center gap-1.5"><Building2 className="size-3.5" />{ticket.store}</p><p className="flex items-center gap-1.5"><MapPin className="size-3.5" />{ticket.city}</p>{ticket.schedule && <p className="flex items-center gap-1.5 text-blue-300"><CalendarClock className="size-3.5" />Agendamento: {ticket.schedule}</p>}{ticket.partnerTriggeredAt && <p className="flex items-center gap-1.5 text-amber-300"><CalendarClock className="size-3.5" />Acionamento: {ticket.partnerTriggeredAt}</p>}</div><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{ticket.rawStatus}</span>{ticket.technician && <span className="text-xs font-semibold">{ticket.technician}</span>}</div></button>;
}

function AgendaView({ tickets, loading, onOpen }: { tickets: Ticket[]; loading: boolean; onOpen: (ticket: Ticket) => void }) {
  const scheduled = tickets.filter((ticket) => ticket.schedule || ticket.status === 'Pendente de agendamento' || ticket.status === 'Agendado');
  if (loading) return <LoadingPanel label="Carregando agenda..." />;
  if (!scheduled.length) return <EmptyState label="Nenhum atendimento aguardando agenda." />;
  return <div className="surface-panel mt-6 overflow-hidden rounded-2xl"><div className="grid border-b border-border bg-black/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[130px_1fr_160px_140px]"><span>Data</span><span>Chamado</span><span>Responsável</span><span>Status</span></div>{scheduled.map((ticket) => <button type="button" key={ticket.id} onClick={() => onOpen(ticket)} className="grid w-full gap-2 border-b border-border px-4 py-4 text-left transition hover:bg-white/[.035] last:border-0 sm:grid-cols-[130px_1fr_160px_140px] sm:items-center"><span className="text-sm font-semibold text-blue-200">{ticket.schedule || 'A definir'}</span><span><strong className="block text-sm">{ticket.id} · {ticket.store}</strong><small className="text-muted-foreground">{ticket.title}</small></span><span className="text-sm text-muted-foreground">{ticket.technician || 'Não atribuído'}</span><Badge variant="outline" className="w-fit">{ticket.status}</Badge></button>)}</div>;
}

function TechniciansView({ users, loading }: { users: N1User[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Carregando equipe..." />;
  if (!users.length) return <EmptyState label="Nenhuma conta N1 ativa." />;
  return <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{users.map((member) => <article key={member.email} className="surface-panel rounded-2xl p-5"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-sm font-bold text-violet-200">{member.email.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h2 className="truncate font-semibold">{member.email}</h2><p className="text-xs text-muted-foreground">Analista N1</p></div><Badge variant="outline" className="ml-auto border-emerald-400/25 bg-emerald-400/10 text-emerald-300">Ativo</Badge></div></article>)}</div>;
}

function ProjectsView({ stores, loading }: { stores: { store: string; city: string; tickets: number }[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Carregando lojas..." />;
  if (!stores.length) return <EmptyState label="Nenhuma loja encontrada nos chamados atuais." />;
  return <div className="surface-panel mt-6 overflow-hidden rounded-2xl"><div className="grid border-b border-border bg-black/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[1fr_220px_120px]"><span>Loja</span><span>Cidade</span><span>Chamados</span></div>{stores.map((store) => <div key={`${store.store}-${store.city}`} className="grid gap-2 border-b border-border px-4 py-4 last:border-0 sm:grid-cols-[1fr_220px_120px] sm:items-center"><strong className="text-sm">{store.store}</strong><span className="text-sm text-muted-foreground">{store.city}</span><Badge variant="outline" className="w-fit">{store.tickets}</Badge></div>)}</div>;
}

function SettingsView({ email, role, jiraError }: { email: string; role: string | null; jiraError: string }) {
  return <div className="mt-6 grid gap-4 lg:grid-cols-2"><section className="surface-panel rounded-2xl p-5"><h2 className="font-semibold">Conta e acesso</h2><div className="mt-4 space-y-3"><Detail label="E-mail" value={email} /><Detail label="Perfil" value={role === 'gerencia' ? 'Gerência' : role || 'Não definido'} /></div></section><section className="surface-panel rounded-2xl p-5"><h2 className="font-semibold">Integrações</h2><div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-black/10 p-4"><div><p className="text-sm font-medium">Jira Service Management</p><p className="text-xs text-muted-foreground">Sincronização de chamados FSA</p></div><Badge variant="outline" className={jiraError ? 'border-amber-400/30 text-amber-200' : 'border-emerald-400/30 text-emerald-200'}>{jiraError ? 'Atenção' : 'Conectado'}</Badge></div></section></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="cockpit-inset rounded-xl p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>; }
function EmptyState({ label }: { label: string }) { return <div className="surface-panel mt-6 grid min-h-48 place-items-center rounded-2xl border-dashed p-6 text-center text-sm text-muted-foreground">{label}</div>; }
function LoadingPanel({ label }: { label: string }) { return <div className="surface-panel mt-6 flex min-h-48 items-center justify-center gap-3 rounded-2xl text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" />{label}</div>; }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }

function formatDate(value: string) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Não informado'; }

function toTicket(issue: JiraTicket): Ticket {
  const statusText = normalizeText(issue.status);
  const status: Status = statusText === 'agendado'
    ? 'Agendado'
    : statusText.includes('agendamento')
      ? 'Pendente de agendamento'
      : statusText.includes('spare')
        ? 'Aguardando spare'
        : statusText === 'direcionado'
          ? 'Direcionado'
          : 'Técnico em campo';
  const priorityText = issue.priority.toLowerCase();
  const priority: Ticket['priority'] = priorityText.includes('highest') || priorityText.includes('high') || priorityText.includes('alta') ? 'Alta' : priorityText.includes('low') || priorityText.includes('baixa') ? 'Baixa' : 'Media';
  const updated = issue.updatedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(issue.updatedAt)) : 'sem data';
  const storeFromTitle = issue.summary.match(/^Loja\s+([^|]+)/i)?.[0]?.trim();
  return { id: issue.key, title: issue.summary, store: issue.store || storeFromTitle || 'Loja não informada', city: issue.city || `Atualizado em ${updated}`, status, rawStatus: issue.status, priority, technician: issue.assignee ?? undefined, schedule: formatJiraDate(issue.scheduledAt), partnerTriggeredAt: formatJiraDate(issue.partnerTriggeredAt) };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatJiraDate(value: string | null) {
  if (!value) return undefined;
  const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  const date = brazilian ? new Date(Number(brazilian[3]), Number(brazilian[2]) - 1, Number(brazilian[1]), Number(brazilian[4]), Number(brazilian[5]), Number(brazilian[6] ?? 0)) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function dashboardViewFromLocation(): DashboardView {
  const requestedView = new URLSearchParams(window.location.search).get('view');
  return ['overview', 'tickets', 'central', 'agenda', 'technicians', 'projects', 'settings'].includes(requestedView ?? '') ? requestedView as DashboardView : 'overview';
}
