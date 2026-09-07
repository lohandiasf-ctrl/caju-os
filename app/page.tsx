'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, CalendarClock, CalendarDays, CircleDollarSign, ClipboardList, ExternalLink, Eye, Filter, Headphones, LayoutDashboard, List, Loader2, Map as MapIcon, MapPin, Menu, MessageCircle, PackageOpen, Plus, Save, Search, Settings, ShieldCheck, Star, Users, Wrench, X } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ColleaguesPanel, ProfileSettings, UserMenu } from '@/components/user-menu';
import { useAuth } from '@/components/auth-provider';
import { OperationWorkflowDialog } from '@/components/operation-workflow-dialog';
import { N1TicketActions } from '@/components/n1-ticket-actions';
import { JiraTicketDetails, type JiraOperationalFields } from '@/components/jira-ticket-details';
import { dayKey, sameDay, ticketActivities, type DatedTicketActivity } from '@/lib/ticket-activities';

type Status = 'Pendente de agendamento' | 'Agendado' | 'Aguardando spare' | 'Direcionado' | 'Técnico em campo';
type DashboardView = 'overview' | 'tickets' | 'central' | 'agenda' | 'technicians' | 'projects' | 'settings';
type Ticket = { id: string; title: string; store: string; city: string; status: Status; rawStatus: string; priority: 'Alta' | 'Media' | 'Baixa'; technician?: string; schedule?: string; partnerTriggeredAt?: string; updatedAt?: string; scheduledAt?: string; partnerTriggeredAtRaw?: string };
type TicketActivity = DatedTicketActivity<Ticket>;
type JiraTicket = { key: string; summary: string; status: string; statusCategory: string; priority: string; assignee: string | null; updatedAt: string; store: string | null; city: string | null; scheduledAt: string | null; partnerTriggeredAt: string | null };
type JiraDetails = JiraTicket & { description: string; reporter: string | null; issueType: string; project: string; createdAt: string; jiraUrl: string; operationalFields: JiraOperationalFields; attachments: Array<{ id: string; filename: string; mimeType: string; size: number; createdAt: string; author: string | null }> };
type N1User = { email: string; role: 'n1' };
type FieldTechnician = {
  id: number; technicianExternalId: string | null; technicianCode: string | null; name: string; cpf: string | null; phone: string | null; email: string | null; pixKey: string | null;
  age: string | null; city: string; state: string; fullAddress: string | null; sourceStatus: string | null; status: string; approved: boolean; onboardingCompleted: string | null;
  hasVehicle: string | null; vehicleType: string | null; alternativeTransport: string | null; servesOtherCities: string | null; extraCities: string | null;
  toolsCount: string | null; availableTools: string | null; specialtiesCount: string | null; specialties: string | null;
};
type TechnicianReview = { id: number; technicianId: number; authorEmail: string; rating: number; comment: string; createdAt: string };
type OperationalAlert = { ticketKey: string; level: 'critical' | 'warning'; message: string };
type OperationalDashboard = { alerts: OperationalAlert[]; metrics: { active: number; overdue: number; scheduled: number; visits: number; revenueCents: number; costCents: number; marginCents: number }; n1: { email: string; count: number }[]; recentAudit: { id: number; ticketKey: string; action: string; actorEmail: string; createdAt: string }[] };
const columns: Status[] = ['Pendente de agendamento', 'Agendado', 'Aguardando spare', 'Direcionado', 'Técnico em campo'];
const nav = [
  ['Visão geral', LayoutDashboard, '/?view=overview', 'overview'], ['Chamados', ClipboardList, '/?view=tickets', 'tickets'], ['Mapa operacional', MapIcon, '/mapa', 'map'], ['Agenda', CalendarClock, '/?view=agenda', 'agenda'],
  ['Central N1', Headphones, '/?view=central', 'central'], ['Equipe N1', Users, '/?view=technicians', 'technicians'], ['Projetos e lojas', Building2, '/?view=projects', 'projects'], ['Spares', PackageOpen, '/spares', 'spares'], ['Financeiro', CircleDollarSign, '/financeiro', 'finance'],
] as const;
const dots: Record<Status, string> = { 'Pendente de agendamento': 'bg-violet-400', Agendado: 'bg-blue-400', 'Aguardando spare': 'bg-amber-400', Direcionado: 'bg-cyan-400', 'Técnico em campo': 'bg-emerald-400' };
const VALIDATION_WHATSAPP_GROUP = 'https://chat.whatsapp.com/DkSDNsDagPrKkxrXyLi4NL';
const viewCopy: Record<DashboardView, [string, string, string]> = {
  overview: ['Operação em tempo real', 'Visão geral dos chamados', 'Fila, prioridade e execução em uma única visão.'],
  tickets: ['Central de atendimento', 'Chamados operacionais', 'Consulte, filtre e abra cada chamado sem perder contexto.'],
  central: ['Atendimento N1', 'Central N1', 'Fila real de chamados que exige acompanhamento da equipe N1.'],
  agenda: ['Planejamento de campo', 'Agenda de atendimentos', 'Agendamentos e itens que ainda precisam de data.'],
  technicians: ['Equipe de atendimento', 'Equipe', 'N1 e técnicos de campo cadastrados na operação.'],
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
  const [ticketToShare, setTicketToShare] = useState<{ id: string; title: string; store: string; city: string } | null>(null);
  const [details, setDetails] = useState<JiraDetails | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState('');
  const [dialogLoading, setDialogLoading] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [n1Users, setN1Users] = useState<N1User[]>([]);
  const [n1Loading, setN1Loading] = useState(true);
  const [operationOpen, setOperationOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationConfirmed, setValidationConfirmed] = useState(false);
  const [validationSending, setValidationSending] = useState(false);
  const [validationNotice, setValidationNotice] = useState('');
  const [archivedKeys, setArchivedKeys] = useState<Set<string>>(() => new Set());
  const [operational, setOperational] = useState<OperationalDashboard | null>(null);
  const [ticketDate, setTicketDate] = useState<Date | undefined>();

  useEffect(() => {
    const syncView = () => setActiveView(dashboardViewFromLocation());
    syncView();
    window.addEventListener('popstate', syncView);
    return () => window.removeEventListener('popstate', syncView);
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (archivedKeys.has(ticket.id)) return false;
      const matchesQuery = !q || [ticket.id, ticket.title, ticket.store, ticket.city, ticket.technician].filter(Boolean).some((value) => value!.toLowerCase().includes(q));
      const matchesDate = activeView !== 'tickets' || !ticketDate || ticketActivities(ticket).some((activity) => sameDay(activity.date, ticketDate));
      return matchesQuery && matchesDate && (statusFilter === 'Todos' || ticket.status === statusFilter);
    });
  }, [activeView, archivedKeys, query, statusFilter, ticketDate, tickets]);
  const allTicketActivities = useMemo(() => tickets.flatMap(ticketActivities).sort((a, b) => a.date.getTime() - b.date.getTime()), [tickets]);
  const stores = useMemo(() => Array.from(new Set(tickets.map((ticket) => `${ticket.store}|||${ticket.city}`))).map((value) => {
    const [store, city] = value.split('|||');
    return { store, city, tickets: tickets.filter((ticket) => ticket.store === store).length };
  }).sort((a, b) => b.tickets - a.tickets), [tickets]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const cached = sessionStorage.getItem('caju-jira-issues-cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { at: number; issues: JiraTicket[] };
        if (Date.now() - parsed.at < 5 * 60_000 && parsed.issues.length) {
          setTickets(parsed.issues.map(toTicket));
          setJiraLoading(false);
          return () => { active = false; };
        }
      } catch { sessionStorage.removeItem('caju-jira-issues-cache'); }
    }
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
      if (active) { setTickets(issues.map(toTicket)); sessionStorage.setItem('caju-jira-issues-cache', JSON.stringify({ at: Date.now(), issues })); }
    })
      .catch((error: unknown) => { if (active) setJiraError(error instanceof Error ? error.message : 'Falha ao consultar o Jira.'); })
      .finally(() => { if (active) setJiraLoading(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/operational-dashboard', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const payload = await response.json() as OperationalDashboard;
        if (active && response.ok) setOperational(payload);
      } catch { /* Jira data remains available if operational summary is offline. */ }
    };
    void load(); const timer = window.setInterval(() => void load(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void user.getIdToken().then(async (token) => {
      const response = await fetch('/api/operations?archivedKeys=1', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json() as { archivedKeys?: string[] };
      if (active && response.ok) setArchivedKeys(new Set(payload.archivedKeys ?? []));
    }).catch(() => undefined);
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
    setDetailsVisible(true);
    setWhatsappUrl('');
    setDialogError('');
    setValidationOpen(false);
    setValidationConfirmed(false);
    setValidationNotice('');
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

  async function openJira() {
    if (!selected) return;
    const url = details?.jiraUrl || `https://delfia.atlassian.net/browse/${selected.id}`;
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_external_url', { url });
      } else window.open(url, '_blank', 'noopener,noreferrer');
    } catch { window.location.href = url; }
  }

  const validationRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!isInServiceStatus(details?.status ?? selected?.rawStatus ?? '')) missing.push('status Técnico em campo');
    if (!details?.operationalFields.ticketTotal?.trim()) missing.push('valores salvos');
    if (!(details?.attachments?.length ?? 0)) missing.push('ao menos uma evidência');
    return missing;
  }, [details, selected]);
  const validationReady = Boolean(details) && validationRequirements.length === 0;

  async function sendForValidation() {
    if (!details || !validationConfirmed || !validationReady) return;
    const text = `Podem validar, por favor?\n${details.jiraUrl}`;
    setValidationSending(true);
    try {
      if ('__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        const copied = await invoke<boolean>('copy_to_clipboard', { text });
        await invoke('open_external_url', { url: VALIDATION_WHATSAPP_GROUP });
        setValidationNotice(copied ? 'Grupo de validação aberto e mensagem copiada. Cole e envie no WhatsApp.' : 'Grupo de validação aberto. Copie o link do Jira acima e envie no WhatsApp.');
      } else {
        window.open(VALIDATION_WHATSAPP_GROUP, '_blank', 'noopener,noreferrer');
        const copied = await copyToClipboard(text);
        setValidationNotice(copied ? 'Grupo de validação aberto e mensagem copiada. Cole e envie no WhatsApp.' : 'Grupo de validação aberto. Copie o link do Jira acima e envie no WhatsApp.');
      }
      setValidationOpen(false);
    } catch {
      setValidationNotice('Não foi possível abrir o grupo de validação. Tente novamente.');
    } finally {
      setValidationSending(false);
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
    <aside className={`caju-sidebar group/sidebar fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col overflow-visible border border-sidebar-border bg-sidebar px-4 py-5 transition-[width,transform] duration-200 min-[360px]:inset-y-3 min-[360px]:left-3 min-[360px]:w-[76px] min-[360px]:translate-x-0 min-[360px]:hover:w-[272px] motion-reduce:transition-none ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-12 items-center gap-3 px-2">
        <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/30 bg-black shadow-[0_10px_30px_rgba(240,122,63,.18)]"><img src="/caju-tech-emblem.png" alt="Caju Tech" className="size-9 object-contain" /></div>
        <div className="sidebar-label whitespace-nowrap opacity-100 transition-opacity min-[360px]:opacity-0 min-[360px]:group-hover/sidebar:opacity-100"><div className="text-[15px] font-extrabold tracking-tight">Caju OS</div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Comando operacional</div></div>
      </div>
      <nav className="no-scrollbar mt-5 min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto overscroll-contain pb-3" aria-label="Navegação principal">
        <p className="sidebar-label mb-3 whitespace-nowrap px-3 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground opacity-100 transition-opacity min-[360px]:opacity-0 min-[360px]:group-hover/sidebar:opacity-100">Operação</p>
        {nav.filter(([label]) => role === 'gerencia' || role === 'coordenador' || (role === 'n1' ? !['Financeiro', 'Spares', 'Projetos e lojas'].includes(label) : role === 'tecnico' ? ['Visão geral', 'Mapa operacional', 'Agenda', 'Equipe N1'].includes(label) : !['Financeiro', 'Spares', 'Central N1', 'Projetos e lojas', 'Técnicos'].includes(label))).map(([label, Icon, href, key]) => {
          const isActive = key === activeView;
          return <a href={href} onClick={(event) => navigate(event, href)} key={label} aria-label={label} aria-current={isActive ? 'page' : undefined} className={`flex min-h-10 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-left text-sm font-medium transition ${isActive ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary),0_8px_24px_rgba(0,0,0,.12)]' : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground'}`}><Icon aria-hidden="true" className={`size-[18px] shrink-0 ${isActive ? 'text-primary' : ''}`} /><span className="sidebar-label whitespace-nowrap opacity-100 transition-opacity min-[360px]:opacity-0 min-[360px]:group-hover/sidebar:opacity-100">{label}</span></a>;
        })}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border pt-3">
        <a href="/?view=settings" onClick={(event) => navigate(event, '/?view=settings')} aria-label="Configurações" aria-current={activeView === 'settings' ? 'page' : undefined} className={`flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-sm transition ${activeView === 'settings' ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Settings aria-hidden="true" className="size-[18px] shrink-0" /><span className="sidebar-label whitespace-nowrap opacity-100 transition-opacity min-[360px]:opacity-0 min-[360px]:group-hover/sidebar:opacity-100">Configurações</span></a>
        <UserMenu />
      </div>
    </aside>
    {menu && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenu(false)} />}
    <section className="min-h-screen min-[360px]:pl-[92px] xl:pr-8">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-5">
        <Button variant="ghost" size="icon" className="min-[360px]:hidden" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu /></Button>
        <div className="relative max-w-[440px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar chamado, loja ou tecnico..." className="h-10 bg-card pl-9" /></div>
        <div className={`ml-auto hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:flex ${jiraError ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'}`}><span className={`size-1.5 rounded-full ${jiraError ? 'bg-amber-400' : 'bg-emerald-400'}`} />{jiraLoading ? 'Sincronizando Jira...' : jiraError ? 'Jira indisponível' : 'Jira conectado'}</div>
        <Button variant="ghost" size="icon" aria-label="Notificações" aria-expanded={notificationsOpen} className="relative" onClick={() => setNotificationsOpen((value) => !value)}><Bell />{(operational?.alerts.length || tickets.some((ticket) => ticket.priority === 'Alta')) && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />}</Button>
        {notificationsOpen && <div className="surface-panel absolute right-4 top-[60px] z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl p-4 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Central de alertas</h2><Badge variant="outline">{(operational?.alerts.length ?? 0) + tickets.filter((ticket) => ticket.priority === 'Alta').length}</Badge></div><div className="mt-3 space-y-2">{operational?.alerts.slice(0, 5).map((alert) => <button key={`${alert.ticketKey}-${alert.message}`} onClick={() => { const ticket = tickets.find((item) => item.id === alert.ticketKey); if (ticket) void openTicket(ticket); }} className={`w-full rounded-lg border p-2 text-left text-xs ${alert.level === 'critical' ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-100'}`}><b>{alert.ticketKey}</b> · {alert.message}</button>)}{!operational?.alerts.length && <p className="text-sm text-muted-foreground">Nenhum alerta operacional crítico.</p>}</div><a href="/?view=tickets" onClick={(event) => navigate(event, '/?view=tickets')} className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">Ver chamados</a></div>}
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-primary">{viewCopy[activeView][0]}</p><h1 className="text-2xl font-semibold tracking-[-.04em] sm:text-[2rem]">{viewCopy[activeView][1]}</h1><p className="mt-2 text-sm text-muted-foreground">{viewCopy[activeView][2]}</p></div>{activeView !== 'settings' && <Button size="lg" className="h-11 px-4 font-bold shadow-[0_10px_28px_color-mix(in_oklab,var(--primary)_20%,transparent)]" render={<a href="https://delfia.atlassian.net/secure/CreateIssue!default.jspa" target="_blank" rel="noreferrer" />}><Plus /> Novo chamado</Button>}</div>
        {activeView === 'overview' && <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Chamados relevantes', String(tickets.length), 'Fluxo operacional ativo', ClipboardList, 'text-blue-300'], ['Técnico em campo', String(tickets.filter((item) => item.status === 'Técnico em campo').length), 'Atendimentos atuais', Headphones, 'text-emerald-300'],
            ['Pendente de agenda', String(tickets.filter((item) => item.status === 'Pendente de agendamento').length), 'Requer agendamento', CalendarClock, 'text-violet-300'], ['Aguardando spare', String(tickets.filter((item) => item.status === 'Aguardando spare').length), 'Material pendente', ShieldCheck, 'text-amber-300'],
          ].map(([label, value, note, Icon, color]) => <article key={label as string} className="surface-panel metric-glow rounded-2xl p-4 sm:p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{label as string}</p><p className="mt-3 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">{value as string}</p></div><div className={`grid size-10 place-items-center rounded-xl border border-white/5 bg-black/15 ${color}`}><Icon className="size-[18px]" /></div></div><p className="mt-4 text-xs text-muted-foreground">{note as string}</p></article>)}
        </div>}
        {activeView === 'overview' && <OperationalSummary data={operational} />}
        {jiraError && <div role="alert" className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm text-amber-200">{jiraError}</div>}
        {activeView === 'tickets' && <TicketActivityCalendar activities={allTicketActivities} selected={ticketDate} onSelect={setTicketDate} onOpen={openTicket} />}
        {(activeView === 'overview' || activeView === 'tickets' || activeView === 'central') && <><div className="mt-8 flex flex-wrap items-center gap-2"><div className="mr-auto"><h2 className="text-lg font-bold">Fluxo de chamados</h2><p className="text-xs text-muted-foreground">{jiraLoading ? 'Carregando chamados reais...' : `${filtered.length} chamados exibidos${activeView === 'tickets' && ticketDate ? ` em ${formatDay(ticketDate)}` : ''}`}</p></div><Button variant={showFilters ? 'secondary' : 'outline'} className="h-9" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}><Filter /> Filtros</Button><div className="flex rounded-lg border border-border bg-card p-1"><Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('kanban')}><Wrench /> Kanban</Button><Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('list')}><List /> Lista</Button></div></div>
        {showFilters && <div className="surface-panel mt-3 flex flex-wrap gap-2 rounded-xl p-3" aria-label="Filtrar por status">{(['Todos', ...columns] as const).map((status) => <Button key={status} size="sm" variant={statusFilter === status ? 'default' : 'ghost'} onClick={() => setStatusFilter(status)}>{status}</Button>)}</div>}
        {view === 'kanban' ? <div className={`mt-4 grid gap-4 ${statusFilter === 'Todos' ? 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5' : 'grid-cols-1'}`}>{(statusFilter === 'Todos' ? columns : [statusFilter]).map((column) => {
          const items = filtered.filter((ticket) => ticket.status === column);
          return <section key={column} className="surface-panel min-h-[280px] rounded-2xl p-3"><div className="mb-3 flex items-center justify-between px-1"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${dots[column]}`} /><h3 className="text-xs font-bold uppercase tracking-[.08em]">{column}</h3></div><span className="rounded-lg border border-white/5 bg-black/15 px-2 py-1 text-[10px] font-bold text-muted-foreground">{items.length}</span></div><div className="space-y-3">{items.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={() => void openTicket(ticket)} />)}{!items.length && <div className="grid h-32 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">Nenhum chamado encontrado</div>}</div></section>;
        })}</div> : <div className="surface-panel mt-4 overflow-hidden rounded-2xl">{filtered.map((ticket) => <button type="button" onClick={() => void openTicket(ticket)} key={ticket.id} className="grid w-full gap-3 border-b border-border p-4 text-left transition hover:bg-white/[.035] last:border-0 sm:grid-cols-[120px_1fr_150px_140px] sm:items-center"><span className="font-mono text-xs font-bold text-primary">{ticket.id}</span><div><p className="text-sm font-semibold">{ticket.title}</p><p className="text-xs text-muted-foreground">{ticket.store} · {ticket.city}</p></div><Badge variant="outline">{ticket.status}</Badge><span className="text-xs text-muted-foreground">{ticket.technician || 'Não atribuído'}</span></button>)}{!filtered.length && <EmptyState label="Nenhum chamado encontrado" />}</div>}</>}
        {activeView === 'agenda' && <AgendaView tickets={tickets} loading={jiraLoading} onOpen={openTicket} />}
        {activeView === 'technicians' && <TechniciansView users={n1Users} loading={n1Loading} tickets={tickets} />}
        {activeView === 'projects' && <ProjectsView stores={stores} loading={jiraLoading} />}
        {activeView === 'settings' && <><SettingsView email={user?.email ?? ''} role={role} jiraError={jiraError} user={user} />{role === 'gerencia' && <EmployeeInvitePanel user={user} />}</>}
      </div>
    </section>
    <ColleaguesPanel
      tickets={tickets.map((ticket) => ({ id: ticket.id, title: ticket.title, store: ticket.store, city: ticket.city }))}
      ticketToShare={ticketToShare}
      onTicketShareConsumed={() => setTicketToShare(null)}
      onOpenTicket={(ticketId) => { const ticket = tickets.find((item) => item.id === ticketId); if (ticket) void openTicket(ticket); }}
    />
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2"><Badge variant="outline" className="font-mono text-primary">{selected?.id}</Badge><Badge variant="outline">{selected?.rawStatus}</Badge></div>
          <DialogTitle className="pr-8 text-lg leading-snug">{selected?.title}</DialogTitle>
          <DialogDescription>Escolha para onde deseja seguir.</DialogDescription>
        </DialogHeader>
        {dialogLoading ? <div className="grid min-h-40 place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" /><span className="sr-only">Carregando chamado</span></div> : <div className="space-y-4">
          {dialogError && <div role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{dialogError}</div>}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Button variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" onClick={() => setDetailsVisible((value) => !value)} disabled={!details}><Eye className="size-5 text-blue-300" /><span><span className="block font-bold">{detailsVisible ? 'Ocultar detalhes' : 'Ver detalhes'}</span><span className="block text-xs font-normal text-muted-foreground">Editar e sincronizar com o Jira</span></span></Button>
            {role !== 'n1' && selected && <Button type="button" variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" onClick={() => void openJira()}><ExternalLink className="size-5 text-primary" /><span><span className="block font-bold">Abrir no Jira</span><span className="block text-xs font-normal text-muted-foreground">Chamado original</span></span></Button>}
            <Button variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" render={<a href={whatsappUrl || '#'} target="_blank" rel="noreferrer" aria-disabled={!whatsappUrl} />} disabled={!whatsappUrl}><MessageCircle className="size-5 text-emerald-400" /><span><span className="block font-bold">Abrir WhatsApp</span><span className="block text-xs font-normal text-muted-foreground">{whatsappUrl ? 'Ir para o grupo' : 'Link não cadastrado'}</span></span></Button>
            <Button type="button" variant="outline" className="h-auto min-h-16 justify-start gap-3 border-emerald-400/25 p-3 text-left enabled:hover:border-emerald-400/50" onClick={() => { setValidationConfirmed(false); setValidationOpen(true); }} disabled={!validationReady} aria-describedby="validation-requirements"><ShieldCheck className="size-5 text-emerald-300" /><span><span className="block font-bold">Enviar para validação</span><span className="block text-xs font-normal text-muted-foreground">{validationReady ? 'Enviar link ao grupo de validação' : `Falta: ${validationRequirements.join(', ')}`}</span></span></Button>
            <Button variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" onClick={() => selected && setTicketToShare({ id: selected.id, title: selected.title, store: selected.store, city: selected.city })} disabled={!selected}><Users className="size-5 text-violet-300" /><span><span className="block font-bold">Enviar por chat</span><span className="block text-xs font-normal text-muted-foreground">Compartilhar com colega</span></span></Button>
            {role !== 'n1' && <Button variant="outline" className="h-auto min-h-16 justify-start gap-3 p-3 text-left" onClick={() => setOperationOpen(true)} disabled={!selected}><Wrench className="size-5 text-amber-300" /><span><span className="block font-bold">Gerir operação</span><span className="block text-xs font-normal text-muted-foreground">Agenda, spare e pagamento</span></span></Button>}
          </div>
          <p id="validation-requirements" className={`text-xs ${validationReady ? 'text-emerald-200' : 'text-muted-foreground'}`} role="status">{validationNotice || (validationReady ? 'Pronto para solicitar a validação da equipe.' : 'O envio é liberado somente após concluir os requisitos informados no botão.')}</p>
          {role === 'n1' && selected && <N1TicketActions ticketKey={selected.id} user={user} />}
          {detailsVisible && details && <><section className="rounded-xl border border-border bg-muted/30 p-4"><div className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Status" value={details.status} /><Detail label="Prioridade" value={details.priority} /><Detail label="Responsável" value={details.assignee || 'Não atribuído'} /><Detail label="Solicitante" value={details.reporter || 'Não informado'} /><Detail label="Tipo" value={details.issueType || 'Não informado'} /><Detail label="Criado em" value={formatDate(details.createdAt)} /></div></section><JiraTicketDetails details={details} user={user} onUpdated={(updated) => { const next = updated as JiraDetails; setDetails(next); setTickets((current) => current.map((ticket) => ticket.id === next.key ? toTicket(next) : ticket)); }} /></>}
          {(role === 'analista' || role === 'gerencia') && <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4"><div className="flex items-center gap-2"><MessageCircle className="size-5 text-emerald-400" /><div><h3 className="text-sm font-bold">Grupo do WhatsApp</h3><p className="text-xs text-muted-foreground">Cole o link de convite deste chamado.</p></div></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="url" value={whatsappUrl} onChange={(event) => setWhatsappUrl(event.target.value)} placeholder="https://chat.whatsapp.com/..." className="flex-1" /><Button onClick={() => void saveWhatsappLink()} disabled={linkSaving || !whatsappUrl.trim()}>{linkSaving ? <Loader2 className="animate-spin" /> : <Save />} Salvar link</Button></div></section>}
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={validationOpen} onOpenChange={(open) => { setValidationOpen(open); if (!open) setValidationConfirmed(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Enviar para validação</DialogTitle><DialogDescription>Confirme a conferência antes de abrir o grupo de validação.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm"><p className="font-semibold text-emerald-200">Mensagem preparada</p><p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">Podem validar, por favor?{'\n'}{details?.jiraUrl}</p></div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/25 p-3 text-sm transition hover:bg-muted/45"><input type="checkbox" checked={validationConfirmed} onChange={(event) => setValidationConfirmed(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" /><span>Confirmo que o funcionário preencheu todos os dados, atualizou os valores e anexou as evidências do chamado.</span></label>
          <p className="text-xs text-muted-foreground">O grupo será aberto com a mensagem copiada para a área de transferência, pronta para enviar.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setValidationOpen(false)}>Cancelar</Button><Button type="button" onClick={() => void sendForValidation()} disabled={!validationConfirmed || validationSending}>{validationSending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {validationSending ? 'Preparando...' : 'Abrir grupo e enviar'}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
    {selected && <OperationWorkflowDialog open={operationOpen} ticket={selected} role={role} user={user} onOpenChange={setOperationOpen} onArchived={(ticketKey) => { setArchivedKeys((current) => new Set([...current, ticketKey])); setOperationOpen(false); setSelected(null); }} />}
  </main>;
}

function TicketCard({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="w-full rounded-xl border border-white/[.07] bg-black/15 p-4 text-left shadow-[0_14px_32px_rgba(0,0,0,.12)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex justify-between gap-3"><span className="font-mono text-xs font-bold text-primary">{ticket.id}</span><Badge variant="outline" className={ticket.priority === 'Alta' ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'text-muted-foreground'}>{ticket.priority}</Badge></div><h4 className="mt-3 text-sm font-semibold leading-snug">{ticket.title}</h4><div className="mt-3 space-y-2 text-xs text-muted-foreground"><p className="flex items-center gap-1.5"><Building2 className="size-3.5" />{ticket.store}</p><p className="flex items-center gap-1.5"><MapPin className="size-3.5" />{ticket.city}</p>{ticket.schedule && <p className="flex items-center gap-1.5 text-blue-300"><CalendarClock className="size-3.5" />Agendamento: {ticket.schedule}</p>}{ticket.partnerTriggeredAt && <p className="flex items-center gap-1.5 text-amber-300"><CalendarClock className="size-3.5" />Acionamento: {ticket.partnerTriggeredAt}</p>}</div><div className="mt-4 flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">{ticket.rawStatus}</span>{ticket.technician && <span className="text-xs font-semibold">{ticket.technician}</span>}</div></button>;
}

function TicketActivityCalendar({ activities, selected, onSelect, onOpen }: { activities: TicketActivity[]; selected?: Date; onSelect: (date?: Date) => void; onOpen: (ticket: Ticket) => void }) {
  const [open, setOpen] = useState(false);
  const dates = useMemo(() => Array.from(new Map(activities.map((activity) => [dayKey(activity.date), activity.date])).values()), [activities]);
  const selectedActivities = selected ? activities.filter((activity) => sameDay(activity.date, selected)) : [];
  const tones = { blue: 'bg-blue-400', amber: 'bg-amber-400', slate: 'bg-slate-400' } as const;
  return <section className="surface-panel mt-6 overflow-hidden rounded-2xl" aria-labelledby="ticket-calendar-title">
    <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div><h2 id="ticket-calendar-title" className="flex items-center gap-2 font-semibold"><CalendarDays className="size-5 text-primary" aria-hidden="true" />Calendário de atividades</h2><p className="mt-1 text-xs text-muted-foreground">Escolha uma data para ver atualizações, agendamentos e acionamentos.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}><PopoverTrigger className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Escolher data no calendário"><CalendarDays className="size-4" aria-hidden="true" />{selected ? formatDay(selected) : 'Escolher data'}</PopoverTrigger><PopoverContent align="end" className="w-auto rounded-2xl border-border bg-popover p-2 shadow-2xl"><Calendar mode="single" selected={selected} onSelect={(date) => { onSelect(date); if (date) setOpen(false); }} locale={ptBR} modifiers={{ hasActivity: dates }} modifiersClassNames={{ hasActivity: '[&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:size-1 [&>button]:after:rounded-full [&>button]:after:bg-primary' }} /></PopoverContent></Popover>
        {selected && <Button type="button" variant="ghost" className="min-h-11" onClick={() => onSelect(undefined)} aria-label="Limpar data selecionada"><X aria-hidden="true" />Limpar</Button>}
      </div>
    </div>
    {selected ? <div className="p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold">{formatDayLong(selected)}</p><Badge variant="outline">{selectedActivities.length} atividade{selectedActivities.length === 1 ? '' : 's'}</Badge></div>{selectedActivities.length ? <div className="grid gap-2 lg:grid-cols-2">{selectedActivities.map((activity, index) => <button type="button" key={`${activity.ticket.id}-${activity.label}-${index}`} onClick={() => onOpen(activity.ticket)} className="flex min-h-16 w-full items-start gap-3 rounded-xl border border-border bg-black/10 p-3 text-left transition hover:border-primary/35 hover:bg-white/[.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tones[activity.tone]}`} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{activity.label}</strong><time className="text-xs tabular-nums text-muted-foreground">{formatTime(activity.date)}</time></span><span className="mt-1 block text-xs text-muted-foreground"><b className="font-mono text-primary">{activity.ticket.id}</b> · {activity.ticket.store} · {activity.detail}</span></span></button>)}</div> : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma atividade encontrada nessa data.</div>}</div> : <div className="p-5 text-sm text-muted-foreground">As datas com ponto azul possuem alguma atividade registrada.</div>}
  </section>;
}

function AgendaView({ tickets, loading, onOpen }: { tickets: Ticket[]; loading: boolean; onOpen: (ticket: Ticket) => void }) {
  const scheduled = tickets.filter((ticket) => ticket.schedule || ticket.status === 'Pendente de agendamento' || ticket.status === 'Agendado');
  if (loading) return <LoadingPanel label="Carregando agenda..." />;
  if (!scheduled.length) return <EmptyState label="Nenhum atendimento aguardando agenda." />;
  return <div className="surface-panel mt-6 overflow-hidden rounded-2xl"><div className="grid border-b border-border bg-black/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[130px_1fr_160px_140px]"><span>Data</span><span>Chamado</span><span>Responsável</span><span>Status</span></div>{scheduled.map((ticket) => <button type="button" key={ticket.id} onClick={() => onOpen(ticket)} className="grid w-full gap-2 border-b border-border px-4 py-4 text-left transition hover:bg-white/[.035] last:border-0 sm:grid-cols-[130px_1fr_160px_140px] sm:items-center"><span className="text-sm font-semibold text-blue-200">{ticket.schedule || 'A definir'}</span><span><strong className="block text-sm">{ticket.id} · {ticket.store}</strong><small className="text-muted-foreground">{ticket.title}</small></span><span className="text-sm text-muted-foreground">{ticket.technician || 'Não atribuído'}</span><Badge variant="outline" className="w-fit">{ticket.status}</Badge></button>)}</div>;
}

function TechniciansView({ users, loading, tickets }: { users: N1User[]; loading: boolean; tickets: Ticket[] }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'n1' | 'field'>('n1');
  const [fieldTechnicians, setFieldTechnicians] = useState<FieldTechnician[]>([]);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [query, setQuery] = useState(''); const [cityOnly, setCityOnly] = useState('');
  const [selected, setSelected] = useState<FieldTechnician | null>(null);
  useEffect(() => {
    if (tab !== 'field' || !user || fieldTechnicians.length) return;
    let active = true;
    setFieldLoading(true); setFieldError('');
    void user.getIdToken().then((token) => fetch('/api/technicians', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })).then(async (response) => {
      const payload = await response.json() as { technicians?: FieldTechnician[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os técnicos.');
      if (active) setFieldTechnicians(payload.technicians ?? []);
    }).catch((error) => { if (active) setFieldError(error instanceof Error ? error.message : 'Falha ao carregar técnicos.'); }).finally(() => { if (active) setFieldLoading(false); });
    return () => { active = false; };
  }, [tab, user, fieldTechnicians.length]);
  const cities = Array.from(new Set(fieldTechnicians.map((tech) => tech.city).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filtered = fieldTechnicians.filter((tech) => normalizeText(`${tech.name} ${tech.city} ${tech.state}`).includes(normalizeText(query)) && (!cityOnly || normalizeText(tech.city) === normalizeText(cityOnly)));
  return <div className="mt-6 space-y-5">
    <div role="tablist" aria-label="Equipe" className="inline-flex rounded-xl border border-border bg-card p-1">
      <button type="button" role="tab" aria-selected={tab === 'n1'} onClick={() => setTab('n1')} className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${tab === 'n1' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Equipe N1</button>
      <button type="button" role="tab" aria-selected={tab === 'field'} onClick={() => setTab('field')} className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${tab === 'field' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Técnicos de campo</button>
    </div>
    {tab === 'n1' ? (loading ? <LoadingPanel label="Carregando equipe..." /> : users.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{users.map((member) => <article key={member.email} className="surface-panel rounded-2xl p-5"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-sm font-bold text-violet-200">{member.email.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h2 className="truncate font-semibold">{member.email}</h2><p className="text-xs text-muted-foreground">Analista N1</p></div><Badge variant="outline" className="ml-auto border-emerald-400/25 bg-emerald-400/10 text-emerald-300">Ativo</Badge></div></article>)}</div> : <EmptyState label="Nenhuma conta N1 ativa." />) : <>
      <div className="flex max-w-2xl flex-col gap-2 sm:flex-row"><div className="flex-1"><label htmlFor="field-tech-search" className="sr-only">Buscar técnico de campo</label><Input id="field-tech-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, cidade ou UF..." /></div><select aria-label="Filtrar técnicos por cidade" value={cityOnly} onChange={(event) => setCityOnly(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">Todas cidades</option>{cities.map((city) => <option key={city}>{city}</option>)}</select></div>
      {fieldError && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{fieldError}</div>}
      {fieldLoading ? <LoadingPanel label="Carregando técnicos de campo..." /> : filtered.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((tech) => <button type="button" key={tech.id} onClick={() => setSelected(tech)} className="surface-panel rounded-2xl p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-start gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 font-bold text-primary">{initials(tech.name)}</div><div className="min-w-0"><h2 className="truncate font-semibold">{tech.name}</h2><p className="text-xs text-muted-foreground">{tech.city} · {tech.state}</p><p className="mt-2 truncate text-xs text-muted-foreground">{tech.email || tech.phone || 'Contato não informado'}</p></div><Badge variant="outline" className="ml-auto shrink-0">{tech.status || (tech.approved ? 'Ativo' : 'Pendente')}</Badge></div></button>)}</div> : <EmptyState label={fieldTechnicians.length ? 'Nenhum técnico encontrado para essa busca.' : 'Nenhum técnico cadastrado na planilha.'} />}
      <TechnicianDetailsDialog technician={selected} tickets={tickets} user={user} onClose={() => setSelected(null)} />
    </>}
  </div>;
}

function TechnicianDetailsDialog({ technician, tickets, user, onClose }: { technician: FieldTechnician | null; tickets: Ticket[]; user: { getIdToken: () => Promise<string>; email?: string | null } | null; onClose: () => void }) {
  const [reviews, setReviews] = useState<TechnicianReview[]>([]); const [rating, setRating] = useState(0); const [comment, setComment] = useState(''); const [loading, setLoading] = useState(false); const [submitting, setSubmitting] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { if (!technician || !user) return; let active = true; setLoading(true); setMessage(''); void user.getIdToken().then((token) => fetch(`/api/technicians/${technician.id}/reviews`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })).then(async (response) => { const payload = await response.json() as { reviews?: TechnicianReview[]; error?: string }; if (!response.ok) throw new Error(payload.error || 'Falha ao carregar avaliações.'); if (active) setReviews(payload.reviews ?? []); }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : 'Falha ao carregar avaliações.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [technician, user]);
  const attendance = technician ? tickets.filter((ticket) => { const candidate = normalizePerson(ticket.technician ?? ''); const target = normalizePerson(technician.name); return Boolean(candidate) && (candidate === target || candidate.includes(target) || target.includes(candidate)); }) : [];
  async function submitReview(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!technician || !user || !comment.trim()) return; setSubmitting(true); setMessage(''); try { const response = await fetch(`/api/technicians/${technician.id}/reviews`, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, comment: comment.trim() }) }); const payload = await response.json() as { review?: TechnicianReview; error?: string }; if (!response.ok || !payload.review) throw new Error(payload.error || 'Não foi possível salvar a avaliação.'); setReviews((current) => [payload.review!, ...current]); setComment(''); setRating(0); setMessage('Avaliação salva e visível para toda a equipe.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar avaliação.'); } finally { setSubmitting(false); } }
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  const whatsappUrl = technician ? whatsappLink(technician.phone) : null;
  const fields: Array<[string, string | null]> = technician ? [
    ['ID Técnico', technician.technicianExternalId], ['Código TEC', technician.technicianCode], ['Nome completo', technician.name], ['CPF', technician.cpf],
    ['WhatsApp / Telefone', technician.phone], ['E-mail', technician.email], ['Chave PIX', technician.pixKey], ['Idade', technician.age], ['Cidade', technician.city], ['UF', technician.state],
    ['Endereço completo', technician.fullAddress], ['Status', technician.sourceStatus || technician.status], ['Onboarding concluído?', technician.onboardingCompleted || (technician.approved ? 'Sim' : null)],
    ['Possui veículo?', technician.hasVehicle], ['Tipo de veículo', technician.vehicleType], ['Transporte alternativo', technician.alternativeTransport], ['Atende outras cidades?', technician.servesOtherCities],
    ['Cidades atendidas extras', technician.extraCities], ['Qtd. ferramentas', technician.toolsCount], ['Ferramentas disponíveis', technician.availableTools],
    ['Qtd. especialidades', technician.specialtiesCount], ['Especialidades / áreas de domínio', technician.specialties],
  ] : [];
  return <Dialog open={Boolean(technician)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">{technician && <><DialogHeader><DialogTitle>{technician.name}</DialogTitle><DialogDescription>{technician.city} · {technician.state}{technician.email ? ` · ${technician.email}` : ''}</DialogDescription></DialogHeader><div className="space-y-5"><section className="rounded-xl border border-border bg-card/50 p-4"><h3 className="text-sm font-semibold">Cadastro do técnico</h3><div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className={label === 'Endereço completo' || label === 'Transporte alternativo' || label === 'Cidades atendidas extras' || label === 'Ferramentas disponíveis' || label === 'Especialidades / áreas de domínio' ? 'sm:col-span-2' : ''}><p className="text-xs text-muted-foreground">{label}</p>{label === 'WhatsApp / Telefone' && whatsappUrl && value ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex font-medium text-primary hover:underline">{value}</a> : <p className="mt-1 break-words font-medium">{value || 'Não informado'}</p>}</div>)}</div></section><section><h3 className="text-sm font-semibold">Atendimentos realizados ({attendance.length})</h3><div className="mt-3 space-y-2">{attendance.length ? attendance.map((ticket) => <div key={ticket.id} className="rounded-xl border border-border bg-card/50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-primary">{ticket.id}</p><p className="mt-1 text-sm font-semibold">{ticket.title}</p><p className="text-xs text-muted-foreground">{ticket.store} · {ticket.city}</p></div><Badge variant="outline">{ticket.status}</Badge></div></div>) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum atendimento encontrado nos chamados carregados.</p>}</div></section><section className="border-t border-border pt-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Avaliações da equipe</h3><span className="flex items-center gap-1 text-sm text-amber-300"><Star className="size-4 fill-current" /> {average.toFixed(1)} ({reviews.length})</span></div>{loading ? <p className="mt-3 text-sm text-muted-foreground">Carregando avaliações...</p> : <div className="mt-3 space-y-2">{reviews.map((review) => <article key={review.id} className="rounded-xl border border-border bg-card/50 p-3"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-0.5 text-amber-300" aria-label={`${review.rating} estrelas`}>{[1,2,3,4,5].map((star) => <Star key={star} className={`size-3.5 ${star <= review.rating ? 'fill-current' : ''}`} />)}</span><time className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</time></div><p className="mt-2 text-sm">{review.comment}</p><p className="mt-1 text-xs text-muted-foreground">{review.authorEmail}</p></article>)}{!reviews.length && <p className="text-sm text-muted-foreground">Ainda não há avaliações.</p>}</div>}<form className="mt-4 space-y-3" onSubmit={(event) => void submitReview(event)}><div><p className="text-xs font-semibold text-muted-foreground">Sua nota</p><div className="mt-2 flex items-center gap-1">{[1,2,3,4,5].map((value) => <button type="button" key={value} aria-label={`Avaliar com ${value} estrelas`} aria-pressed={rating === value} onClick={() => setRating(value)} className="rounded-md p-1 text-amber-300 transition hover:bg-amber-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Star className={`size-5 ${value <= rating ? 'fill-current' : ''}`} /></button>)}<button type="button" className="ml-2 text-xs text-muted-foreground underline" onClick={() => setRating(0)}>Sem nota</button></div></div><div><label htmlFor="technician-review" className="text-xs font-semibold text-muted-foreground">Comentário visível para todos</label><textarea id="technician-review" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="Compartilhe um feedback sobre este técnico..." /></div><Button type="submit" disabled={submitting || !comment.trim()}>{submitting ? <Loader2 className="animate-spin" /> : <Save />} Salvar comentário</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</form></section></div></>}</DialogContent></Dialog>;
}

function ProjectsView({ stores, loading }: { stores: { store: string; city: string; tickets: number }[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Carregando lojas..." />;
  if (!stores.length) return <EmptyState label="Nenhuma loja encontrada nos chamados atuais." />;
  return <div className="surface-panel mt-6 overflow-hidden rounded-2xl"><div className="grid border-b border-border bg-black/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:grid-cols-[1fr_220px_120px]"><span>Loja</span><span>Cidade</span><span>Chamados</span></div>{stores.map((store) => <div key={`${store.store}-${store.city}`} className="grid gap-2 border-b border-border px-4 py-4 last:border-0 sm:grid-cols-[1fr_220px_120px] sm:items-center"><strong className="text-sm">{store.store}</strong><span className="text-sm text-muted-foreground">{store.city}</span><Badge variant="outline" className="w-fit">{store.tickets}</Badge></div>)}</div>;
}

function EmployeeInvitePanel({ user }: { user: { getIdToken: () => Promise<string> } | null }) {
  const [email, setEmail] = useState(''); const [role, setRole] = useState<'gerencia'|'coordenador'|'n1'|'analista'|'tecnico'>('n1'); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { setPhoto(localStorage.getItem('caju-os-profile-photo')); }, []);
  function choosePhoto(file?: File) { if (!file) return; const reader = new FileReader(); reader.onload = () => { const value = String(reader.result); setPhoto(value); localStorage.setItem('caju-os-profile-photo', value); }; reader.readAsDataURL(file); }
  async function submit() { if (!user || !email) return; setBusy(true); setMessage('Enviando convite...'); try { const response = await fetch('/api/users/invite', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error); setMessage('Convite enviado. O funcionário receberá o link para criar a senha.'); setEmail(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao enviar convite.'); } finally { setBusy(false); } }
  return <section className="surface-panel mt-4 rounded-2xl p-5"><h2 className="font-semibold">Adicionar funcionário</h2><p className="mt-1 text-sm text-muted-foreground">Informe e-mail e hierarquia. A pessoa recebe e-mail para criar senha.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="funcionario@empresa.com" type="email" /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="n1">N1</option><option value="tecnico">Técnico de campo</option><option value="analista">Analista</option><option value="coordenador">Coordenador</option><option value="gerencia">Gerência</option></select><Button disabled={busy || !email} onClick={() => void submit()}>Enviar convite</Button></div>{message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}<div className="mt-5 flex items-center gap-4 border-t border-border pt-4"><div className="grid size-14 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-primary">{photo ? <img src={photo} alt="Foto do perfil" className="size-full object-cover" /> : 'LO'}</div><label className="cursor-pointer text-sm font-semibold text-primary hover:underline">Adicionar foto de perfil<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label></div></section>;
}

function SettingsView({ email, role, jiraError, user }: { email: string; role: string | null; jiraError: string; user: { getIdToken: () => Promise<string> } | null }) {
  const [importing, setImporting] = useState(false); const [importMessage, setImportMessage] = useState(''); const [inviteEmail, setInviteEmail] = useState(''); const [inviteRole, setInviteRole] = useState<'gerencia'|'n1'|'analista'>('n1'); const [inviteMessage, setInviteMessage] = useState('');
  async function inviteEmployee() { if (!user || !inviteEmail) return; setInviteMessage('Enviando...'); const response = await fetch('/api/users/invite', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) }); const payload = await response.json() as { error?: string }; setInviteMessage(response.ok ? 'Convite enviado por e-mail.' : (payload.error ?? 'Falha ao enviar convite.')); if (response.ok) setInviteEmail(''); }
  async function importFile(file: File) { if (!user) return; setImporting(true); setImportMessage(''); try { const text = await readCsvText(file); const lines = text.split(/\r?\n/).filter(Boolean); const headers = splitCsv(lines.shift() ?? ';').map(normalizeHeader); const rows = lines.map((line) => { const values = splitCsv(line); const row = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ''])); return { technicianExternalId: row.idtecnico, technicianCode: row.codigotec, name: row.nome ?? row.nomecompleto ?? row.tecnico, cpf: row.cpf, phone: row.whatsapptelefone ?? row.telefone, email: row.email, pixKey: row.chavepix, age: row.idade, city: row.cidade, state: normalizeState(row.uf ?? row.estado), fullAddress: row.enderecocompleto, sourceStatus: row.status, onboardingCompleted: row.onboardingconcluido, approved: /sim|yes|true|ativo/i.test(row.onboardingconcluido ?? ''), hasVehicle: row.possuiveiculo, vehicleType: row.tipodeveiculo, alternativeTransport: row.transportealternativo, servesOtherCities: row.atendeoutrascidades, extraCities: row.cidadesatendidasextras, toolsCount: row.qtdferramentas, availableTools: row.ferramentasdisponiveis, specialtiesCount: row.qtdespecialidades, specialties: row.especialidadesareasdedominio }; }).filter((row) => row.name && row.city && row.state); const response = await fetch('/api/technicians/import', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) }); const payload = await response.json() as { imported?: number; error?: string }; if (!response.ok) throw new Error(payload.error); setImportMessage(`${payload.imported ?? 0} técnicos importados com sucesso.`); } catch (error) { setImportMessage(error instanceof Error ? error.message : 'Falha ao importar planilha.'); } finally { setImporting(false); } }
  return <div className="mt-6 grid gap-4 lg:grid-cols-2"><ProfileSettings />{role === 'gerencia' && <><section className="surface-panel rounded-2xl p-5"><h2 className="font-semibold">Conta e acesso</h2><div className="mt-4 space-y-3"><Detail label="E-mail" value={email} /><Detail label="Perfil" value="Gerência" /></div></section><section className="surface-panel rounded-2xl p-5"><h2 className="font-semibold">Integrações</h2><div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-black/10 p-4"><div><p className="text-sm font-medium">Jira Service Management</p><p className="text-xs text-muted-foreground">Sincronização de chamados FSA</p></div><Badge variant="outline" className={jiraError ? 'border-amber-400/30 text-amber-200' : 'border-emerald-400/30 text-emerald-200'}>{jiraError ? 'Atenção' : 'Conectado'}</Badge></div></section><section className="surface-panel rounded-2xl p-5 lg:col-span-2"><h2 className="font-semibold">Alimentar banco de técnicos</h2><p className="mt-1 text-sm text-muted-foreground">Importa todos os campos da planilha: cadastro, contato, endereço, veículo, cidades, ferramentas e especialidades. CSV UTF-8 e Windows-1252 suportados; reenvie a planilha para corrigir nomes já importados.</p><label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm font-semibold hover:bg-primary/10">Selecionar planilha: {importing ? 'Importando...' : 'CSV'}<input className="sr-only" type="file" accept=".csv,text/csv" disabled={importing} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ''; }} /></label>{importMessage && <p className="mt-3 text-sm text-muted-foreground">{importMessage}</p>}</section></>}</div>;
}

function splitCsv(line: string) { const result: string[] = []; let value = ''; let quoted = false; for (const char of line) { if (char === '"') quoted = !quoted; else if (char === ';' && !quoted) { result.push(value.trim()); value = ''; } else value += char; } result.push(value.trim()); return result; }
async function readCsvText(file: File) { const data = await file.arrayBuffer(); try { return new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^\uFEFF/, ''); } catch { return new TextDecoder('windows-1252').decode(data).replace(/^\uFEFF/, ''); } }
function normalizeHeader(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function normalizeState(value: string) { const states: Record<string, string> = { pernambuco: 'PE', paraiba: 'PB', bahia: 'BA', alagoas: 'AL', ceara: 'CE', piaui: 'PI', sergipe: 'SE', maranhao: 'MA', minasgerais: 'MG', saopaulo: 'SP', riodejaneiro: 'RJ' }; const clean = normalizeHeader(value); return clean.length === 2 ? clean.toUpperCase() : states[clean] ?? value.trim().slice(0, 2).toUpperCase(); }

function Metric({ label, value }: { label: string; value: number }) { return <div className="cockpit-inset rounded-xl p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>; }
function OperationalSummary({ data }: { data: OperationalDashboard | null }) {
  if (!data) return <section className="surface-panel mt-5 rounded-2xl p-5 text-sm text-muted-foreground">Carregando indicadores operacionais...</section>;
  const currency = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  return <section className="surface-panel mt-5 rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Inteligência operacional</h2><p className="mt-1 text-xs text-muted-foreground">SLA, produtividade, custos e histórico local. Atualiza a cada 30 segundos.</p></div><Badge variant="outline" className={data.metrics.overdue ? 'border-red-400/30 text-red-200' : 'border-emerald-400/30 text-emerald-200'}>{data.metrics.overdue ? `${data.metrics.overdue} SLA atrasado(s)` : 'SLA em dia'}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Fluxos ativos" value={data.metrics.active} /><Metric label="Visitas registradas" value={data.metrics.visits} /><div className="cockpit-inset rounded-xl p-3"><p className="text-xs text-muted-foreground">Receita registrada</p><p className="mt-1 text-xl font-semibold tabular-nums">{currency(data.metrics.revenueCents)}</p></div><div className="cockpit-inset rounded-xl p-3"><p className="text-xs text-muted-foreground">Margem estimada</p><p className="mt-1 text-xl font-semibold tabular-nums">{currency(data.metrics.marginCents)}</p></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Alertas</h3><div className="mt-2 space-y-2">{data.alerts.slice(0, 4).map((alert) => <div key={`${alert.ticketKey}-${alert.message}`} className={`rounded-lg border px-3 py-2 text-xs ${alert.level === 'critical' ? 'border-red-400/25 bg-red-400/10 text-red-100' : 'border-amber-400/25 bg-amber-400/10 text-amber-100'}`}><b>{alert.ticketKey}</b> · {alert.message}</div>)}{!data.alerts.length && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Nenhum SLA vencido ou agendamento imediato.</p>}</div></div><div><h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Histórico recente</h3><div className="mt-2 space-y-2">{data.recentAudit.slice(0, 4).map((item) => <div key={item.id} className="rounded-lg border border-border bg-black/10 px-3 py-2 text-xs"><b className="text-primary">{item.ticketKey}</b> · {item.action}<span className="mt-1 block text-muted-foreground">{item.actorEmail} · {formatDate(item.createdAt)}</span></div>)}{!data.recentAudit.length && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Sem ações registradas.</p>}</div></div></div></section>;
}
function EmptyState({ label }: { label: string }) { return <div className="surface-panel mt-6 grid min-h-48 place-items-center rounded-2xl border-dashed p-6 text-center text-sm text-muted-foreground">{label}</div>; }
function LoadingPanel({ label }: { label: string }) { return <div className="surface-panel mt-6 flex min-h-48 items-center justify-center gap-3 rounded-2xl text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" />{label}</div>; }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function whatsappLink(phone: string | null) { const digits = (phone ?? '').replace(/\D/g, ''); if (!digits) return null; return `https://wa.me/${digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`}`; }

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
  const store = issue.store || storeFromTitle || '';
  const storeLabel = /^[A-Z]?\d+$/i.test(store.replace(/^Loja\s+/i, '').trim()) ? `Código da loja: ${store.replace(/^Loja\s+/i, '').trim()}` : store || 'Loja não informada';
  const title = issue.summary.replace(/^Loja\s+([A-Z]?\d+)\s*\|/i, 'Código da loja $1 |');
  return { id: issue.key, title, store: storeLabel, city: issue.city || `Atualizado em ${updated}`, status, rawStatus: issue.status, priority, technician: issue.assignee ?? undefined, schedule: formatJiraDate(issue.scheduledAt), partnerTriggeredAt: formatJiraDate(issue.partnerTriggeredAt), updatedAt: issue.updatedAt, scheduledAt: issue.scheduledAt ?? undefined, partnerTriggeredAtRaw: issue.partnerTriggeredAt ?? undefined };
}

function formatDay(date: Date) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date); }
function formatDayLong(date: Date) { return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date); }
function formatTime(date: Date) { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date); }

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isInServiceStatus(value: string) {
  const normalized = normalizeText(value);
  return normalized.includes('tec-campo') || normalized.includes('tecnico em campo') || normalized.includes('em atendimento');
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  return copied;
}

function normalizePerson(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
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
