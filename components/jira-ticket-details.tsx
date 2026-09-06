'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Loader2, RefreshCw, Save, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type JiraOperationalFields = {
  storeCode: string | null; storeName: string | null; contactName: string | null; contactPhone: string | null; preferredServiceTime: string | null;
  problemCategory: string | null; equipmentModel: string | null; pdvNumber: string | null; problemType: string | null; allegedDefect: string | null;
  visitCost1: string | null; equipmentTotal: string | null; kmTotal: string | null; visitCost2: string | null; ticketTotal: string | null; visitNumber: string | null;
  additionalCosts: string | null; defectSummary: string | null;
};

type Details = { key: string; status: string; priority: string; assignee: string | null; reporter: string | null; issueType: string; createdAt: string; description: string; operationalFields: JiraOperationalFields };
type User = { getIdToken: () => Promise<string> } | null;
const fields: Array<[keyof JiraOperationalFields, string]> = [
  ['storeCode', 'Código da loja'], ['storeName', 'Nome da loja'], ['contactName', 'Nome do contato'], ['contactPhone', 'Telefone de contato'],
  ['preferredServiceTime', 'Melhor horário para atendimento'], ['problemCategory', 'Categoria do problema'], ['equipmentModel', 'Equipamento / marca / modelo'],
  ['pdvNumber', 'Número do PDV'], ['problemType', 'Tipo de problema'], ['allegedDefect', 'Defeito alegado'], ['visitCost1', 'Custo visita 1'],
  ['equipmentTotal', 'Valor total de equipamentos'], ['kmTotal', 'Valor total do KM'], ['visitCost2', 'Custo visita 2'], ['ticketTotal', 'Total do ticket'],
  ['visitNumber', 'Número de visita'], ['additionalCosts', 'Custos adicionais'],
];
const workflowStatuses = [
  ['scheduling', 'Pendente de agendamento'], ['scheduled', 'Agendado'], ['operational_preparation', 'Direcionado'], ['in_service', 'Técnico em campo'],
  ['technical_pending', 'Pendência técnica'], ['awaiting_spare', 'Aguardando spare'], ['validated', 'Validado'], ['resolved', 'Resolvido'], ['cancelled', 'Cancelado'],
] as const;

export function JiraTicketDetails({ details, user, onUpdated }: { details: Details; user: User; onUpdated: (details: Details) => void }) {
  const initial = useMemo(() => ({ ...details.operationalFields, ...parseDefect(details.operationalFields.defectSummary) }), [details]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const currentStatus = statusKey(details.status);
  const dirty = Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== String(initial[key as keyof typeof initial] ?? '')));
  const dirtyCount = Object.keys(dirty).length;

  useEffect(() => setForm(Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, value ?? '']))), [initial]);

  async function updateJira(patch: Record<string, string>, key: string) {
    if (!user || savingKey) return;
    setSavingKey(key); setMessage('Salvando no Jira...'); setFailed(false);
    try {
      const response = await fetch(`/api/jira/issues/${details.key}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const payload = await response.json() as Details & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar o Jira.');
      onUpdated(payload); setMessage('Atualizado no Jira.');
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o Jira.'); }
    finally { setSavingKey(null); }
  }

  function input(key: string, label: string) {
    return <label key={key} className="text-xs font-semibold text-muted-foreground">{label}<Input value={form[key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} disabled={Boolean(savingKey)} className="mt-1.5 min-h-11 text-foreground" /></label>;
  }

  return <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
    <div className="sticky top-0 z-10 -mx-2 rounded-xl border border-primary/25 bg-background/95 p-3 shadow-lg backdrop-blur-xl">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">Etapa do chamado no Jira
          <select value={currentStatus} onChange={(event) => void updateJira({ status: event.target.value }, 'status')} disabled={Boolean(savingKey)} className="field mt-1.5 min-h-11 w-full text-foreground">
            {!currentStatus && <option value="">{details.status}</option>}
            {workflowStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <Button type="button" className="min-h-11 sm:min-w-44" onClick={() => void updateJira({ status: 'in_service' }, 'status')} disabled={Boolean(savingKey) || currentStatus === 'in_service'}>
          {savingKey === 'status' ? <Loader2 className="animate-spin" /> : currentStatus === 'in_service' ? <Check /> : <RefreshCw />} {currentStatus === 'in_service' ? 'Técnico em campo' : 'Marcar técnico em campo'}
        </Button>
        <Button type="button" variant="secondary" className="min-h-11 sm:min-w-44" onClick={() => void updateJira(dirty, 'all')} disabled={Boolean(savingKey) || !dirtyCount}>
          {savingKey === 'all' ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações no Jira
        </Button>
      </div>
      <p className={`mt-2 text-xs ${failed ? 'text-red-300' : dirtyCount ? 'text-amber-200' : 'text-muted-foreground'}`} role={failed ? 'alert' : 'status'}>{message || (dirtyCount ? `${dirtyCount} alteração(ões) aguardando salvamento.` : 'A etapa é imediata; os demais campos são enviados pelo botão Salvar alterações no Jira.')}</p>
    </div>
    <div><h3 className="flex items-center gap-2 text-sm font-bold"><Building2 className="size-4 text-primary" />Dados do chamado</h3><p className="mt-1 text-xs text-muted-foreground">Edite diretamente e use “Salvar alterações no Jira”.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => input(key, label))}</div>
    <div className="border-t border-border pt-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Wrench className="size-4 text-amber-300" />Resumo técnico no Jira</h3><div className="grid gap-3">{([['identifiedProblem','Problema identificado'],['testsPerformed','Testes feitos'],['partToReplace','Peça a ser trocada']] as const).map(([key,label]) => <label key={key} className="text-xs font-semibold text-muted-foreground">{label}<textarea rows={3} value={form[key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} disabled={Boolean(savingKey)} className="field mt-1.5 min-h-24 text-foreground" /></label>)}</div></div>
    <Button type="button" className="min-h-11 w-full" onClick={() => void updateJira(dirty, 'all')} disabled={Boolean(savingKey) || !dirtyCount}>{savingKey === 'all' ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações no Jira</Button>
    {details.description && <div className="border-t border-border pt-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Descrição original</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{details.description}</p></div>}
  </section>;
}

function statusKey(value: string) {
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized.includes('tec-campo') || normalized.includes('tecnico em campo') || normalized.includes('em atendimento')) return 'in_service';
  if (normalized === 'agendado') return 'scheduled'; if (normalized.includes('agendamento')) return 'scheduling'; if (normalized.includes('direcion')) return 'operational_preparation';
  if (normalized.includes('pendencia')) return 'technical_pending'; if (normalized.includes('spare')) return 'awaiting_spare'; if (normalized.includes('valid')) return 'validated';
  if (normalized.includes('resol') || normalized.includes('conclu') || normalized.includes('finaliz')) return 'resolved'; if (normalized.includes('cancel')) return 'cancelled'; return '';
}

function parseDefect(value?: string | null) {
  const text = value ?? '';
  const take = (start: string, end?: string) => text.match(new RegExp(`${start}:?\\s*([\\s\\S]*?)${end ? `(?=${end}:?)` : '$'}`, 'i'))?.[1]?.trim() ?? '';
  return { identifiedProblem: take('PROBLEMA IDENTIFICADO', 'TESTES FEITOS'), testsPerformed: take('TESTES FEITOS', 'PEÇA A SER TROCADA'), partToReplace: take('PEÇA A SER TROCADA') };
}
