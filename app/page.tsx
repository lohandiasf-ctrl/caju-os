'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Building2, CalendarClock, CircleDollarSign, ClipboardList, Filter, Headphones, LayoutDashboard, List, Map, MapPin, Menu, PackageOpen, Plus, Search, Settings, ShieldCheck, Users, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Status = 'Triagem' | 'Agendar' | 'Agendado' | 'Em atendimento';
type Ticket = { id: string; title: string; store: string; city: string; status: Status; priority: 'Alta' | 'Media' | 'Baixa'; technician?: string; schedule?: string };

const tickets: Ticket[] = [
  { id: 'FSA-129623', title: 'Instalacao de nova CPU no PDV', store: 'L1077 · River Shopping', city: 'Petrolina, PE', status: 'Triagem', priority: 'Alta' },
  { id: 'FSA-129615', title: 'Instalacao do sistema Hydra', store: 'L1322 · Santa Maria da Vitoria', city: 'Santa Maria da Vitoria, BA', status: 'Triagem', priority: 'Media' },
  { id: 'FSA-129609', title: 'Manutencao em impressora Zebra', store: 'L1495 · Teotonio Vilela', city: 'Teotonio Vilela, AL', status: 'Agendar', priority: 'Alta' },
  { id: 'FSA-129610', title: 'Impressora termica nao imprime', store: 'L454 · Patos', city: 'Patos, PB', status: 'Agendar', priority: 'Media' },
  { id: 'FSA-129430', title: 'CPU com lentidao durante vendas', store: 'L1001 · Timbauba', city: 'Timbauba, PE', status: 'Agendado', priority: 'Alta', technician: 'Rafael Monteiro', schedule: 'Hoje, 14:30' },
  { id: 'FSA-129389', title: 'Impressora falha ao finalizar venda', store: 'L353 · Center Shopping', city: 'Uberlandia, MG', status: 'Em atendimento', priority: 'Baixa', technician: 'Lucas Andrade', schedule: 'Em campo ha 42 min' },
];
const columns: Status[] = ['Triagem', 'Agendar', 'Agendado', 'Em atendimento'];
const nav = [
  ['Visao geral', LayoutDashboard], ['Chamados', ClipboardList], ['Mapa operacional', Map], ['Agenda', CalendarClock],
  ['Central N1', Headphones], ['Tecnicos', Users], ['Projetos e lojas', Building2], ['Spares', PackageOpen], ['Financeiro', CircleDollarSign],
] as const;
const dots: Record<Status, string> = { Triagem: 'bg-amber-400', Agendar: 'bg-violet-400', Agendado: 'bg-blue-400', 'Em atendimento': 'bg-emerald-400' };

export default function Home() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [menu, setMenu] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tickets.filter((t) => [t.id, t.title, t.store, t.city, t.technician].filter(Boolean).some((v) => v!.toLowerCase().includes(q))) : tickets;
  }, [query]);

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
        {nav.map(([label, Icon], i) => ['Financeiro', 'Central N1', 'Spares', 'Mapa operacional'].includes(label)
          ? <a href={label === 'Financeiro' ? '/financeiro' : label === 'Central N1' ? '/central-n1' : label === 'Spares' ? '/spares' : '/mapa'} key={label} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"><Icon className="size-[18px]" />{label}</a>
          : <button key={label} className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${i === 0 ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Icon className={`size-[18px] ${i === 0 ? 'text-primary' : ''}`} />{label}</button>)}
      </nav>
      <div className="absolute inset-x-4 bottom-5 border-t border-sidebar-border pt-4">
        <button className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Settings className="size-[18px]" /> Configuracoes</button>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-sidebar-border bg-background/40 p-3"><div className="grid size-9 place-items-center rounded-full bg-[#28344a] text-xs font-bold text-[#9fb4d5]">LD</div><div><p className="text-xs font-semibold">Lohan Dias</p><p className="text-[10px] text-muted-foreground">Administrador</p></div></div>
      </div>
    </aside>
    {menu && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenu(false)} />}
    <section className="min-h-screen lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu /></Button>
        <div className="relative max-w-[440px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar chamado, loja ou tecnico..." className="h-10 bg-card pl-9" /></div>
        <div className="ml-auto hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 sm:flex"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#39d6a2]" /> Sistemas online</div>
        <Button variant="ghost" size="icon" aria-label="Notificacoes" className="relative"><Bell /><span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" /></Button>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.14em] text-primary">Terca-feira, 1 de setembro</p><h1 className="text-2xl font-extrabold tracking-[-.03em] sm:text-3xl">Central de operacoes</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe a fila, a equipe e os atendimentos em andamento.</p></div><Button size="lg" className="h-10 px-4 font-bold shadow-[0_8px_24px_rgba(229,98,35,.2)]"><Plus /> Novo chamado</Button></div>
        <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Chamados abertos', '126', '+8 desde ontem', ClipboardList, 'text-blue-300'], ['Em campo agora', '18', '94% dentro do SLA', Headphones, 'text-emerald-300'],
            ['Aguardando agenda', '27', '6 com prioridade alta', CalendarClock, 'text-violet-300'], ['SLA em risco', '7', 'Requer atencao', ShieldCheck, 'text-amber-300'],
          ].map(([label, value, note, Icon, color]) => <article key={label as string} className="rounded-xl border border-border bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,.08)] sm:p-5"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">{label as string}</p><p className="mt-2 text-2xl font-extrabold sm:text-3xl">{value as string}</p></div><div className={`grid size-9 place-items-center rounded-lg bg-muted ${color}`}><Icon className="size-[18px]" /></div></div><p className="mt-3 text-[11px] text-muted-foreground">{note as string}</p></article>)}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-2"><div className="mr-auto"><h2 className="text-lg font-bold">Fluxo de chamados</h2><p className="text-xs text-muted-foreground">{filtered.length} chamados exibidos</p></div><Button variant="outline" className="h-9"><Filter /> Filtros <Badge variant="secondary">2</Badge></Button><div className="flex rounded-lg border border-border bg-card p-1"><Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('kanban')}><Wrench /> Kanban</Button><Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('list')}><List /> Lista</Button></div></div>
        {view === 'kanban' ? <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">{columns.map((column) => {
          const items = filtered.filter((ticket) => ticket.status === column);
          return <section key={column} className="min-h-[280px] rounded-xl border border-border bg-muted/25 p-3"><div className="mb-3 flex items-center justify-between px-1"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${dots[column]}`} /><h3 className="text-xs font-bold uppercase tracking-[.08em]">{column}</h3></div><span className="rounded-md bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{items.length}</span></div><div className="space-y-3">{items.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}{!items.length && <div className="grid h-32 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">Nenhum chamado encontrado</div>}</div></section>;
        })}</div> : <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">{filtered.map((ticket) => <div key={ticket.id} className="grid gap-3 border-b border-border p-4 last:border-0 sm:grid-cols-[120px_1fr_150px_140px] sm:items-center"><span className="font-mono text-xs font-bold text-primary">{ticket.id}</span><div><p className="text-sm font-semibold">{ticket.title}</p><p className="text-xs text-muted-foreground">{ticket.store} · {ticket.city}</p></div><Badge variant="outline">{ticket.status}</Badge><span className="text-xs text-muted-foreground">{ticket.technician || 'Nao atribuido'}</span></div>)}</div>}
      </div>
    </section>
  </main>;
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return <article className="rounded-xl border border-border bg-card p-4 shadow-[0_10px_30px_rgba(0,0,0,.08)] transition hover:-translate-y-0.5 hover:border-primary/35"><div className="flex justify-between gap-3"><span className="font-mono text-[11px] font-bold text-primary">{ticket.id}</span><Badge variant="outline" className={ticket.priority === 'Alta' ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'text-muted-foreground'}>{ticket.priority}</Badge></div><h4 className="mt-3 text-sm font-bold leading-snug">{ticket.title}</h4><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><p className="flex items-center gap-1.5"><Building2 className="size-3.5" />{ticket.store}</p><p className="flex items-center gap-1.5"><MapPin className="size-3.5" />{ticket.city}</p></div>{ticket.technician && <div className="mt-3 border-t border-border pt-3"><p className="text-[11px] font-semibold">{ticket.technician}</p><p className="text-[10px] text-muted-foreground">{ticket.schedule}</p></div>}</article>;
}
