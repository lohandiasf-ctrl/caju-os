'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ArrowLeft, BadgeDollarSign, Building2, CalendarDays, CircleDollarSign, Download, LayoutDashboard, Loader2, Menu, Save, Search, Settings, TrendingUp, Users, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserMenu } from '@/components/user-menu';
import { useAuth } from '@/components/auth-provider';

type FinancialIssue = {
  key: string;
  title: string;
  status: string;
  technician: string;
  store: string;
  city: string;
  updatedAt: string;
  serviceValue: number;
  spareValue: number;
  totalValue: number;
  billed: boolean;
};

type PayoutRule = { firstTicketCents: number; additionalTicketCents: number };
type TechnicianRevenue = { name: string; tickets: number; revenue: number; payout: number; margin: number };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const compactMoney = (value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(value);

export default function FinanceiroPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<FinancialIssue[]>([]);
  const [rule, setRule] = useState<PayoutRule>({ firstTicketCents: 7000, additionalTicketCents: 7000 });
  const [firstRate, setFirstRate] = useState('70,00');
  const [additionalRate, setAdditionalRate] = useState('70,00');
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [showAllTechnicians, setShowAllTechnicians] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const cached = sessionStorage.getItem('caju-finance-cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { at: number; issues: FinancialIssue[]; rule: PayoutRule };
        if (Date.now() - parsed.at < 10 * 60_000) {
          setIssues(parsed.issues); setRule(parsed.rule); setFirstRate(formatRate(parsed.rule.firstTicketCents)); setAdditionalRate(formatRate(parsed.rule.additionalTicketCents)); setLoading(false);
          return () => { active = false; };
        }
      } catch { sessionStorage.removeItem('caju-finance-cache'); }
    }
    setLoading(true);
    setError('');
    void user.getIdToken().then(async (token) => {
      const headers = { Authorization: `Bearer ${token}` };
      const [financeResponse, ruleResponse] = await Promise.all([
        fetch('/api/jira/finance?days=365', { headers, cache: 'no-store' }),
        fetch('/api/finance/rules', { headers, cache: 'no-store' }),
      ]);
      const financePayload = await financeResponse.json() as { issues?: FinancialIssue[]; error?: string };
      const rulePayload = await ruleResponse.json() as PayoutRule & { error?: string };
      if (!financeResponse.ok) throw new Error(financePayload.error || 'Falha ao carregar financeiro.');
      if (!ruleResponse.ok) throw new Error(rulePayload.error || 'Falha ao carregar regra de repasse.');
      if (!active) return;
      const nextRule = { firstTicketCents: rulePayload.firstTicketCents, additionalTicketCents: rulePayload.additionalTicketCents };
      setIssues(financePayload.issues ?? []);
      setRule(nextRule);
      setFirstRate(formatRate(nextRule.firstTicketCents));
      setAdditionalRate(formatRate(nextRule.additionalTicketCents));
      sessionStorage.setItem('caju-finance-cache', JSON.stringify({ at: Date.now(), issues: financePayload.issues ?? [], rule: nextRule }));
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar financeiro.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  const periodIssues = useMemo(() => {
    const cutoff = Date.now() - period * 86_400_000;
    return issues.filter((issue) => new Date(issue.updatedAt).getTime() >= cutoff);
  }, [issues, period]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return periodIssues;
    return periodIssues.filter((issue) => [issue.key, issue.title, issue.technician, issue.store, issue.city, issue.status].some((value) => value.toLowerCase().includes(normalized)));
  }, [periodIssues, query]);

  const technicians = useMemo(() => groupTechnicians(periodIssues, rule), [periodIssues, rule]);
  const pageSize = 40;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const visibleTechnicians = showAllTechnicians ? technicians : technicians.slice(0, 25);
  const revenue = periodIssues.reduce((sum, issue) => sum + issue.totalValue, 0);
  const serviceRevenue = periodIssues.reduce((sum, issue) => sum + issue.serviceValue, 0);
  const spareRevenue = periodIssues.reduce((sum, issue) => sum + issue.spareValue, 0);
  const payout = technicians.reduce((sum, technician) => sum + technician.payout, 0);
  const margin = revenue - payout;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
  const monthly = useMemo(() => buildMonthly(issues, rule), [issues, rule]);

  async function saveRule() {
    if (!user) return;
    const firstTicketCents = parseRate(firstRate);
    const additionalTicketCents = parseRate(additionalRate);
    if (firstTicketCents === null || additionalTicketCents === null) {
      setMessage('Informe valores válidos.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/finance/rules', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstTicketCents, additionalTicketCents }),
      });
      const payload = await response.json() as PayoutRule & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Falha ao salvar regra.');
      setRule({ firstTicketCents: payload.firstTicketCents, additionalTicketCents: payload.additionalTicketCents });
      setMessage('Regra salva. Cálculos atualizados.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Falha ao salvar regra.');
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = ['Chamado', 'Técnico', 'Loja', 'Cidade', 'Status', 'Serviço', 'Spare', 'Total'];
    const body = rows.map((issue) => [issue.key, issue.technician, issue.store, issue.city, issue.status, issue.serviceValue, issue.spareValue, issue.totalValue]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(';')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `financeiro-caju-${period}-dias.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <main className="min-h-screen text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
      <a href="/?view=overview" className="flex h-12 shrink-0 items-center gap-3 px-2"><div className="grid size-10 place-items-center overflow-hidden rounded-xl border border-primary/30 bg-black"><img src="/caju-tech-emblem.png" alt="Caju Tech" className="size-9 object-contain" /></div><div><div className="text-[15px] font-extrabold">Caju OS</div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Comando financeiro</div></div></a>
      <nav className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4 pr-1" aria-label="Navegação financeira">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Gestão</p>
        <SideLink href="/?view=overview" icon={LayoutDashboard}>Visão geral</SideLink>
        <SideLink href="/financeiro" icon={CircleDollarSign} active>Financeiro</SideLink>
        <SideLink href="#receita-tecnicos" icon={Users}>Receita por técnico</SideLink>
        <SideLink href="#repasses" icon={BadgeDollarSign}>Regra de repasse</SideLink>
      </nav>
      <div className="shrink-0 border-t border-sidebar-border pt-3"><SideLink href="/?view=settings" icon={Settings}>Configurações</SideLink><UserMenu /></div>
    </aside>
    {menu && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenu(false)} />}
    <section className="min-h-screen lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu /></Button>
        <a href="/?view=overview" className="hidden items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:flex"><ArrowLeft className="size-4" />Operação</a>
        <div className="ml-auto flex items-center gap-2"><Badge variant="outline" className="hidden border-emerald-400/25 bg-emerald-400/10 text-emerald-300 sm:flex">Dados reais do Jira</Badge></div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.14em] text-primary">Gestão financeira</p><h1 className="text-2xl font-extrabold tracking-[-.03em] sm:text-3xl">Financeiro</h1><p className="mt-1 text-sm text-muted-foreground">Valores do ticket, spare, repasses e margem em uma visão.</p></div><div className="flex flex-wrap gap-2">{([7, 30, 90] as const).map((days) => <Button key={days} size="sm" variant={period === days ? 'secondary' : 'outline'} onClick={() => { setPeriod(days); setPage(1); }}>{days} dias</Button>)}<Button size="sm" onClick={exportCsv} disabled={!rows.length}><Download />Exportar</Button></div></div>
        {error && <div role="alert" className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
        {loading ? <div className="surface-panel mt-7 flex min-h-48 items-center justify-center gap-3 rounded-2xl text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" />Carregando dados reais do Jira...</div> : <>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <Metric label="Faturamento previsto" value={money(revenue)} note={`${periodIssues.length} tickets movimentados`} icon={TrendingUp} tone="green" />
            <Metric label="Serviços" value={money(serviceRevenue)} note="Total do ticket menos spare" icon={Building2} tone="blue" />
            <Metric label="Spares" value={money(spareRevenue)} note="Valor total de equipamentos" icon={BadgeDollarSign} tone="amber" />
            <Metric label="Margem após repasses" value={money(margin)} note={`${marginPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do faturamento`} icon={WalletCards} tone="violet" />
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
            <article className="surface-panel rounded-2xl p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-bold">Faturamento e repasses</h2><p className="mt-1 text-xs text-muted-foreground">Últimos 6 meses, em reais</p></div><Badge variant="outline"><CalendarDays />6 meses</Badge></div><ChartContainer className="mt-5 h-[260px] w-full" config={{ revenue: { label: 'Faturamento', color: '#f07a3f' }, payout: { label: 'Repasses', color: '#8b7cf6' } }}><BarChart data={monthly} barGap={5}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => compactMoney(Number(value))} width={70} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value))} />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[5, 5, 0, 0]} /><Bar dataKey="payout" fill="var(--color-payout)" radius={[5, 5, 0, 0]} /></BarChart></ChartContainer></article>
            <article id="repasses" className="surface-panel scroll-mt-24 rounded-2xl p-5"><h2 className="text-sm font-bold">Regra de repasse</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Valor pago ao mesmo técnico no período. Primeiro chamado usa primeira faixa; demais usam segunda.</p><div className="mt-5 grid gap-4"><RateInput label="1º chamado" value={firstRate} onChange={setFirstRate} /><RateInput label="2º chamado em diante" value={additionalRate} onChange={setAdditionalRate} /></div><Button className="mt-5 w-full" onClick={() => void saveRule()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Salvar regra</Button>{message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}<div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-400/8 p-4"><p className="text-xs text-muted-foreground">Repasse calculado no período</p><p className="mt-1 text-xl font-bold">{money(payout)}</p></div></article>
          </div>
          <article id="receita-tecnicos" className="surface-panel mt-6 scroll-mt-24 overflow-hidden rounded-2xl"><div className="border-b border-border p-5"><h2 className="text-sm font-bold">Receita gerada por técnico</h2><p className="mt-1 text-xs text-muted-foreground">Total dos tickets, repasse calculado e margem para Caju.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Técnico</TableHead><TableHead className="text-right">Chamados</TableHead><TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Repasse</TableHead><TableHead className="text-right">Margem Caju</TableHead></TableRow></TableHeader><TableBody>{visibleTechnicians.map((technician) => <TableRow key={technician.name}><TableCell className="font-semibold">{technician.name}</TableCell><TableCell className="text-right tabular-nums">{technician.tickets}</TableCell><TableCell className="text-right font-mono">{money(technician.revenue)}</TableCell><TableCell className="text-right font-mono">{money(technician.payout)}</TableCell><TableCell className={`text-right font-mono font-bold ${technician.margin >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{money(technician.margin)}</TableCell></TableRow>)}</TableBody></Table></div>{!technicians.length && <Empty label="Nenhuma receita encontrada no período." />}{technicians.length > 25 && <div className="flex justify-center border-t border-border p-3"><Button size="sm" variant="ghost" onClick={() => setShowAllTechnicians((value) => !value)}>{showAllTechnicians ? 'Mostrar menos' : `Ver todos os ${technicians.length} técnicos`}</Button></div>}</article>
          <article className="surface-panel mt-6 overflow-hidden rounded-2xl"><div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center"><div className="mr-auto"><h2 className="text-sm font-bold">Composição dos tickets</h2><p className="mt-1 text-xs text-muted-foreground">Serviço e spare sem dupla contagem.</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar chamado, técnico ou loja..." className="pl-9" /></div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Chamado</TableHead><TableHead>Técnico / local</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Serviço</TableHead><TableHead className="text-right">Spare</TableHead><TableHead className="text-right">Total ticket</TableHead></TableRow></TableHeader><TableBody>{visibleRows.map((issue) => <TableRow key={issue.key}><TableCell><p className="font-mono text-xs font-bold text-primary">{issue.key}</p><p className="mt-1 max-w-72 truncate text-xs text-muted-foreground">{issue.title}</p></TableCell><TableCell><p className="font-semibold">{issue.technician}</p><p className="text-[11px] text-muted-foreground">{issue.store} · {issue.city}</p></TableCell><TableCell><Badge variant="outline">{issue.status}</Badge></TableCell><TableCell className="text-right font-mono">{money(issue.serviceValue)}</TableCell><TableCell className="text-right font-mono">{money(issue.spareValue)}</TableCell><TableCell className="text-right font-mono font-bold">{money(issue.totalValue)}</TableCell></TableRow>)}</TableBody></Table></div>{!rows.length && <Empty label="Nenhum ticket financeiro encontrado." />}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground"><span>{rows.length} tickets · página {safePage} de {pageCount}</span>{pageCount > 1 && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={safePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button size="sm" variant="outline" disabled={safePage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Próxima</Button></div>}</div></article>
        </>}
      </div>
    </section>
  </main>;
}

function groupTechnicians(issues: FinancialIssue[], rule: PayoutRule): TechnicianRevenue[] {
  const grouped = new Map<string, { tickets: number; revenue: number }>();
  for (const issue of issues) {
    const current = grouped.get(issue.technician) ?? { tickets: 0, revenue: 0 };
    current.tickets += 1;
    current.revenue += issue.totalValue;
    grouped.set(issue.technician, current);
  }
  return Array.from(grouped, ([name, data]) => {
    const payout = (data.tickets ? rule.firstTicketCents : 0) / 100 + Math.max(0, data.tickets - 1) * rule.additionalTicketCents / 100;
    return { name, ...data, payout, margin: data.revenue - payout };
  }).sort((a, b) => b.revenue - a.revenue);
}

function buildMonthly(issues: FinancialIssue[], rule: PayoutRule) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const monthIssues = issues.filter((issue) => { const item = new Date(issue.updatedAt); return item.getFullYear() === date.getFullYear() && item.getMonth() === date.getMonth(); });
    return { month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', ''), revenue: monthIssues.reduce((sum, issue) => sum + issue.totalValue, 0), payout: groupTechnicians(monthIssues, rule).reduce((sum, technician) => sum + technician.payout, 0) };
  });
}

function SideLink({ href, icon: Icon, active, children }: { href: string; icon: typeof Settings; active?: boolean; children: React.ReactNode }) {
  return <a href={href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${active ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Icon className={`size-[18px] ${active ? 'text-primary' : ''}`} />{children}</a>;
}

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof TrendingUp; tone: 'green' | 'blue' | 'amber' | 'violet' }) {
  const colors = { green: 'text-emerald-300', blue: 'text-blue-300', amber: 'text-amber-300', violet: 'text-violet-300' };
  return <article className="cockpit-stat metric-glow rounded-2xl p-5"><div className="flex justify-between"><p className="text-sm text-muted-foreground">{label}</p><div className={`grid size-9 place-items-center rounded-lg bg-black/15 ${colors[tone]}`}><Icon className="size-[18px]" /></div></div><p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p><p className="mt-3 text-xs text-muted-foreground">{note}</p></article>;
}

function RateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-2 block text-xs font-semibold text-muted-foreground">{label}</span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span><Input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className="pl-10" /></div></label>;
}

function Empty({ label }: { label: string }) { return <div className="grid min-h-32 place-items-center p-6 text-sm text-muted-foreground">{label}</div>; }
function formatRate(cents: number) { return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseRate(value: string) { const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'); const amount = Number(normalized); return Number.isFinite(amount) && amount >= 0 && amount <= 10_000 ? Math.round(amount * 100) : null; }
function csvCell(value: string | number) { return `"${String(value).replace(/"/g, '""')}"`; }
