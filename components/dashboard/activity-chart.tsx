'use client';

import { memo, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DayActivity } from '@/lib/dashboard-metrics';

// Colunas "com trilho": atrás de cada dia um trilho neutro da altura do
// gráfico; na frente, agendados (azul) e acionados (laranja) empilhados, com
// 4 px de respiro entre os segmentos. O trilho é só desenho — não há meta de
// chamados no sistema para representar.

const RADIUS = 10;
const GAP = 4;
const DAY_STAGGER_MS = 60;
const INTRO_MS = 1400 + 14 * DAY_STAGGER_MS;

type ShapeProps = {
  x?: number; y?: number; width?: number; height?: number; index?: number;
  payload?: DayActivity;
};

function pillPath(x: number, y: number, width: number, height: number) {
  const r = Math.max(0, Math.min(RADIUS, width / 2, height / 2));
  return `M${x},${y + r} a${r},${r} 0 0 1 ${r},${-r} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${height - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(width - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} Z`;
}

function makeSegment(kind: 'base' | 'top', intro: boolean) {
  return function Segment({ x = 0, y = 0, width = 0, height = 0, index = 0, payload }: ShapeProps) {
    if (height <= 0 || width <= 0) return <g />;
    // O segmento de cima abre mão de 4 px embaixo para o respiro — só quando há
    // base embaixo dele.
    const gap = kind === 'top' && (payload?.scheduled ?? 0) > 0 ? GAP : 0;
    const h = Math.max(height - gap, Math.min(height, 3));
    const delay = index * DAY_STAGGER_MS + (kind === 'base' ? 120 : 380);
    return (
      <path
        d={pillPath(x, y, width, h)}
        className={intro ? 'chart-bar-grow' : undefined}
        style={{ fill: kind === 'base' ? 'var(--primary)' : 'var(--chart-missed)', animationDelay: intro ? `${delay}ms` : undefined }}
      />
    );
  };
}

function makeTrack(intro: boolean) {
  return function Track({ x = 0, y = 0, width = 0, height = 0, index = 0 }: ShapeProps) {
    return (
      <path
        d={pillPath(x, y, width, height)}
        className={intro ? 'chart-track-fade' : undefined}
        style={{ fill: 'var(--chart-track)', animationDelay: intro ? `${index * 25}ms` : undefined }}
      />
    );
  };
}

function Cursor({ x = 0, y = 0, width = 0, height = 0 }: ShapeProps) {
  const pad = 6;
  return <rect x={x - pad} y={y - pad} width={width + pad * 2} height={height + pad * 2} rx={14} style={{ fill: 'var(--muted)', opacity: 0.6 }} />;
}

function ChartTooltip({ active, payload }: Pick<TooltipContentProps<ValueType, NameType>, "active" | "payload">) {
  const day = payload?.[0]?.payload as DayActivity | undefined;
  if (!active || !day) return null;
  const rows = [
    ['var(--primary)', 'Agendados', day.scheduled],
    ['var(--chart-missed)', 'Acionados', day.triggered],
    ['var(--chart-track)', 'Movimentados', day.moved],
  ] as const;
  return (
    <div className="min-w-44 rounded-xl border border-border bg-card-elevated px-3 py-2.5 text-xs shadow-(--shadow-overlay)">
      <p className="mb-1.5 font-semibold capitalize">{new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(day.date)}</p>
      {rows.map(([color, label, value]) => (
        <p key={label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-[3px]" style={{ background: color }} />{label}</span>
          <span className="font-semibold tabular-nums">{value}</span>
        </p>
      ))}
    </div>
  );
}

export const ActivityChart = memo(function ActivityChart({ data }: { data: DayActivity[] }) {
  // Entrada em cascata só na primeira montagem; depois, trocar o período
  // interpola as alturas pela animação do próprio Recharts.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    // Teto para o período mais longo (14 dias); roda só na montagem.
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const max = Math.max(1, ...data.map((day) => Math.max(day.scheduled + day.triggered, day.moved)));
  const ceiling = Math.ceil(max * 1.15);
  const rows = data.map((day) => ({ ...day, track: ceiling }));
  const busiest = data.reduce<DayActivity | null>((best, day) => (!best || day.scheduled + day.triggered > best.scheduled + best.triggered ? day : best), null);
  const totalScheduled = data.reduce((sum, day) => sum + day.scheduled, 0);
  const totalTriggered = data.reduce((sum, day) => sum + day.triggered, 0);
  const summary = `Nos últimos ${data.length} dias: ${totalScheduled} atendimentos agendados e ${totalTriggered} acionamentos de parceiro.${busiest ? ` Dia mais movimentado: ${busiest.label}.` : ''}`;

  return (
    <figure className="m-0 flex min-h-[260px] flex-1 flex-col">
      <div role="img" aria-label={summary} className="min-h-[260px] w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap="22%" margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 6" style={{ stroke: 'var(--border)' }} />
            <XAxis dataKey="label" xAxisId="day" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} dy={6} />
            <XAxis dataKey="label" xAxisId="track" hide />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={40} domain={[0, ceiling]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <Tooltip cursor={<Cursor />} content={(props) => <ChartTooltip active={props.active} payload={props.payload} />} animationDuration={120} wrapperStyle={{ outline: 'none' }} />
            <Bar dataKey="track" xAxisId="track" maxBarSize={24} shape={makeTrack(intro)} isAnimationActive={false} activeBar={false} legendType="none" />
            <Bar dataKey="scheduled" name="Agendados" xAxisId="day" stackId="day" maxBarSize={24} shape={makeSegment('base', intro)} isAnimationActive={!intro} animationDuration={400} animationEasing="ease-out" />
            <Bar dataKey="triggered" name="Acionados" xAxisId="day" stackId="day" maxBarSize={24} shape={makeSegment('top', intro)} isAnimationActive={!intro} animationDuration={400} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Movimento por dia</caption>
        <thead><tr><th scope="col">Dia</th><th scope="col">Agendados</th><th scope="col">Acionados</th><th scope="col">Movimentados</th></tr></thead>
        <tbody>{data.map((day) => <tr key={day.key}><th scope="row">{day.label}</th><td>{day.scheduled}</td><td>{day.triggered}</td><td>{day.moved}</td></tr>)}</tbody>
      </table>
    </figure>
  );
});
