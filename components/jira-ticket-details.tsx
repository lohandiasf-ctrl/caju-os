'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Pencil, Save, Wrench, X } from 'lucide-react';
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

export function JiraTicketDetails({ details, user, onUpdated }: { details: Details; user: User; onUpdated: (details: Details) => void }) {
  const initial = useMemo(() => ({ ...details.operationalFields, ...parseDefect(details.operationalFields.defectSummary) }), [details]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => setForm(Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, value ?? '']))), [initial]);
  async function save() {
    if (!user) return; setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/jira/issues/${details.key}`, { method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json() as Details & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar o Jira.');
      onUpdated(payload); setEditing(false); setMessage('Informações salvas no Jira.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o Jira.'); }
    finally { setSaving(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-bold"><Building2 className="size-4 text-primary" />Dados do chamado</h3><p className="mt-1 text-xs text-muted-foreground">Código e nome da loja são exibidos separadamente.</p></div><Button type="button" size="sm" variant={editing ? 'ghost' : 'outline'} onClick={() => setEditing((value) => !value)}>{editing ? <X /> : <Pencil />}{editing ? 'Cancelar' : 'Editar no Jira'}</Button></div>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => editing ? <label key={key} className="text-xs font-semibold text-muted-foreground">{label}<Input value={form[key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1.5 text-foreground" /></label> : <Info key={key} label={label} value={details.operationalFields[key]} />)}</div>
    <div className="border-t border-border pt-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Wrench className="size-4 text-amber-300" />Resumo técnico</h3><div className="grid gap-3">{([['identifiedProblem','Problema identificado'],['testsPerformed','Testes feitos'],['partToReplace','Peça a ser trocada']] as const).map(([key,label]) => editing ? <label key={key} className="text-xs font-semibold text-muted-foreground">{label}<textarea rows={3} value={form[key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="field mt-1.5 min-h-20 text-foreground" /></label> : <Info key={key} label={label} value={form[key]} />)}</div></div>
    {details.description && <div className="border-t border-border pt-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Descrição original</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{details.description}</p></div>}
    {editing && <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Salvar direto no Jira</Button>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}
function Info({ label, value }: { label: string; value?: string | null }) { return <div className="min-w-0 rounded-xl border border-border/70 bg-background/55 px-3 py-2.5"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-1 overflow-wrap-anywhere text-sm font-medium">{value || 'Não informado'}</p></div>; }
function parseDefect(value?: string | null) {
  const text = value ?? '';
  const take = (start: string, end?: string) => text.match(new RegExp(`${start}:?\\s*([\\s\\S]*?)${end ? `(?=${end}:?)` : '$'}`, 'i'))?.[1]?.trim() ?? '';
  return { identifiedProblem: take('PROBLEMA IDENTIFICADO', 'TESTES FEITOS'), testsPerformed: take('TESTES FEITOS', 'PEÇA A SER TROCADA'), partToReplace: take('PEÇA A SER TROCADA') };
}
