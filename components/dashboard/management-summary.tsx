'use client';

import { useEffect, useMemo, useState } from 'react';
import { BentoCard, CardHeader, Skeleton } from '@/components/dashboard/primitives';
import { auth } from '@/lib/firebase';
import { summarize, type SummaryTicket } from '@/lib/management-summary';

type Extra = {
  contactsToday: number; contactsWeek: number; messagesToday: number; techsToday: number; techsWeek: number; newCitiesWeek: number;
  citiesWithTechnician: number; techCities: string[]; scheduledByAnalyst: Array<{ email: string; count: number }>;
};

const nameOf = (email: string) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

/**
 * Resumo para a gestão logo no começo da Visão geral: o que atender hoje, nos
 * próximos dias, o que está pendente e em quais cidades não há técnico, mais o
 * movimento do WhatsApp e dos cadastros. Filtro por estado vale para os números
 * da fila; o restante é nacional.
 */
export function ManagementSummary({ tickets, now }: { tickets: ReadonlyArray<SummaryTicket>; now: Date }) {
  const [extra, setExtra] = useState<Extra | null>(null);
  const [failed, setFailed] = useState(false);
  const [uf, setUf] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const response = await fetch('/api/management-summary', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error();
        const payload = await response.json() as Extra;
        if (active) setExtra(payload);
      } catch { if (active) setFailed(true); }
    })();
    return () => { active = false; };
  }, []);
  const techCities = useMemo(() => new Set(extra?.techCities ?? []), [extra]);
  const summary = useMemo(() => summarize(tickets, techCities, now, uf || null), [tickets, techCities, now, uf]);
  const ready = tickets.length > 0;
  const stat = (label: string, value: number | string | null, hint?: string) => (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value === null ? <Skeleton className="h-7 w-12" /> : value}</dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const fromExtra = (pick: (e: Extra) => number | string) => (extra ? pick(extra) : failed ? '–' : null);
  return (
    <BentoCard label="Resumo da gestão" className="lg:col-span-2 xl:col-span-12">
      <CardHeader
        title="Resumo da gestão"
        description="O que atender, o que está pendente e o movimento de hoje."
        action={
          <>
            <label className="sr-only" htmlFor="summary-uf">Filtrar por estado</label>
            <select id="summary-uf" value={uf} onChange={(event) => setUf(event.target.value)} className="field min-h-9 w-auto py-0 text-xs">
              <option value="">Todos os estados</option>
              {summary.ufs.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </>
        }
      />
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
        {stat('Atender hoje', ready ? summary.today : null)}
        {stat('Próximos 7 dias', ready ? summary.nextDays : null)}
        {stat('Pendentes de agendamento', ready ? summary.pending : null)}
        {stat('Sem técnico', ready ? summary.unassigned : null)}
        {stat('Mensagens recebidas hoje', fromExtra((e) => e.messagesToday), 'no WhatsApp')}
        {stat('Contatos novos hoje', fromExtra((e) => e.contactsToday), extra ? `${extra.contactsWeek} na semana` : undefined)}
      </dl>
      <dl className="mt-5 grid grid-cols-2 gap-5 border-t border-border pt-5 sm:grid-cols-4">
        {stat('Técnicos cadastrados hoje', fromExtra((e) => e.techsToday), extra ? `${extra.techsWeek} na semana` : undefined)}
        {stat('Cidades novas na semana', fromExtra((e) => e.newCitiesWeek))}
        {stat('Cidades atendidas', fromExtra((e) => e.citiesWithTechnician), 'com técnico cadastrado')}
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Agendamentos hoje, por analista</dt>
          <dd className="mt-1 text-sm">
            {!extra ? (failed ? '–' : <Skeleton className="h-5 w-28" />) : extra.scheduledByAnalyst.length
              ? <ul className="space-y-0.5">{extra.scheduledByAnalyst.slice(0, 5).map((a) => <li key={a.email} className="flex justify-between gap-2"><span className="truncate">{nameOf(a.email)}</span><b className="tabular-nums">{a.count}</b></li>)}</ul>
              : <span className="text-muted-foreground">Nenhum ainda</span>}
          </dd>
        </div>
      </dl>
      <div className="mt-5 border-t border-border pt-5">
        <p className="text-xs font-medium text-muted-foreground">Cidades com chamado pendente e sem técnico cadastrado</p>
        {!ready || (!extra && !failed) ? <Skeleton className="mt-2 h-5 w-48" /> : summary.uncoveredCities.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {summary.uncoveredCities.slice(0, 20).map((c) => (
              <li key={`${c.city}-${c.uf}`} className="rounded-full border border-warning/25 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
                {c.city}{c.uf ? `/${c.uf}` : ''} · {c.tickets}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted-foreground">{failed ? 'Não foi possível checar as cidades agora.' : 'Todas as cidades com pendência têm técnico cadastrado.'}</p>}
      </div>
    </BentoCard>
  );
}
