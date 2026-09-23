'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { motion } from 'motion/react';
import {
  CalendarClock, ChevronRight, CircleCheck, Headphones, Inbox, Map as MapIcon, PackageOpen, TriangleAlert, type LucideIcon,
} from 'lucide-react';
import { ActivityChart } from '@/components/dashboard/activity-chart';
import { AssistantCard } from '@/components/dashboard/assistant-card';
import { QueueSlider } from '@/components/dashboard/queue-slider';
import { BentoCard, CardHeader, CountUp, DeltaBadge, EmptyCard, ErrorCard, Skeleton } from '@/components/dashboard/primitives';
import {
  dailyActivity, daysAgo, deltaPercent, parseSnapshotStore, percent, rollSnapshot, slaOnTimePercent, statusCounts,
  type DashboardTicket, type KpiSnapshotStore, type KpiValues,
} from '@/lib/dashboard-metrics';
import { canUseNavItem } from '@/lib/navigation';
import type { UserRole } from '@/lib/permissions';
import { matchesQueueFilters, NO_QUEUE_FILTERS, PRIORITY_LABEL, PRIORITY_STEPS, queueFiltersHref, STALE_DAYS_MAX, staleLabel, type QueueFilters, type TicketPriority } from '@/lib/queue-filters';
import { parseTicketDate, ticketActivities } from '@/lib/ticket-activities';
import { cn } from '@/lib/utils';

export type BentoTicket = DashboardTicket & {
  title: string;
  store: string;
  city: string;
  rawStatus: string;
  priority: TicketPriority;
};

type Navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
type Operational = { metrics: { active: number; overdue: number }; alerts: { ticketKey: string; level: 'critical' | 'warning' }[] } | null;

const SNAPSHOT_KEY = 'caju-dashboard-kpis';

const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0 } },
};
// Dado já em cache: a cascata encurta para nunca atrasar o que está pronto
// só por causa da animação.
const gridFast = {
  hidden: {},
  show: { transition: { staggerChildren: 0.02, delayChildren: 0 } },
};

function todayKey(now: Date) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback); };
}

/**
 * Visão geral em bento grid. Usa só o que a página já carrega: os chamados
 * ativos do Jira e o resumo de /api/operational-dashboard.
 * xl: 12 colunas (3·6·3 / 8·4 / 8·4). lg: 2 colunas. Celular: 1 coluna.
 */
export function OverviewBento<T extends BentoTicket>({ tickets, loading, error, operational, role, onOpenTicket, onNavigate }: {
  tickets: T[];
  loading: boolean;
  error: string;
  operational: Operational;
  role: UserRole | null;
  onOpenTicket: (ticket: T) => void;
  onNavigate: Navigate;
}) {
  const [cachedAtMount] = useState(() => tickets.length > 0);
  const [now, setNow] = useState(() => new Date());
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  // Momento em que esta lista de chamados chegou (a página troca a referência
  // a cada sincronização do Jira). Carimbado no quadro seguinte, fora do render.
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!tickets.length) return;
    const frame = window.requestAnimationFrame(() => setUpdatedAt(Date.now()));
    return () => window.cancelAnimationFrame(frame);
  }, [tickets]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => statusCounts(tickets), [tickets]);
  const ready = !loading || tickets.length > 0;

  // Retrato diário para o "vs. ontem" (só neste navegador): calcula ao
  // renderizar, grava depois.
  const snapshot = useMemo<KpiSnapshotStore | null>(() => {
    if (!tickets.length) return null;
    let stored: KpiSnapshotStore | null = null;
    try { stored = parseSnapshotStore(window.localStorage.getItem(SNAPSHOT_KEY)); } catch { /* sem storage */ }
    return rollSnapshot(stored, todayKey(new Date()), { open: counts.open, inField: counts.inField, scheduled: counts.scheduled });
  }, [counts, tickets.length]);
  useEffect(() => {
    if (!snapshot) return;
    try { window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch { /* sem storage */ }
  }, [snapshot]);
  const previous = snapshot?.previous?.values;

  const criticalKeys = useMemo(() => new Set((operational?.alerts ?? []).filter((alert) => alert.level === 'critical').map((alert) => alert.ticketKey)), [operational]);
  const jiraError = error && !tickets.length ? error : '';

  return (
    <motion.div className="bento-grid mt-6" variants={cachedAtMount ? gridFast : grid} initial="hidden" animate="show">
      {/* Informação primária da página: a fila. Ocupa mais espaço e traz o
          número grande; SLA e agenda são secundários ao lado. */}
      <BentoCard label="Fila de chamados" className="lg:col-span-2 xl:col-span-6">
        <CardHeader
          title="Fila de chamados"
          description={previous ? 'Variação desde o último dia visto neste navegador.' : 'Chamados ativos no Jira.'}
          action={<>
            <FreshnessBadge updatedAt={updatedAt} online={online} now={now} />
            <a href="/?view=tickets" onClick={(event) => onNavigate(event, '/?view=tickets')} className="inline-flex min-h-9 items-center gap-0.5 rounded-md px-2 text-sm font-medium text-primary hover:underline">Ver fila<ChevronRight aria-hidden="true" className="size-4" /></a>
          </>}
        />
        {jiraError ? <ErrorCard text={jiraError} onRetry={() => window.location.reload()} /> : (
          <QueueOverview counts={counts} previous={previous} ready={ready} />
        )}
      </BentoCard>

      <BentoCard label="Prazo (SLA)" className="xl:col-span-3">
        <SlaCard operational={operational} ready={ready} onNavigate={onNavigate} />
      </BentoCard>

      <BentoCard label="Agenda da quinzena" className="xl:col-span-3">
        <ScheduleSparkline tickets={tickets} now={now} ready={ready} coverage={percent(counts.withTechnician, counts.open)} withTechnician={counts.withTechnician} />
      </BentoCard>

      <BentoCard label="Atividades recentes" className="lg:col-span-2 xl:col-span-8">
        <RecentActivity tickets={tickets} now={now} ready={ready} criticalKeys={criticalKeys} onOpenTicket={onOpenTicket} onNavigate={onNavigate} />
      </BentoCard>

      <BentoCard label="Ações rápidas" className="lg:col-span-2 xl:col-span-4">
        <QuickActions role={role} tickets={tickets} counts={counts} ready={ready} onNavigate={onNavigate} />
      </BentoCard>

      <BentoCard label="Movimento por dia" className="lg:col-span-2 xl:col-span-8">
        <ActivityCard tickets={tickets} now={now} ready={ready} error={jiraError} />
      </BentoCard>

      <BentoCard label="Assistente" className="lg:col-span-2 xl:col-span-4">
        <AssistantCard />
      </BentoCard>
    </motion.div>
  );
}

function FreshnessBadge({ updatedAt, online, now }: { updatedAt: number | null; online: boolean; now: Date }) {
  if (!updatedAt) return null;
  const minutes = Math.floor((now.getTime() - updatedAt) / 60_000);
  if (online && minutes < 2) return null;
  const age = minutes < 1 ? 'agora' : `há ${minutes} min`;
  return <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{online ? `Atualizado ${age}` : `Offline · atualizado ${age}`}</span>;
}

/**
 * SLA (secundário). Card neutro; a cor só aparece quando há atraso, e vem
 * com ícone + texto. O resumo chega por outra rota: se não vier em alguns
 * segundos, o card assume que está indisponível em vez de girar para sempre.
 */
function SlaCard({ operational, ready, onNavigate }: { operational: Operational; ready: boolean; onNavigate: Navigate }) {
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (operational) return;
    const timer = window.setTimeout(() => setGaveUp(true), 8000);
    return () => window.clearTimeout(timer);
  }, [operational]);
  const sla = slaOnTimePercent(operational?.metrics);
  const metrics = operational?.metrics;
  const overdue = metrics?.overdue ?? 0;
  return (
    <div className="flex h-full min-h-[200px] flex-col">
      <CardHeader title="No prazo (SLA)" description="Fluxos ativos sem atraso." />
      <div className="min-h-10">
        {sla !== null ? (
          <p className="text-metric font-semibold tracking-[-.02em]"><CountUp value={sla} suffix="%" /></p>
        ) : !operational && !gaveUp ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="text-metric font-semibold text-muted-foreground"><span aria-hidden="true">—</span><span className="sr-only">Sem dado</span></p>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {metrics && metrics.active > 0
          ? `${metrics.active} ${metrics.active === 1 ? 'fluxo ativo' : 'fluxos ativos'} medidos`
          : operational ? 'Nenhum fluxo ativo para medir agora.' : gaveUp && ready ? 'Indicador de SLA indisponível agora.' : 'Carregando indicador…'}
      </p>
      {metrics && metrics.active > 0 && (
        <div className="mt-auto pt-4">
          {overdue > 0 ? (
            <a href="/?view=tickets" onClick={(event) => onNavigate(event, '/?view=tickets')} className="flex min-h-10 items-center gap-2 rounded-lg bg-warning-soft px-3 text-sm font-medium text-warning hover:brightness-95">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{overdue} {overdue === 1 ? 'atrasado' : 'atrasados'}</span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
            </a>
          ) : (
            <p className="flex min-h-10 items-center gap-2 rounded-lg bg-success-soft px-3 text-sm font-medium text-success">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0" />Nenhum atraso
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Mesmas cores de ponto do kanban (status → cor), para a fila ler igual nas
// duas telas. É codificação de etapa, sempre acompanhada do nome.
const queueSegments = [
  ['pendingSchedule', 'Pendente de agenda', 'bg-violet-400'],
  ['scheduled', 'Agendado', 'bg-blue-400'],
  ['inField', 'Em campo', 'bg-emerald-400'],
  ['awaitingSpare', 'Aguardando spare', 'bg-amber-400'],
  ['directed', 'Direcionado', 'bg-cyan-400'],
] as const;

/**
 * Número principal (em aberto) com a variação e o que ele significa; ao
 * lado, as etapas da fila como lista alinhada — valor à direita, barra fina
 * proporcional. Em campo e agendados levam a própria variação.
 */
function QueueOverview({ counts, previous, ready }: {
  counts: ReturnType<typeof statusCounts>;
  previous: KpiValues | undefined;
  ready: boolean;
}) {
  const values = { ...counts, directed: Math.max(0, counts.open - counts.pendingSchedule - counts.scheduled - counts.inField - counts.awaitingSpare) };
  const total = Math.max(1, counts.open);
  const withoutTechnician = Math.max(0, counts.open - counts.withTechnician);
  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Em aberto</p>
        <div className="mt-1 flex min-h-10 items-center gap-2">
          {ready ? <p className="text-metric-lg font-semibold tracking-[-.03em]"><CountUp value={counts.open} /></p> : <Skeleton className="h-10 w-20" />}
          {ready && <DeltaBadge value={deltaPercent(counts.open, previous?.open)} upIsGood={false} />}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {!ready ? 'Carregando a fila…' : counts.open === 0 ? 'Fila vazia agora.' : withoutTechnician > 0 ? `${withoutTechnician} ainda sem técnico` : 'Todos com técnico definido'}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
          <SecondaryStat label="Em campo" value={counts.inField} delta={deltaPercent(counts.inField, previous?.inField)} ready={ready} />
          <SecondaryStat label="Agendados" value={counts.scheduled} delta={deltaPercent(counts.scheduled, previous?.scheduled)} ready={ready} />
        </dl>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Por etapa</p>
        <ul className="mt-2 space-y-2" aria-label="Chamados por etapa">
          {queueSegments.map(([key, label, tone]) => (
            <li key={key} className="text-sm">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', tone)} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{ready ? values[key] : '–'}</span>
              </div>
              <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                {ready && <span className={cn('block h-full rounded-full transition-[width] duration-500', tone)} style={{ width: `${(values[key] / total) * 100}%` }} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SecondaryStat({ label, value, delta, ready }: { label: string; value: number; delta: number | null; ready: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        {ready ? <span className="text-xl font-semibold"><CountUp value={value} /></span> : <Skeleton className="h-7 w-10" />}
        {ready && <DeltaBadge value={delta} />}
      </dd>
    </div>
  );
}

function ScheduleSparkline({ tickets, now, ready, coverage, withTechnician }: { tickets: BentoTicket[]; now: Date; ready: boolean; coverage: number | null; withTechnician: number }) {
  // 7 dias para trás e 7 à frente: o que já foi (azul) e o que está previsto (trilho).
  const days = useMemo(() => dailyActivity(tickets, daysAgo(now, 6), 14, parseTicketDate), [now, tickets]);
  const max = Math.max(1, ...days.map((day) => day.scheduled));
  const todayIndex = 6;
  const past = days.slice(0, todayIndex + 1).reduce((sum, day) => sum + day.scheduled, 0);
  const ahead = days.slice(todayIndex + 1).reduce((sum, day) => sum + day.scheduled, 0);
  return (
    <div className="flex h-full min-h-[200px] flex-col">
      <CardHeader title="Agenda da quinzena" description="Atendimentos agendados por dia." />
      <div className="min-h-10">
        {ready && coverage !== null ? <p className="text-metric font-semibold tracking-[-.02em]"><CountUp value={coverage} suffix="%" /></p> : ready ? <p className="text-metric font-semibold text-muted-foreground">—</p> : <Skeleton className="h-9 w-20" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{ready ? `com técnico · ${withTechnician} ${withTechnician === 1 ? 'chamado' : 'chamados'} · ${past} nos últimos 7 dias` : 'Carregando…'}</p>
      <div className="mt-auto pt-4">
        <div role="img" aria-label={`${past} atendimentos nos últimos 7 dias e ${ahead} previstos para os próximos 7.`} className="flex h-20 items-end justify-between gap-1">
          {days.map((day, index) => {
            const height = ready ? Math.max(8, Math.round((day.scheduled / max) * 100)) : 20 + ((index * 23) % 50);
            return (
              <motion.span
                key={day.key}
                title={`${day.label}: ${day.scheduled}`}
                className={cn('block w-1.5 origin-bottom rounded-[3px]', !ready ? 'skeleton' : index <= todayIndex && day.scheduled ? 'bg-primary' : 'bg-chart-track')}
                style={{ height: `${height}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.3 + index * 0.03, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              />
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />Realizado</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full border-2 border-chart-track" />Previsto</span>
        </div>
      </div>
    </div>
  );
}

function ActivityCard({ tickets, now, ready, error }: { tickets: BentoTicket[]; now: Date; ready: boolean; error: string }) {
  const [period, setPeriod] = useState<7 | 14>(14);
  const data = useMemo(() => dailyActivity(tickets, daysAgo(now, period - 1), period, parseTicketDate), [now, period, tickets]);
  const empty = ready && data.every((day) => day.moved === 0 && day.scheduled === 0 && day.triggered === 0);
  return (
    <div className="flex h-full flex-col">
      <CardHeader
        title="Movimento por dia"
        description="Agendamentos e acionamentos dos chamados da fila atual."
        action={<div role="group" aria-label="Período" className="flex rounded-lg bg-muted p-0.5">
          {([7, 14] as const).map((days) => (
            <button key={days} type="button" aria-pressed={period === days} onClick={() => setPeriod(days)} className={cn('min-h-8 rounded-md px-3 text-xs font-medium max-sm:min-h-10', period === days ? 'bg-card-elevated text-foreground shadow-(--shadow-xs)' : 'text-muted-foreground hover:text-foreground')}>
              {days} dias
            </button>
          ))}
        </div>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-[3px] bg-primary" />Agendados</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-[3px] bg-chart-missed" />Acionados</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-[3px] bg-chart-track" />Escala do período</span>
      </div>
      {error ? <ErrorCard text={error} onRetry={() => window.location.reload()} />
        : !ready ? <ChartSkeleton />
          : empty ? <EmptyCard icon={CalendarClock} text="Nenhum agendamento ou acionamento no período — fila tranquila." />
            : <ActivityChart data={data} />}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div aria-hidden="true" className="flex h-[260px] items-end justify-between gap-2 pb-6 pl-8">
      {Array.from({ length: 14 }, (_, index) => <span key={index} className="skeleton block w-full max-w-6 rounded-[10px]" style={{ height: `${35 + ((index * 37) % 55)}%` }} />)}
    </div>
  );
}

const statusTone: Record<string, string> = {
  'Técnico em campo': 'bg-success-soft text-success',
  Agendado: 'bg-primary-soft text-primary',
  'Pendente de agendamento': 'bg-warning-soft text-warning',
  'Aguardando spare': 'bg-warning-soft text-warning',
};

function StatusPill({ ticket, critical }: { ticket: BentoTicket; critical: boolean }) {
  return (
    <span className={cn('inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-semibold', critical ? 'bg-danger-soft text-danger' : statusTone[ticket.status] ?? 'bg-muted text-muted-foreground')}>
      <span className="truncate">{critical ? `Atrasado · ${ticket.rawStatus}` : ticket.rawStatus}</span>
    </span>
  );
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const shortDate = (date: Date) => dateFormat.format(date).replace('.', '').replace(' de ', ' ');

function RecentActivity<T extends BentoTicket>({ tickets, now, ready, criticalKeys, onOpenTicket, onNavigate }: {
  tickets: T[]; now: Date; ready: boolean; criticalKeys: Set<string>; onOpenTicket: (ticket: T) => void; onNavigate: Navigate;
}) {
  const rows = useMemo(() => tickets
    .flatMap((ticket) => ticketActivities(ticket))
    .filter((activity) => activity.date.getTime() <= now.getTime())
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 6), [now, tickets]);
  return (
    <div className="flex h-full flex-col">
      <CardHeader
        title="Atividades recentes"
        description="Últimos movimentos dos chamados ativos."
        action={<a href="/?view=tickets" onClick={(event) => onNavigate(event, '/?view=tickets')} className="inline-flex min-h-9 items-center gap-0.5 rounded-md px-2 text-sm font-medium text-primary hover:underline">Ver tudo<ChevronRight aria-hidden="true" className="size-4" /></a>}
      />
      {!ready ? (
        <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-11 w-full" />)}</div>
      ) : !rows.length ? (
        <EmptyCard icon={Inbox} text="Nenhuma atividade recente — bom sinal." />
      ) : <>
        {/* Desktop: tabela, rola dentro do card. A linha inteira abre o chamado;
            o botão no número é o alvo de teclado. */}
        <div className="-mx-2 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="px-2 pb-2 font-medium">Chamado</th>
                <th scope="col" className="px-2 pb-2 font-medium">Movimento</th>
                <th scope="col" className="px-2 pb-2 font-medium">Quando</th>
                <th scope="col" className="px-2 pb-2 font-medium">Técnico</th>
                <th scope="col" className="px-2 pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((activity) => (
                <tr key={`${activity.ticket.id}-${activity.label}-${activity.date.getTime()}`} onClick={() => onOpenTicket(activity.ticket)} className="recent-row h-14 cursor-pointer border-t border-border">
                  <td className="max-w-[16rem] px-2">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpenTicket(activity.ticket); }} className="block max-w-full truncate text-left font-mono text-xs font-semibold text-primary hover:underline">{activity.ticket.id}</button>
                    <span className="block truncate text-xs text-muted-foreground">{activity.ticket.store}</span>
                  </td>
                  <td className="px-2 text-muted-foreground">{activity.label}</td>
                  <td className="px-2 tabular-nums"><span className="block">{shortDate(activity.date)}</span><span className="block text-xs text-muted-foreground">{timeFormat.format(activity.date)}</span></td>
                  <td className="max-w-[10rem] truncate px-2">{activity.ticket.technician || <span className="text-muted-foreground">—</span>}</td>
                  <td className="max-w-[12rem] px-2"><StatusPill ticket={activity.ticket} critical={criticalKeys.has(activity.ticket.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Celular: lista de cards. */}
        <ul className="space-y-2 md:hidden">
          {rows.map((activity) => (
            <li key={`${activity.ticket.id}-${activity.label}-${activity.date.getTime()}`}>
              <button type="button" onClick={() => onOpenTicket(activity.ticket)} className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/60">
                <span className="flex items-center justify-between gap-2"><b className="truncate text-sm">{activity.ticket.id}</b><StatusPill ticket={activity.ticket} critical={criticalKeys.has(activity.ticket.id)} /></span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{activity.label} · {shortDate(activity.date)}, {timeFormat.format(activity.date)}{activity.ticket.technician ? ` · ${activity.ticket.technician}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </>}
    </div>
  );
}

function QuickActions({ role, tickets, counts, ready, onNavigate }: {
  role: UserRole | null; tickets: BentoTicket[]; counts: ReturnType<typeof statusCounts>; ready: boolean; onNavigate: Navigate;
}) {
  // Só atalhos para telas e ações que já existem, respeitando as permissões do
  // menu. Ícone neutro identifica o destino; a contagem ganha cor de atenção
  // só quando há algo esperando.
  const actions: { key: string; href: string; label: string; hint: string; count: number | null; icon: LucideIcon }[] = [
    { key: 'agenda', href: '/?view=agenda', label: 'Pendentes de agenda', hint: 'Agenda', count: counts.pendingSchedule, icon: CalendarClock },
    { key: 'central', href: '/?view=central', label: 'Fila da Central N1', hint: 'Central N1', count: null, icon: Headphones },
    { key: 'spares', href: '/spares', label: 'Aguardando spare', hint: 'Spares', count: counts.awaitingSpare, icon: PackageOpen },
    { key: 'map', href: '/mapa', label: 'Técnicos no mapa', hint: 'Mapa operacional', count: null, icon: MapIcon },
  ].filter((action) => canUseNavItem(role, action.key));
  return (
    <div className="flex h-full flex-col">
      <CardHeader title="Ações rápidas" description="Atalhos para o que mais pede atenção." />
      <ul className="-mx-2 space-y-0.5">
        {actions.map((action) => (
          <li key={action.key}>
            <a href={action.href} onClick={(event) => onNavigate(event, action.href)} className="quick-action">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><action.icon className="size-4" strokeWidth={1.75} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{action.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{action.hint}</span>
              </span>
              {action.count !== null && (ready
                ? <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium tabular-nums', action.count > 0 ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>{action.count}<span className="sr-only"> {action.count === 1 ? 'chamado' : 'chamados'}</span></span>
                : <Skeleton className="h-5 w-8" />)}
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
      {canUseNavItem(role, 'tickets') && <QueueFilterShortcut tickets={tickets} ready={ready} onNavigate={onNavigate} />}
    </div>
  );
}

/**
 * Sliders que montam um recorte da fila (parados há N dias, prioridade
 * mínima) e abrem a lista de Chamados já filtrada. A contagem é ao vivo,
 * sobre os mesmos chamados da tela.
 */
function QueueFilterShortcut({ tickets, ready, onNavigate }: { tickets: BentoTicket[]; ready: boolean; onNavigate: Navigate }) {
  const [filters, setFilters] = useState<QueueFilters>({ staleDays: 3, minPriority: NO_QUEUE_FILTERS.minPriority });
  const count = useMemo(() => {
    const now = new Date();
    return tickets.filter((ticket) => matchesQueueFilters(ticket, filters, now, parseTicketDate)).length;
  }, [filters, tickets]);
  const href = queueFiltersHref(filters);
  return (
    <div className="mt-4 rounded-xl border border-border bg-card-elevated p-4">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Filtrar a fila</p>
      <QueueSlider
        label="Parado há"
        value={filters.staleDays}
        min={0}
        max={STALE_DAYS_MAX}
        valueText={staleLabel(filters.staleDays)}
        onChange={(staleDays) => setFilters((current) => ({ ...current, staleDays }))}
      />
      <QueueSlider
        label="Prioridade mínima"
        value={PRIORITY_STEPS.indexOf(filters.minPriority)}
        min={0}
        max={PRIORITY_STEPS.length - 1}
        valueText={PRIORITY_LABEL[filters.minPriority]}
        onChange={(step) => setFilters((current) => ({ ...current, minPriority: PRIORITY_STEPS[step] ?? 'Baixa' }))}
      />
      <a
        href={href}
        onClick={(event) => onNavigate(event, href)}
        className="mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-(--brand-strong) max-sm:min-h-11"
      >
        {ready ? `Ver ${count} ${count === 1 ? 'chamado' : 'chamados'} na fila` : 'Ver na fila'}
        <ChevronRight aria-hidden="true" className="size-4" />
      </a>
    </div>
  );
}
