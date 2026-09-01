'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, BadgeDollarSign, Bell, Building2, CalendarDays, Check, CircleDollarSign, Clock3, Download, FileCheck2, Filter, LayoutDashboard, Menu, MoreHorizontal, ReceiptText, Search, Settings, TrendingUp, Users, WalletCards, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const cashflow = [
  { month: 'Abr', revenue: 182, payout: 121 }, { month: 'Mai', revenue: 208, payout: 138 },
  { month: 'Jun', revenue: 196, payout: 129 }, { month: 'Jul', revenue: 238, payout: 151 },
  { month: 'Ago', revenue: 264, payout: 168 }, { month: 'Set', revenue: 286, payout: 179 },
];

const payments = [
  { ticket: 'FSA-129617', technician: 'Demostenes Pedrosa', project: 'Americanas', city: 'Maracanau, CE', amount: 380, due: 'Hoje', status: 'Pendente' },
  { ticket: 'FSA-129461', technician: 'Lucas Andrade', project: 'Americanas', city: 'Sao Jose de Mipibu, RN', amount: 295, due: 'Hoje', status: 'Pendente' },
  { ticket: 'FSA-129426', technician: 'Marcos Souza', project: 'Americanas', city: 'Itabira, MG', amount: 420, due: 'Amanha', status: 'Aprovado' },
  { ticket: 'FSA-129311', technician: 'Rafael Santos', project: 'Americanas', city: 'Juazeiro do Norte, CE', amount: 260, due: '03 set', status: 'Pendente' },
  { ticket: 'FSA-129173', technician: 'Bruno Oliveira', project: 'Americanas', city: 'Juiz de Fora, MG', amount: 345, due: '04 set', status: 'Em analise' },
];

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FinanceiroPage() {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('30 dias');
  const [menu, setMenu] = useState(false);
  const [paid, setPaid] = useState<string[]>([]);
  const rows = useMemo(() => payments.filter((p) => [p.ticket, p.technician, p.project, p.city].some((v) => v.toLowerCase().includes(query.toLowerCase()))), [query]);
  const pendingTotal = rows.filter((p) => !paid.includes(p.ticket)).reduce((sum, p) => sum + p.amount, 0);

  return <main className="min-h-screen bg-background text-foreground">
    <aside className={`fixed inset-y-0 left-0 z-40 w-[252px] border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform lg:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'}`}>
      <a href="/" className="flex h-12 items-center gap-3 px-2"><div className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground shadow-[0_8px_28px_rgba(229,98,35,.25)]">C</div><div><div className="text-[15px] font-extrabold tracking-tight">Caju OS</div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Central de operacoes</div></div></a>
      <nav className="mt-8 space-y-1" aria-label="Navegacao financeira">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Gestao</p>
        <a href="/" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><LayoutDashboard className="size-[18px]" />Visao geral</a>
        <button className="flex h-10 w-full items-center gap-3 rounded-lg bg-sidebar-accent px-3 text-sm font-medium text-foreground shadow-[inset_3px_0_0_var(--primary)]"><CircleDollarSign className="size-[18px] text-primary" />Financeiro</button>
        <button className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><FileCheck2 className="size-[18px]" />Aprovacoes</button>
        <button className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><ReceiptText className="size-[18px]" />Relatorios</button>
      </nav>
      <div className="mt-8 rounded-xl border border-primary/20 bg-primary/8 p-4"><div className="flex items-center gap-2 text-xs font-bold text-primary"><BadgeDollarSign className="size-4" />Fechamento mensal</div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Setembro fecha em 29 dias. Existem 12 atendimentos aguardando validacao.</p><Progress value={64} className="mt-3" /></div>
      <div className="absolute inset-x-4 bottom-5 border-t border-sidebar-border pt-4"><button className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Settings className="size-[18px]" />Configuracoes</button><div className="mt-3 flex items-center gap-3 rounded-xl border border-sidebar-border bg-background/40 p-3"><div className="grid size-9 place-items-center rounded-full bg-[#28344a] text-xs font-bold text-[#9fb4d5]">LD</div><div><p className="text-xs font-semibold">Lohan Dias</p><p className="text-[10px] text-muted-foreground">Administrador</p></div></div></div>
    </aside>
    {menu && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMenu(false)} />}
    <section className="min-h-screen lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu /></Button><a href="/" className="hidden items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:flex"><ArrowLeft className="size-4" />Operacao</a><div className="ml-auto flex items-center gap-2"><Badge variant="outline" className="hidden border-amber-400/25 bg-amber-400/10 text-amber-300 sm:flex">Dados demonstrativos</Badge><Button variant="ghost" size="icon" aria-label="Notificacoes"><Bell /></Button></div></header>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.14em] text-primary">Gestao financeira</p><h1 className="text-2xl font-extrabold tracking-[-.03em] sm:text-3xl">Financeiro</h1><p className="mt-1 text-sm text-muted-foreground">Faturamento, repasses e margem dos atendimentos em uma unica visao.</p></div><div className="flex flex-wrap gap-2">{['7 dias', '30 dias', '90 dias'].map((item) => <Button key={item} size="sm" variant={period === item ? 'secondary' : 'outline'} onClick={() => setPeriod(item)}>{item}</Button>)}<Button variant="outline" size="sm"><Building2 />Todos os projetos</Button><Button size="sm"><Download />Exportar</Button></div></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <Metric label="Faturamento previsto" value="R$ 286.420" trend="+12,4%" note="vs. periodo anterior" icon={TrendingUp} positive />
          <Metric label="Repasses a tecnicos" value="R$ 179.860" trend="+8,1%" note="63% do faturamento" icon={Users} />
          <Metric label="Margem operacional" value="R$ 106.560" trend="37,2%" note="meta mensal: 35%" icon={WalletCards} positive />
          <Metric label="Pagamentos pendentes" value={money(pendingTotal)} trend="45 itens" note="8 vencem hoje" icon={Clock3} alert />
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.7fr)]">
          <article className="rounded-xl border border-border bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,.08)]"><div className="flex items-start justify-between"><div><h2 className="text-sm font-bold">Faturamento e repasses</h2><p className="mt-1 text-xs text-muted-foreground">Valores mensais em milhares de reais</p></div><Badge variant="outline"><CalendarDays />Ultimos 6 meses</Badge></div><ChartContainer className="mt-5 h-[250px] w-full" config={{ revenue: { label: 'Faturamento', color: '#ea7a38' }, payout: { label: 'Repasses', color: '#65748e' } }}><BarChart data={cashflow} barGap={6}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} width={28} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[5,5,0,0]} /><Bar dataKey="payout" fill="var(--color-payout)" radius={[5,5,0,0]} /></BarChart></ChartContainer></article>
          <article className="rounded-xl border border-border bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,.08)]"><div><h2 className="text-sm font-bold">Composicao do mes</h2><p className="mt-1 text-xs text-muted-foreground">Distribuicao do faturamento previsto</p></div><div className="relative mx-auto mt-6 grid size-40 place-items-center rounded-full" style={{ background: 'conic-gradient(#ea7a38 0 37.2%, #687895 37.2% 100%)' }}><div className="grid size-28 place-items-center rounded-full bg-card text-center"><div><p className="text-2xl font-extrabold">37,2%</p><p className="text-[10px] text-muted-foreground">margem</p></div></div></div><div className="mt-6 space-y-3"><Legend color="bg-primary" label="Margem operacional" value="R$ 106.560" /><Legend color="bg-[#687895]" label="Repasses tecnicos" value="R$ 179.860" /></div><div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-400/8 p-3 text-xs text-emerald-300"><div className="flex items-center gap-2 font-bold"><ArrowUpRight className="size-4" />2,2 p.p. acima da meta</div></div></article>
        </div>
        <div className="mt-6 rounded-xl border border-border bg-card shadow-[0_12px_40px_rgba(0,0,0,.08)]">
          <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center"><div className="mr-auto"><h2 className="text-sm font-bold">Pagamentos a tecnicos</h2><p className="mt-1 text-xs text-muted-foreground">Fila de repasses dos atendimentos validados</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tecnico ou chamado..." className="pl-9" /></div><Button variant="outline" size="sm"><Filter />Filtrar</Button></div>
          <Table><TableHeader><TableRow><TableHead>Chamado</TableHead><TableHead>Tecnico / local</TableHead><TableHead>Projeto</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-36"></TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const isPaid = paid.includes(row.ticket); return <TableRow key={row.ticket} className={isPaid ? 'opacity-50' : ''}><TableCell className="font-mono text-xs font-bold text-primary">{row.ticket}</TableCell><TableCell><p className="font-semibold">{row.technician}</p><p className="text-[11px] text-muted-foreground">{row.city}</p></TableCell><TableCell>{row.project}</TableCell><TableCell className={row.due === 'Hoje' ? 'font-bold text-amber-300' : ''}>{row.due}</TableCell><TableCell><StatusBadge status={isPaid ? 'Pago' : row.status} /></TableCell><TableCell className="text-right font-mono font-bold">{money(row.amount)}</TableCell><TableCell className="text-right">{isPaid ? <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Check className="size-4" />Pago</span> : <Button size="sm" variant="outline" onClick={() => setPaid((current) => [...current, row.ticket])}>Marcar pago</Button>}</TableCell></TableRow> })}</TableBody></Table>
          {!rows.length && <div className="grid h-40 place-items-center text-sm text-muted-foreground">Nenhum pagamento encontrado.</div>}
          <div className="flex items-center justify-between border-t border-border px-5 py-4 text-xs text-muted-foreground"><span>{rows.length} pagamentos exibidos</span><span>Pendente: <strong className="ml-1 text-foreground">{money(pendingTotal)}</strong></span></div>
        </div>
      </div>
    </section>
  </main>;
}

function Metric({ label, value, trend, note, icon: Icon, positive, alert }: { label: string; value: string; trend: string; note: string; icon: typeof TrendingUp; positive?: boolean; alert?: boolean }) {
  return <article className="rounded-xl border border-border bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,.08)]"><div className="flex justify-between"><p className="text-xs text-muted-foreground">{label}</p><div className={`grid size-9 place-items-center rounded-lg bg-muted ${alert ? 'text-amber-300' : positive ? 'text-emerald-300' : 'text-blue-300'}`}><Icon className="size-[18px]" /></div></div><p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p><div className="mt-3 flex items-center gap-2 text-[11px]"><span className={positive ? 'font-bold text-emerald-300' : alert ? 'font-bold text-amber-300' : 'font-bold text-blue-300'}>{trend}</span><span className="text-muted-foreground">{note}</span></div></article>;
}
function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <div className="flex items-center gap-2 text-xs"><span className={`size-2 rounded-full ${color}`} /><span className="flex-1 text-muted-foreground">{label}</span><strong>{value}</strong></div> }
function StatusBadge({ status }: { status: string }) { const style = status === 'Pago' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : status === 'Aprovado' ? 'border-blue-400/25 bg-blue-400/10 text-blue-300' : status === 'Em analise' ? 'border-violet-400/25 bg-violet-400/10 text-violet-300' : 'border-amber-400/25 bg-amber-400/10 text-amber-300'; return <Badge variant="outline" className={style}>{status}</Badge> }
