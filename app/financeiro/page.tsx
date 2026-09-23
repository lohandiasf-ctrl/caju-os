'use client';

import { AppNavigation } from "@/components/app-navigation";
import { ColleaguesPanel } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ArrowLeft, BadgeDollarSign, Building2, CalendarDays, Download, Loader2, Menu, RotateCcw, Search, TrendingUp, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { FsaGroups } from '@/components/fsa-groups';
import { MetricStrip } from '@/components/metric-strip';
import { useAuth } from '@/components/auth-provider';
import { saveFile } from '@/lib/download-file';

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

type TechnicianRevenue = { name: string; tickets: number; revenue: number };

// O repasse vem dos grupos de repasse, e não mais de uma regra de estimativa: é
// o mesmo número que vai para a folha, então dá para conferir 1:1.
type RepasseTecnico = { technicianId: number; tecnico: string; grupos: number; fsas: number; confirmadoCents: number; pendenteCents: number };
type Resumo = { confirmadoCents: number; pendenteCents: number; porTecnico: RepasseTecnico[]; porMes: Array<{ mes: string; totalCents: number }> };

const RESUMO_VAZIO: Resumo = { confirmadoCents: 0, pendenteCents: 0, porTecnico: [], porMes: [] };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const compactMoney = (value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(value);

export default function FinanceiroPage() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<FinancialIssue[]>([]);
  // AAAA-MM-DD a partir do qual o painel conta. Nulo = todo o histórico.
  const [desde, setDesde] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo>(RESUMO_VAZIO);
  const [resumoMensal, setResumoMensal] = useState<Resumo>(RESUMO_VAZIO);
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zerando, setZerando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [avisoExport, setAvisoExport] = useState('');
  const [page, setPage] = useState(1);
  const [showAllTechnicians, setShowAllTechnicians] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    // A chave mudou junto com o formato: um cache antigo traria a regra de
    // estimativa que o painel não usa mais.
    sessionStorage.removeItem('caju-finance-cache');
    const cached = sessionStorage.getItem('caju-finance-cache-v2');
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { at: number; issues: FinancialIssue[]; desde: string | null };
        if (Date.now() - parsed.at < 10 * 60_000) {
          setIssues(parsed.issues); setDesde(parsed.desde); setLoading(false);
          return () => { active = false; };
        }
      } catch { sessionStorage.removeItem('caju-finance-cache-v2'); }
    }
    setLoading(true);
    setError('');
    void user.getIdToken().then(async (token) => {
      const headers = { Authorization: `Bearer ${token}` };
      const [financeResponse, desdeResponse] = await Promise.all([
        fetch('/api/jira/finance?days=365', { headers, cache: 'no-store' }),
        fetch('/api/finance/acompanhamento', { headers, cache: 'no-store' }),
      ]);
      const financePayload = await financeResponse.json() as { issues?: FinancialIssue[]; error?: string };
      const desdePayload = await desdeResponse.json() as { desde?: string | null; error?: string };
      if (!financeResponse.ok) throw new Error(financePayload.error || 'Falha ao carregar financeiro.');
      if (!desdeResponse.ok) throw new Error(desdePayload.error || 'Falha ao carregar o acompanhamento.');
      if (!active) return;
      setIssues(financePayload.issues ?? []);
      setDesde(desdePayload.desde ?? null);
      sessionStorage.setItem('caju-finance-cache-v2', JSON.stringify({ at: Date.now(), issues: financePayload.issues ?? [], desde: desdePayload.desde ?? null }));
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar financeiro.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  // Vale o mais recente entre o início do acompanhamento e o período escolhido:
  // "30 dias" num acompanhamento que começou ontem mostra só desde ontem.
  const desdeMs = desde ? Date.parse(`${desde}T00:00:00-03:00`) : 0;
  const cutoffMs = Math.max(desdeMs, Date.now() - period * 86_400_000);
  const cutoffDia = diaDaOperacao(cutoffMs);

  const periodIssues = useMemo(
    () => issues.filter((issue) => new Date(issue.updatedAt).getTime() >= cutoffMs),
    [issues, cutoffMs],
  );

  useEffect(() => {
    if (!user) return;
    let active = true;
    void user.getIdToken().then(async (token) => {
      const headers = { Authorization: `Bearer ${token}` };
      // Dois recortes: o do período, para os totais baterem com o faturamento
      // da mesma janela, e o do acompanhamento inteiro, para o gráfico mensal.
      const [periodo, mensal] = await Promise.all([
        fetch(`/api/fsa-groups/resumo?desde=${cutoffDia}`, { headers, cache: 'no-store' }),
        fetch(`/api/fsa-groups/resumo${desde ? `?desde=${desde}` : ''}`, { headers, cache: 'no-store' }),
      ]);
      const [dadosPeriodo, dadosMensal] = await Promise.all([periodo.json(), mensal.json()]) as [Resumo & { error?: string }, Resumo & { error?: string }];
      if (!periodo.ok) throw new Error(dadosPeriodo.error || 'Falha ao carregar os repasses.');
      if (!mensal.ok) throw new Error(dadosMensal.error || 'Falha ao carregar os repasses.');
      if (!active) return;
      setResumo(dadosPeriodo);
      setResumoMensal(dadosMensal);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Falha ao carregar os repasses.'); });
    return () => { active = false; };
  }, [user, cutoffDia, desde]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return periodIssues;
    return periodIssues.filter((issue) => [issue.key, issue.title, issue.technician, issue.store, issue.city, issue.status].some((value) => value.toLowerCase().includes(normalized)));
  }, [periodIssues, query]);

  const technicians = useMemo(() => groupTechnicians(periodIssues), [periodIssues]);
  const pageSize = 40;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const visibleTechnicians = showAllTechnicians ? technicians : technicians.slice(0, 25);
  const revenue = periodIssues.reduce((sum, issue) => sum + issue.totalValue, 0);
  const serviceRevenue = periodIssues.reduce((sum, issue) => sum + issue.serviceValue, 0);
  const spareRevenue = periodIssues.reduce((sum, issue) => sum + issue.spareValue, 0);
  const payout = resumo.confirmadoCents / 100;
  const margin = revenue - payout;
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
  const monthly = useMemo(() => buildMonthly(issues, desdeMs, resumoMensal.porMes), [issues, desdeMs, resumoMensal]);

  // Zerar não apaga nada: o painel só passa a ignorar o que veio antes da data.
  async function mudarInicio(valor: 'hoje' | string | null) {
    if (!user) return;
    setZerando(true);
    setAviso('');
    try {
      const response = await fetch('/api/finance/acompanhamento', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde: valor }),
      });
      const payload = await response.json() as { desde?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      setDesde(payload.desde ?? null);
      sessionStorage.removeItem('caju-finance-cache-v2');
      setPage(1);
      setAviso(payload.desde ? `Contando a partir de ${diaBr(payload.desde)}.` : 'Contando todo o histórico.');
    } catch (cause) {
      setAviso(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setZerando(false);
    }
  }

  function exportCsv() {
    const header = ['Chamado', 'Técnico', 'Loja', 'Cidade', 'Status', 'Serviço', 'Spare', 'Total'];
    const body = rows.map((issue) => [issue.key, issue.technician, issue.store, issue.city, issue.status, issue.serviceValue, issue.spareValue, issue.totalValue]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(';')).join('\n');
    setAvisoExport(saveFile(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `financeiro-caju-${period}-dias.csv`));
  }

  return <main className="min-h-screen text-foreground">
    <AppNavigation active="finance" open={menu} onOpenChange={setMenu} />
      {/* Equipe e chat na barra lateral, como no painel principal. */}
      <ColleaguesPanel />
      <section className="app-content">
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu /></Button>
        <a href="/?view=overview" className="hidden items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:flex"><ArrowLeft className="size-4" />Operação</a>
        <div className="ml-auto flex items-center gap-2"><span className="hidden items-center gap-2 text-xs font-medium text-muted-foreground sm:flex"><span aria-hidden="true" className="size-1.5 rounded-full bg-success" />Dados reais do Jira</span><ThemeToggle /></div>
      </header>
      <div id="main-content" tabIndex={-1} className="app-main mx-auto max-w-[1600px] px-4 pt-6 pb-36 sm:px-6 lg:px-8 lg:pt-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="page-eyebrow">Gestão financeira</p><h1 className="page-title">Financeiro</h1><p className="page-subtitle">Valores do ticket, spare, repasses e margem em uma visão.</p></div><div className="flex flex-wrap items-center gap-2"><div role="group" aria-label="Período" className="flex rounded-lg border border-border bg-card p-1">{([7, 30, 90] as const).map((days) => <Button key={days} aria-pressed={period === days} size="sm" variant={period === days ? 'secondary' : 'ghost'} onClick={() => { setPeriod(days); setPage(1); }}>{days} dias</Button>)}</div><Button size="sm" onClick={exportCsv} disabled={!rows.length}><Download />Exportar</Button></div></div>
        {avisoExport && <p aria-live="polite" className="mt-4 rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-success">{avisoExport}</p>}
        {error && <div role="alert" className="mt-6 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">{error}</div>}
        {loading ? <>
          <MetricStrip className="mt-6" loading label="Resumo financeiro" items={[{ label: 'Faturamento previsto', value: '' }, { label: 'Serviços', value: '' }, { label: 'Spares', value: '' }, { label: 'Margem após repasses', value: '' }]} />
          <div aria-hidden="true" className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]"><span className="skeleton block h-80 rounded-2xl" /><span className="skeleton block h-80 rounded-2xl" /></div>
          <output className="sr-only">Carregando dados reais do Jira…</output>
        </> : <>
          {/* Faturamento é o número principal; os outros três o decompõem. */}
          <MetricStrip
            className="mt-6"
            label="Resumo financeiro"
            items={[
              { label: 'Faturamento previsto', value: money(revenue), note: `${periodIssues.length} tickets movimentados em ${period} dias`, icon: TrendingUp },
              { label: 'Serviços', value: money(serviceRevenue), note: 'Total do ticket menos spare', icon: Building2 },
              { label: 'Spares', value: money(spareRevenue), note: 'Valor total de equipamentos', icon: BadgeDollarSign },
              { label: 'Margem após repasses', value: money(margin), note: `${marginPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do faturamento`, icon: WalletCards, tone: margin < 0 ? 'danger' : 'default' },
            ]}
          />
          <FsaGroups />
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
            <article className="surface-panel min-w-0 rounded-2xl p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[15px] font-semibold">Faturamento e repasses</h2><p className="mt-1 text-xs text-muted-foreground">Últimos 6 meses, em reais{desde ? ` · desde ${diaBr(desde)}` : ''}. Repasse = grupos aprovados e pagos.</p></div><Badge variant="outline"><CalendarDays />6 meses</Badge></div><ChartContainer className="mt-5 h-[260px] min-w-0 w-full" config={{ revenue: { label: 'Faturamento', color: 'var(--chart-3)' }, payout: { label: 'Repasses', color: 'var(--chart-1)' } }}><BarChart data={monthly} barGap={5}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => compactMoney(Number(value))} width={70} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => money(Number(value))} />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[5, 5, 0, 0]} /><Bar dataKey="payout" fill="var(--color-payout)" radius={[5, 5, 0, 0]} /></BarChart></ChartContainer></article>
            <article id="repasses" className="surface-panel scroll-mt-24 rounded-2xl p-5">
              <h2 className="text-[15px] font-semibold">Acompanhamento</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desde ? <>O painel conta a partir de <b className="text-foreground">{diaBr(desde)}</b>. Nada antes disso entra nos números — e nada foi apagado.</> : 'O painel está contando todo o histórico.'}</p>
              <Button className="mt-4 w-full" onClick={() => void mudarInicio('hoje')} disabled={zerando}>{zerando ? <Loader2 className="animate-spin" /> : <RotateCcw />}Zerar a partir de hoje</Button>
              <label className="mt-3 block" htmlFor="acompanhamento-desde"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Ou escolha a data de início</span><Input id="acompanhamento-desde" type="date" value={desde ?? ''} disabled={zerando} onChange={(event) => { if (event.target.value) void mudarInicio(event.target.value); }} /></label>
              {desde && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => void mudarInicio(null)} disabled={zerando}>Voltar a contar todo o histórico</Button>}
              {aviso && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{aviso}</p>}
              <div className="mt-5 grid gap-2">
                <div className="rounded-xl border border-border bg-card-elevated p-4"><p className="text-xs text-muted-foreground">Repasse confirmado no período</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(payout)}</p><p className="mt-1 text-[11px] text-muted-foreground">Grupos aprovados e pagos — o que vai para a folha.</p></div>
                <div className={`rounded-xl border p-3 ${resumo.pendenteCents > 0 ? 'border-warning/25 bg-warning-soft' : 'border-border'}`}><p className="text-xs text-muted-foreground">Aguardando a gerência</p><p className={`mt-1 font-semibold tabular-nums ${resumo.pendenteCents > 0 ? 'text-warning' : ''}`}>{money(resumo.pendenteCents / 100)}</p></div>
              </div>
            </article>
          </div>
          <article id="receita-tecnicos" className="surface-panel mt-6 scroll-mt-24 overflow-hidden rounded-2xl"><div className="border-b border-border p-5"><h2 className="text-[15px] font-semibold">Receita gerada por técnico</h2><p className="mt-1 text-xs text-muted-foreground">Total dos tickets no período, com o nome como está no Jira.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Técnico</TableHead><TableHead className="text-right">Chamados</TableHead><TableHead className="text-right">Receita</TableHead></TableRow></TableHeader><TableBody>{visibleTechnicians.map((technician) => <TableRow key={technician.name}><TableCell className="font-semibold">{technician.name}</TableCell><TableCell className="text-right tabular-nums">{technician.tickets}</TableCell><TableCell className="text-right font-mono">{money(technician.revenue)}</TableCell></TableRow>)}</TableBody></Table></div>{!technicians.length && <Empty label="Nenhuma receita no período." />}{technicians.length > 25 && <div className="flex justify-center border-t border-border p-3"><Button size="sm" variant="ghost" onClick={() => setShowAllTechnicians((value) => !value)}>{showAllTechnicians ? 'Mostrar menos' : `Ver todos os ${technicians.length} técnicos`}</Button></div>}</article>
          {/* Tabelas separadas de propósito: receita vem do Jira, com o nome em texto livre ("Lohan Dias"), e repasse vem do cadastro ("Lohan Dias Farias"). Cruzar os dois por nome erraria em silêncio. */}
          <article id="repasse-tecnicos" className="surface-panel mt-6 scroll-mt-24 overflow-hidden rounded-2xl"><div className="border-b border-border p-5"><h2 className="text-[15px] font-semibold">Repasse por técnico</h2><p className="mt-1 text-xs text-muted-foreground">Somado dos grupos de repasse, com o nome do cadastro.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Técnico</TableHead><TableHead className="text-right">Grupos</TableHead><TableHead className="text-right">FSAs</TableHead><TableHead className="text-right">Confirmado</TableHead><TableHead className="text-right">Aguardando</TableHead></TableRow></TableHeader><TableBody>{resumo.porTecnico.map((t) => <TableRow key={t.technicianId}><TableCell className="font-semibold">{t.tecnico}</TableCell><TableCell className="text-right tabular-nums">{t.grupos}</TableCell><TableCell className="text-right tabular-nums">{t.fsas}</TableCell><TableCell className="text-right font-mono font-semibold text-success">{money(t.confirmadoCents / 100)}</TableCell><TableCell className="text-right font-mono text-muted-foreground">{money(t.pendenteCents / 100)}</TableCell></TableRow>)}</TableBody></Table></div>{!resumo.porTecnico.length && <Empty label="Nenhum repasse no período." />}</article>
          <article className="surface-panel mt-6 min-w-0 overflow-hidden rounded-2xl"><div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center"><div className="mr-auto"><h2 className="text-[15px] font-semibold">Composição dos tickets</h2><p className="mt-1 text-xs text-muted-foreground">Serviço e spare sem dupla contagem.</p></div><div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} aria-label="Buscar chamado, técnico ou loja" placeholder="Buscar chamado, técnico ou loja..." className="pl-9" /></div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Chamado</TableHead><TableHead>Técnico / local</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Serviço</TableHead><TableHead className="text-right">Spare</TableHead><TableHead className="text-right">Total ticket</TableHead></TableRow></TableHeader><TableBody>{visibleRows.map((issue) => <TableRow key={issue.key}><TableCell><p className="font-mono text-xs font-bold text-primary">{issue.key}</p><p className="mt-1 max-w-72 truncate text-xs text-muted-foreground">{issue.title}</p></TableCell><TableCell><p className="font-semibold">{issue.technician}</p><p className="text-[11px] text-muted-foreground">{issue.store} · {issue.city}</p></TableCell><TableCell><Badge variant="outline">{issue.status}</Badge></TableCell><TableCell className="text-right font-mono">{money(issue.serviceValue)}</TableCell><TableCell className="text-right font-mono">{money(issue.spareValue)}</TableCell><TableCell className="text-right font-mono font-bold">{money(issue.totalValue)}</TableCell></TableRow>)}</TableBody></Table></div>{!rows.length && <Empty label="Nenhum ticket financeiro encontrado." />}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground"><span>{rows.length} tickets · página {safePage} de {pageCount}</span>{pageCount > 1 && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={safePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button size="sm" variant="outline" disabled={safePage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Próxima</Button></div>}</div></article>
        </>}
      </div>
    </section>
  </main>;
}

function groupTechnicians(issues: FinancialIssue[]): TechnicianRevenue[] {
  const grouped = new Map<string, { tickets: number; revenue: number }>();
  for (const issue of issues) {
    const current = grouped.get(issue.technician) ?? { tickets: 0, revenue: 0 };
    current.tickets += 1;
    current.revenue += issue.totalValue;
    grouped.set(issue.technician, current);
  }
  return Array.from(grouped, ([name, data]) => ({ name, ...data })).sort((a, b) => b.revenue - a.revenue);
}

function buildMonthly(issues: FinancialIssue[], desdeMs: number, porMes: Resumo['porMes']) {
  const now = new Date();
  const repassePorMes = new Map(porMes.map((m) => [m.mes, m.totalCents / 100]));
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const monthIssues = issues.filter((issue) => { const item = new Date(issue.updatedAt); return item.getTime() >= desdeMs && item.getFullYear() === date.getFullYear() && item.getMonth() === date.getMonth(); });
    const chave = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', ''), revenue: monthIssues.reduce((sum, issue) => sum + issue.totalValue, 0), payout: repassePorMes.get(chave) ?? 0 };
  });
}

// O dia é o da operação, não o do navegador: os grupos gravam o dia em Brasília.
function diaDaOperacao(ms: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms));
}

function diaBr(dia: string) { return dia.split('-').reverse().join('/'); }


function Empty({ label }: { label: string }) { return <div className="grid min-h-32 place-items-center p-6 text-center text-sm text-muted-foreground">{label}</div>; }
function csvCell(value: string | number) { return `"${String(value).replace(/"/g, '""')}"`; }
