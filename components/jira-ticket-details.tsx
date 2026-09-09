'use client';

import { type ClipboardEvent as ReactClipboardEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, CircleDollarSign, Download, Eye, FileText, Image, Loader2, Paperclip, RefreshCw, Save, Search, Upload, Video, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { validateEvidenceFiles } from '@/lib/image-validation';

export type JiraOperationalFields = {
  storeCode: string | null; storeName: string | null; contactName: string | null; contactPhone: string | null; preferredServiceTime: string | null;
  problemCategory: string | null; equipmentModel: string | null; pdvNumber: string | null; problemType: string | null; allegedDefect: string | null;
  visitCost1: string | null; equipmentTotal: string | null; kmTotal: string | null; visitCost2: string | null; ticketTotal: string | null; visitNumber: string | null;
  additionalCosts: string | null; defectSummary: string | null; technicianData: string | null; scheduledDateTime: string | null;
};

type JiraAttachment = { id: string; filename: string; mimeType: string; size: number; createdAt: string; author: string | null };
type Technician = { id: number; technicianCode: string | null; name: string; cpf: string | null; phone: string | null; city: string; state: string };
type Details = { key: string; status: string; priority: string; assignee: string | null; reporter: string | null; issueType: string; createdAt: string; description: string; operationalFields: JiraOperationalFields; attachments: JiraAttachment[]; internalComments?: Array<{ id: string; body: string; author: string | null; createdAt: string }> };
type User = { getIdToken: () => Promise<string> } | null;
const generalFields: Array<[keyof JiraOperationalFields, string]> = [
  ['scheduledDateTime', 'Data e hora do agendamento'],
  ['storeCode', 'Código da loja'], ['storeName', 'Nome da loja'], ['contactName', 'Nome do contato'], ['contactPhone', 'Telefone de contato'],
  ['preferredServiceTime', 'Melhor horário para atendimento'], ['problemCategory', 'Categoria do problema'], ['equipmentModel', 'Equipamento / marca / modelo'],
  ['pdvNumber', 'Número do PDV'], ['problemType', 'Tipo de problema'], ['allegedDefect', 'Defeito alegado'],
];
const valueFields: Array<[keyof JiraOperationalFields, string]> = [
  ['visitCost1', 'Custo visita 1'], ['equipmentTotal', 'Valor total de equipamentos'], ['kmTotal', 'Valor total do KM'],
  ['visitCost2', 'Custo visita 2'], ['visitNumber', 'Número de visita'], ['additionalCosts', 'Detalhes de custos adicionais'],
];
const workflowStatuses = [
  ['scheduling', 'Pendente de agendamento'], ['scheduled', 'Agendado'], ['operational_preparation', 'Direcionado'], ['in_service', 'Técnico em campo'],
  ['technical_pending', 'Pendência técnica'], ['awaiting_spare', 'Aguardando spare'], ['validated', 'Validado'], ['resolved', 'Resolvido'], ['cancelled', 'Cancelado'],
] as const;
const evidenceAccept = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar';

export function JiraTicketDetails({ details, user, onUpdated }: { details: Details; user: User; onUpdated: (details: Details) => void }) {
  const initial = useMemo(() => ({ ...details.operationalFields, ...parseDefect(details.operationalFields.defectSummary) }), [details]);
  const initialForm = useMemo(() => Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, key === 'scheduledDateTime' ? dateTimeLocal(value) : value ?? ''])), [initial]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [ratReading, setRatReading] = useState(false);
  const [ratInfo, setRatInfo] = useState('');
  const [ratNeedsLicence, setRatNeedsLicence] = useState(false);
  const [parts, setParts] = useState<Array<{ id: number; name: string; salePriceCents: number }>>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const evidenceFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ attachment: JiraAttachment; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [technicianQuery, setTechnicianQuery] = useState('');
  const [technicianSearchOpen, setTechnicianSearchOpen] = useState(false);
  const [techniciansLoading, setTechniciansLoading] = useState(false);
  const currentStatus = statusKey(details.status);
  const [statusDraft, setStatusDraft] = useState(currentStatus);
  const dirty = Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== String(initialForm[key] ?? '')));
  const dirtyCount = Object.keys(dirty).length;
  const nextStatus = currentStatus === 'scheduling' ? 'scheduled' : 'in_service';
  const nextStatusLabel = currentStatus === 'scheduling' ? 'Agendar chamado' : 'Marcar técnico em campo';
  const calculatedTotal = useMemo(() => ['visitCost1', 'equipmentTotal', 'kmTotal', 'visitCost2'].reduce((total, key) => total + jiraNumber(form[key]), 0), [form.visitCost1, form.equipmentTotal, form.kmTotal, form.visitCost2]);
  const technicianMatches = useMemo(() => {
    const query = technicianQuery.trim().toLocaleLowerCase('pt-BR');
    if (!query) return [];
    const unique = Array.from(new Map(technicians.map((technician) => [`${technician.name.toLocaleLowerCase('pt-BR')}|${technician.cpf ?? ''}|${technician.phone ?? ''}`, technician])).values());
    return unique.filter((technician) => `${technician.name} ${technician.technicianCode ?? ''} ${technician.cpf ?? ''} ${technician.phone ?? ''} ${technician.city} ${technician.state}`.toLocaleLowerCase('pt-BR').includes(query)).slice(0, 8);
  }, [technicianQuery, technicians]);

  useEffect(() => setForm(initialForm), [initialForm]);
  useEffect(() => setStatusDraft(currentStatus), [currentStatus]);
  useEffect(() => {
    if (!user) return;
    let active = true; setTechniciansLoading(true);
    void user.getIdToken()
      .then((token) => fetch('/api/parts', { headers: { Authorization: `Bearer ${token}` } }))
      .then((response) => (response.ok ? response.json() : { parts: [] }))
      .then((payload) => setParts((payload as { parts?: Array<{ id: number; name: string; salePriceCents: number }> }).parts ?? []))
      .catch(() => undefined);
    void user.getIdToken().then((token) => fetch('/api/technicians', { headers: { Authorization: `Bearer ${token}` } })).then(async (response) => {
      if (!response.ok) throw new Error();
      const payload = await response.json() as { technicians?: Technician[] };
      if (active) setTechnicians(payload.technicians ?? []);
    }).catch(() => { if (active) setTechnicians([]); }).finally(() => { if (active) setTechniciansLoading(false); });
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    const hasEnteredCost = ['visitCost1', 'equipmentTotal', 'kmTotal', 'visitCost2'].some((key) => String(form[key] ?? '').trim() !== '');
    const value = hasEnteredCost ? String(Number(calculatedTotal.toFixed(2))) : '';
    setForm((current) => current.ticketTotal === value ? current : { ...current, ticketTotal: value });
  }, [calculatedTotal, form.equipmentTotal, form.kmTotal, form.visitCost1, form.visitCost2]);
  useEffect(() => {
    if (!preview) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); URL.revokeObjectURL(preview.url); };
  }, [preview]);

  useEffect(() => {
    // Clipboard paste events target the currently focused control. The upload
    // button is not always focused (for example after copying a screenshot),
    // so listen at the window level while this ticket detail is open.
    const handlePaste = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const clipboardEvent = event as Event & { clipboardData?: DataTransfer };
      const files = clipboardFiles(clipboardEvent.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      queueEvidenceFiles(files, 'colados');
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [details.key]);

  async function updateJira(patch: Record<string, string>, key: string) {
    if (!user || savingKey) return;
    const normalizedPatch = { ...patch };
    if (normalizedPatch.scheduledDateTime) normalizedPatch.scheduledDateTime = new Date(normalizedPatch.scheduledDateTime).toISOString();
    setSavingKey(key); setMessage('Salvando no Jira...'); setFailed(false);
    try {
      const response = await fetch(`/api/jira/issues/${details.key}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(normalizedPatch),
      });
      const payload = await response.json() as Details & { error?: string; queued?: boolean };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar o Jira.');
      if (payload.queued) { setMessage(payload.error || 'Alteração guardada para sincronização.'); return; }
      onUpdated(payload); setMessage('Atualizado no Jira.');
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o Jira.'); }
    finally { setSavingKey(null); }
  }

  function validateScheduling() {
    if (!String(form.technicianData ?? '').trim() || !String(form.scheduledDateTime ?? '').trim()) {
      setFailed(true); setMessage('Preencha “Dados dos técnicos” e “Data e hora do agendamento” antes de agendar.');
      return false;
    }
    return true;
  }

  function selectTechnician(technician: Technician) {
    setTechnicianQuery(technician.name);
    setTechnicianSearchOpen(false);
    setForm((current) => ({ ...current, technicianData: `Nome: ${technician.name}\nCPF: ${technician.cpf || 'Não informado'}\nRG: Não informado\nTEL: ${technician.phone || 'Não informado'}` }));
  }

  function applyStatus(target: string) {
    if (!target || target === currentStatus) { setFailed(false); setMessage('Escolha uma nova etapa antes de aplicar.'); return; }
    if (currentStatus === 'scheduling' && target === 'in_service') { setFailed(true); setMessage('O Jira exige concluir “Agendado” antes de avançar para “Técnico em campo”.'); return; }
    if (currentStatus === 'in_service' && target === 'scheduled') { setFailed(true); setMessage('O chamado já está em campo. Use uma etapa posterior do fluxo.'); return; }
    if (target === 'scheduled' && !validateScheduling()) return;
    void updateJira({ ...(target === 'scheduled' ? { technicianData: form.technicianData, scheduledDateTime: form.scheduledDateTime } : {}), status: target }, 'status');
  }

  function advanceStatus() {
    if (nextStatus === 'scheduled' && !validateScheduling()) return;
    void updateJira({ ...(nextStatus === 'scheduled' ? { technicianData: form.technicianData, scheduledDateTime: form.scheduledDateTime } : {}), status: nextStatus }, 'status');
  }

  function input([key, label]: [keyof JiraOperationalFields, string], numeric = false) {
    return <label key={key} className="text-xs font-semibold text-muted-foreground">{label}<Input type={key === 'scheduledDateTime' ? 'datetime-local' : numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={numeric ? '0.01' : undefined} value={form[key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} disabled={Boolean(savingKey)} className="mt-1.5 min-h-11 text-foreground" /></label>;
  }

  function queueEvidenceFiles(files: File[], source: 'selecionados' | 'arrastados' | 'colados') {
    const normalized = files.map(normalizeEvidenceFile);
    const accepted = normalized.filter(isEvidenceFile);
    const ignored = files.length - accepted.length;
    if (!accepted.length) {
      setFailed(true);
      setMessage(ignored ? 'Nenhum arquivo compatível foi encontrado. Envie imagens, vídeos, PDF, documentos, planilhas, CSV, TXT ou pacotes ZIP/RAR.' : 'Nenhum arquivo recebido.');
      return;
    }
    setFileWarnings([]);
    setFailed(false);
    setSelectedFiles((current) => mergeEvidenceFiles(current, accepted));
    const hasArchive = accepted.some((file) => /\.(zip|rar)$/i.test(file.name));
    setMessage(`${accepted.length} arquivo(s) ${source} pronto(s) para enviar ao Jira.${hasArchive ? ' Pacote(s) ZIP/RAR serão anexados completos.' : ''}${ignored ? ` ${ignored} arquivo(s) ignorado(s) por formato incompatível.` : ''}`);
  }

  function handleEvidenceDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    queueEvidenceFiles(Array.from(event.dataTransfer.files ?? []), 'arrastados');
  }

  function handleEvidencePaste(event: ReactClipboardEvent<HTMLButtonElement>) {
    const files = clipboardFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    queueEvidenceFiles(files, 'colados');
  }

  async function uploadFiles() {
    if (!user || !selectedFiles.length) return;
    setUploading(true); setMessage(`Enviando ${selectedFiles.length} arquivo(s) ao Jira...`); setFailed(false);
    try {
      const warnings = await validateEvidenceFiles(selectedFiles);
      if (warnings.length) {
        setFileWarnings(warnings);
        throw new Error('Revise as evidências: há foto escura, ilegível ou pequena demais.');
      }
      const body = new FormData(); selectedFiles.forEach((file) => body.append('files', file));
      const response = await fetch(`/api/jira/issues/${details.key}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` }, body });
      const payload = await response.json() as Details & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar os anexos.');
      onUpdated(payload); setSelectedFiles([]); setFileWarnings([]); setMessage('Evidências anexadas ao Jira.');
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Não foi possível enviar os anexos.'); }
    finally { setUploading(false); }
  }

  async function fetchAttachment(attachment: JiraAttachment, download = false) {
    if (!user) return;
    try {
      const response = await fetch(`/api/jira/issues/${details.key}/attachments/${attachment.id}${download ? '?download=1' : ''}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; throw new Error(payload?.error || 'Não foi possível abrir o anexo.'); }
      const url = URL.createObjectURL(await response.blob());
      if (download) { const link = document.createElement('a'); link.href = url; link.download = attachment.filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      else setPreview({ attachment, url });
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Não foi possível abrir o anexo.'); }
  }

  async function showPreview(attachment: JiraAttachment) {
    setPreviewLoading(true); setFailed(false);
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    await fetchAttachment(attachment);
    setPreviewLoading(false);
  }

  const saveButton = <Button type="button" className="min-h-11 w-full" onClick={() => void updateJira(dirty, 'all')} disabled={Boolean(savingKey) || !dirtyCount}>{savingKey === 'all' ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações no Jira</Button>;

  // Explicit action rather than firing on every attachment: it costs a Workers
  // AI call, and in this screen all files are uploaded together with no way to
  // tell which one is the RAT.
  async function readRat(file?: File) {
    if (!file || !user) return;
    setRatReading(true);
    setRatInfo('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/rat/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        body,
      });
      const payload = await response.json() as {
        identifiedProblem?: string; testsPerformed?: string; partToReplace?: string;
        confidence?: string; info?: string; error?: string;
      };
      if (!response.ok) { setRatInfo(payload.error ?? 'Não foi possível ler a RAT.'); return; }
      // Never overwrite what the technician already typed.
      const merged: Record<string, string> = {};
      for (const key of ['identifiedProblem', 'testsPerformed', 'partToReplace'] as const) {
        const extracted = (payload[key] ?? '').trim();
        if (extracted && !(form[key] ?? '').trim()) merged[key] = extracted;
      }
      setForm((current) => ({ ...current, ...merged }));
      const filled = Object.keys(merged).length;
      // Workers AI gates this model behind Meta's licence until the account
      // submits it once; surface that as an action instead of a dead end.
      if ((payload.info ?? '').includes('5016')) setRatNeedsLicence(true);
      setRatInfo(payload.info ?? (filled
        ? `${filled} campo(s) preenchido(s) · confiança ${payload.confidence ?? 'baixa'}. Confira antes de salvar.`
        : 'Nada novo foi extraído — os campos já preenchidos foram mantidos.'));
    } catch {
      setRatInfo('Falha ao ler a RAT. Preencha manualmente.');
    } finally {
      setRatReading(false);
    }
  }

  async function acceptModelLicence() {
    if (!user) return;
    setRatReading(true);
    try {
      const response = await fetch('/api/rat/agree', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = await response.json() as { aceito?: boolean; error?: string };
      if (payload.aceito) {
        setRatNeedsLicence(false);
        setRatInfo('Licença aceita. Clique em "Ler RAT e preencher" novamente.');
      } else {
        setRatInfo(payload.error ?? 'Não foi possível registrar o aceite.');
      }
    } catch {
      setRatInfo('Falha ao registrar o aceite da licença.');
    } finally {
      setRatReading(false);
    }
  }

  return <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
    <div className="rounded-xl border border-primary/25 bg-background/80 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Fluxo do chamado</p><p className="text-xs text-muted-foreground">Etapa atual: {details.status}</p></div><span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{currentStatus === 'scheduling' ? '1. Agendar' : currentStatus === 'scheduled' ? '2. Preparar' : currentStatus === 'in_service' ? '3. Atender' : 'Acompanhamento'}</span></div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">Próxima etapa no Jira
          <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} disabled={Boolean(savingKey)} className="field mt-1.5 min-h-11 w-full text-foreground">
            {!currentStatus && <option value="">{details.status}</option>}
            {workflowStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" className="min-h-11 sm:min-w-36" onClick={() => applyStatus(statusDraft)} disabled={Boolean(savingKey) || !statusDraft || statusDraft === currentStatus}>
          {savingKey === 'status' ? <Loader2 className="animate-spin" /> : <Check />} Aplicar etapa
        </Button>
        <Button type="button" className="min-h-11 sm:min-w-44" onClick={advanceStatus} disabled={Boolean(savingKey) || currentStatus === 'in_service'}>
          {savingKey === 'status' ? <Loader2 className="animate-spin" /> : currentStatus === 'in_service' ? <Check /> : <RefreshCw />} {currentStatus === 'in_service' ? 'Técnico em campo' : nextStatusLabel}
        </Button>
      </div>
      <p className={`mt-2 text-xs ${failed ? 'text-red-300' : dirtyCount ? 'text-amber-200' : 'text-muted-foreground'}`} role={failed ? 'alert' : 'status'}>{message || (dirtyCount ? `${dirtyCount} alteração(ões) aguardando salvamento.` : 'A etapa segue o fluxo do Jira; os demais campos são enviados pelo botão Salvar.')}</p>
    </div>

    <Tabs defaultValue="dados">
      <TabsList className="grid h-auto w-full grid-cols-3 bg-background/70 p-1">
        <TabsTrigger value="dados" className="min-h-10"><Building2 /> Dados</TabsTrigger>
        <TabsTrigger value="valores" className="min-h-10"><CircleDollarSign /> Valores</TabsTrigger>
        <TabsTrigger value="anexos" className="min-h-10"><Paperclip /> Anexos <span className="rounded bg-primary/10 px-1.5 text-xs text-primary">{details.attachments?.length ?? 0}</span></TabsTrigger>
      </TabsList>
      <TabsContent value="dados" className="space-y-4 pt-3">
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Building2 className="size-4 text-primary" />Dados obrigatórios do agendamento</h3><p className="mt-1 text-xs text-muted-foreground">A busca usa os técnicos cadastrados no banco de dados. Confirme os dados antes de avançar.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="relative"><label className="text-xs font-semibold text-muted-foreground">Pesquisar técnico</label><div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={technicianQuery} onFocus={() => setTechnicianSearchOpen(true)} onChange={(event) => { setTechnicianQuery(event.target.value); setTechnicianSearchOpen(true); }} onKeyDown={(event) => { if (event.key === 'Escape') setTechnicianSearchOpen(false); }} placeholder={techniciansLoading ? 'Carregando técnicos...' : 'Digite nome, cidade, CPF ou código'} className="min-h-11 pl-9" autoComplete="off" /></div>{technicianSearchOpen && technicianMatches.length > 0 && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl">{technicianMatches.map((technician) => <button key={technician.id} type="button" onClick={() => selectTechnician(technician)} className="block min-h-11 w-full rounded-lg px-3 py-2 text-left hover:bg-primary/10 focus-visible:bg-primary/10"><span className="block text-sm font-semibold">{technician.name}</span><span className="block text-xs text-muted-foreground">{technician.city}/{technician.state}{technician.technicianCode ? ` · ${technician.technicianCode}` : ''}{technician.phone ? ` · ${technician.phone}` : ''}</span></button>)}</div>}</div>{generalFields.slice(0, 1).map((field) => input(field))}<label className="text-xs font-semibold text-muted-foreground sm:col-span-2">Dados enviados ao Jira · Nome, CPF, RG e telefone<textarea rows={4} value={form.technicianData ?? ''} onChange={(event) => setForm((current) => ({ ...current, technicianData: event.target.value }))} disabled={Boolean(savingKey)} className="field mt-1.5 min-h-24 text-foreground" /><span className="mt-1 block text-[11px] font-normal text-muted-foreground">Você pode complementar o RG manualmente antes de agendar.</span></label></div></div>
        <details className="group rounded-xl border border-border bg-background/35 p-3"><summary className="cursor-pointer list-none text-sm font-bold">Informações da loja e do problema <span className="ml-1 text-xs font-normal text-muted-foreground group-open:hidden">· clique para expandir</span></summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{generalFields.slice(1).map((field) => input(field))}</div>{details.description && <div className="mt-4 border-t border-border pt-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Descrição original</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{details.description}</p></div>}</details>
        <details className="group rounded-xl border border-border bg-background/35 p-3"><summary className="cursor-pointer list-none text-sm font-bold">Comentários internos do Jira <span className="ml-1 text-xs font-normal text-muted-foreground">· {details.internalComments?.length ?? 0}</span></summary><div className="mt-3 space-y-2">{details.internalComments?.map((comment) => <article key={comment.id} className="rounded-lg border border-border bg-black/10 p-3"><p className="whitespace-pre-wrap text-sm">{comment.body}</p><footer className="mt-2 text-xs text-muted-foreground">{comment.author || 'Jira'} · {comment.createdAt ? new Date(comment.createdAt).toLocaleString('pt-BR') : ''}</footer></article>)}{!details.internalComments?.length && <p className="text-xs text-muted-foreground">Nenhum comentário interno disponível.</p>}</div></details>
        <div className="border-t border-border pt-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold"><Wrench className="size-4 text-amber-300" />Resumo técnico no Jira</h3><label className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-primary/30 bg-background/70 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 ${ratReading ? 'pointer-events-none opacity-60' : ''}`}>{ratReading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{ratReading ? 'Lendo RAT...' : 'Ler RAT e preencher'}<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={ratReading} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void readRat(file); }} /></label></div>{ratInfo && <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"><p>{ratNeedsLicence ? 'Este modelo de IA exige aceitar uma vez a Llama 3.2 Community License da Meta antes do primeiro uso.' : ratInfo}</p>{ratNeedsLicence && <div className="mt-2 flex flex-wrap items-center gap-2"><a href="https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE" target="_blank" rel="noreferrer" className="underline">Ler a licença</a><Button type="button" size="sm" className="min-h-8" disabled={ratReading} onClick={() => void acceptModelLicence()}>{ratReading ? <Loader2 className="animate-spin" /> : null} Aceitar e habilitar</Button></div>}</div>}<div className="grid gap-3">{([['identifiedProblem','Problema identificado'],['testsPerformed','Testes feitos'],['partToReplace','Peça a ser trocada']] as const).map(([key,label]) => <label key={key} className="text-xs font-semibold text-muted-foreground">{label}{key === 'partToReplace' && parts.length > 0 && <select className="field mt-1.5 text-xs" value="" aria-label="Adicionar peça do catálogo" disabled={Boolean(savingKey)} onChange={(event) => { const chosen = parts.find((part) => String(part.id) === event.target.value); if (!chosen) return; setForm((current) => { const atual = (current.partToReplace ?? '').trim(); const totalAtual = jiraNumber(current.equipmentTotal); return { ...current, partToReplace: atual ? `${atual}
${chosen.name}` : chosen.name, equipmentTotal: String(Number((totalAtual + chosen.salePriceCents / 100).toFixed(2))).replace('.', ',') }; }); }}><option value="">Adicionar peça do catálogo (soma no valor de equipamentos)...</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.name} · {formatCurrency(part.salePriceCents / 100)}</option>)}</select>}<textarea rows={3} value={form[key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} disabled={Boolean(savingKey)} className="field mt-1.5 min-h-24 text-foreground" /></label>)}</div></div>
        {saveButton}
      </TabsContent>
      <TabsContent value="valores" className="space-y-4 pt-3">
        <div><h3 className="flex items-center gap-2 text-sm font-bold"><CircleDollarSign className="size-4 text-emerald-300" />Valores e custos no Jira</h3><p className="mt-1 text-xs text-muted-foreground">Preencha os valores e salve para atualizar o chamado imediatamente.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">{valueFields.map((field) => input(field, field[0] !== 'additionalCosts'))}</div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Total do ticket</p><p className="mt-1 text-xs text-muted-foreground">Soma automática das visitas, equipamentos e KM.</p></div><output className="text-2xl font-bold tabular-nums text-emerald-300">{formatCurrency(calculatedTotal)}</output></div>
        {saveButton}
      </TabsContent>
      <TabsContent value="anexos" className="space-y-4 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-bold"><Paperclip className="size-4 text-primary" />Anexos e evidências</h3><p className="mt-1 text-xs text-muted-foreground">RAT, fotos, vídeos e documentos armazenados no chamado do Jira.</p></div><span className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">{details.attachments?.length ?? 0} arquivo(s)</span></div>
        <div className="grid gap-3 sm:grid-cols-2">{details.attachments?.map((attachment) => <article key={attachment.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-background/55"><AttachmentThumbnail issueKey={details.key} attachment={attachment} user={user} onOpen={() => void showPreview(attachment)} /><div className="p-3"><p className="break-words text-sm font-semibold">{attachment.filename}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(attachment.size)}{attachment.author ? ` · ${attachment.author}` : ''}{attachment.createdAt ? ` · ${formatAttachmentDate(attachment.createdAt)}` : ''}</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void showPreview(attachment)} disabled={previewLoading}><Eye /> Visualizar</Button><Button type="button" size="sm" variant="ghost" onClick={() => void fetchAttachment(attachment, true)} aria-label={`Baixar ${attachment.filename}`}><Download /> Baixar</Button></div></div></article>)}{!details.attachments?.length && <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2">Nenhum anexo encontrado neste chamado.</div>}</div>
        <div className={`rounded-xl border border-dashed p-4 transition ${dragActive ? 'border-primary bg-primary/15 shadow-[0_0_0_1px_rgba(70,120,255,0.35)]' : 'border-primary/35 bg-primary/5'}`}><button type="button" onClick={() => evidenceFileInputRef.current?.click()} onPaste={handleEvidencePaste} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={handleEvidenceDrop} aria-label="Selecionar ou colar evidências" className={`flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border px-4 py-5 text-center text-sm font-semibold text-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${dragActive ? 'border-primary bg-primary/15' : 'border-primary/30 bg-background/70 hover:bg-primary/10'}`}><span className="inline-flex items-center gap-2"><Upload className="size-4" />Selecionar novas evidências</span><span className="text-xs font-medium text-muted-foreground">Clique, arraste arquivos para cá ou cole com Ctrl+V.</span></button><input ref={evidenceFileInputRef} type="file" multiple className="sr-only" accept={evidenceAccept} aria-label="Selecionar evidências para anexar ao Jira" onChange={(event) => { queueEvidenceFiles(Array.from(event.target.files ?? []), 'selecionados'); event.currentTarget.value = ''; }} />{selectedFiles.length > 0 && <div className="mt-3 space-y-2">{fileWarnings.length > 0 && <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100"><b>Validação das fotos:</b><ul className="mt-1 list-disc space-y-1 pl-5">{fileWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}{selectedFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-xs"><Paperclip className="size-3.5 text-primary" /><span className="min-w-0 flex-1 break-words">{file.name} · {formatBytes(file.size)}</span><button type="button" className="grid size-8 place-items-center rounded-md hover:bg-muted" aria-label={`Remover ${file.name}`} onClick={() => { setFileWarnings([]); setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index)); }}><X className="size-4" /></button></div>)}<Button type="button" className="min-h-11 w-full" onClick={() => void uploadFiles()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Upload />} {uploading ? 'Enviando ao Jira...' : `Validar e enviar ${selectedFiles.length} arquivo(s) ao Jira`}</Button></div>}</div>
      </TabsContent>
    </Tabs>
    {preview && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Visualização de ${preview.attachment.filename}`} onMouseDown={(event) => { if (event.currentTarget === event.target) setPreview(null); }}><div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"><header className="flex items-center gap-3 border-b border-border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{preview.attachment.filename}</p><p className="text-xs text-muted-foreground">{formatBytes(preview.attachment.size)}</p></div><Button type="button" variant="outline" size="sm" onClick={() => void fetchAttachment(preview.attachment, true)}><Download /> Baixar</Button><Button type="button" variant="ghost" size="icon" onClick={() => setPreview(null)} aria-label="Fechar visualização"><X /></Button></header><div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-black/40 p-3">{preview.attachment.mimeType.startsWith('image/') ? <img src={preview.url} alt={preview.attachment.filename} className="max-h-[76vh] max-w-full object-contain" /> : preview.attachment.mimeType.startsWith('video/') ? <video src={preview.url} controls autoPlay className="max-h-[76vh] max-w-full" /> : preview.attachment.mimeType === 'application/pdf' ? <iframe src={preview.url} title={preview.attachment.filename} className="h-[76vh] w-full rounded-lg bg-white" /> : <div className="max-w-md text-center"><FileText className="mx-auto size-12 text-primary" /><p className="mt-3 text-sm">Este arquivo não possui visualização no navegador.</p><Button type="button" className="mt-4" onClick={() => void fetchAttachment(preview.attachment, true)}><Download /> Baixar arquivo</Button></div>}</div></div></div>}
  </section>;
}

function AttachmentThumbnail({ issueKey, attachment, user, onOpen }: { issueKey: string; attachment: JiraAttachment; user: User; onOpen: () => void }) {
  const [url, setUrl] = useState('');
  const image = attachment.mimeType.startsWith('image/');
  const Icon = image ? Image : attachment.mimeType.startsWith('video/') ? Video : FileText;
  useEffect(() => {
    if (!image || !user) return;
    let active = true; let objectUrl = '';
    void user.getIdToken().then((token) => fetch(`/api/jira/issues/${issueKey}/attachments/${attachment.id}?thumbnail=1`, { headers: { Authorization: `Bearer ${token}` } })).then(async (response) => {
      if (!response.ok) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id, image, issueKey, user]);
  return <button type="button" onClick={onOpen} className="group relative grid aspect-[16/9] w-full place-items-center overflow-hidden bg-muted/35 text-primary" aria-label={`Visualizar ${attachment.filename}`}>{url ? <img src={url} alt="" className="size-full object-cover transition duration-200 group-hover:scale-[1.02]" /> : <Icon className="size-10" />}<span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100"><Eye className="size-7 text-white" /></span></button>;
}

function clipboardFiles(data?: DataTransfer | null) {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (files.length) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function normalizeEvidenceFile(file: File, index: number) {
  if (file.name && !/^image\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)) return file;
  if (!file.type.startsWith('image/')) return file;
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([file], `evidencia-colada-${timestamp}-${index + 1}.${extension}`, { type: file.type || 'image/png', lastModified: Date.now() });
}

function isEvidenceFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type.startsWith('image/')
    || file.type.startsWith('video/')
    || file.type === 'application/pdf'
    || file.type === 'text/plain'
    || file.type === 'text/csv'
    || file.type === 'application/zip'
    || file.type === 'application/x-rar-compressed'
    || [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip', '.rar',
      '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif',
      '.mp4', '.mov', '.avi', '.mkv', '.webm',
    ].some((extension) => name.endsWith(extension));
}

function mergeEvidenceFiles(current: File[], incoming: File[]) {
  const seen = new Set(current.map(evidenceFileKey));
  const merged = [...current];
  for (const file of incoming) {
    const key = evidenceFileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return merged;
}

function evidenceFileKey(file: File) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function statusKey(value: string) { const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); if (normalized.includes('tec-campo') || normalized.includes('tecnico em campo') || normalized.includes('em atendimento')) return 'in_service'; if (normalized === 'agendado') return 'scheduled'; if (normalized.includes('agendamento')) return 'scheduling'; if (normalized.includes('direcion')) return 'operational_preparation'; if (normalized.includes('pendencia')) return 'technical_pending'; if (normalized.includes('spare')) return 'awaiting_spare'; if (normalized.includes('valid')) return 'validated'; if (normalized.includes('resol') || normalized.includes('conclu') || normalized.includes('finaliz')) return 'resolved'; if (normalized.includes('cancel')) return 'cancelled'; return ''; }
function parseDefect(value?: string | null) { const text = value ?? ''; const take = (start: string, end?: string) => text.match(new RegExp(`${start}:?\\s*([\\s\\S]*?)${end ? `(?=${end}:?)` : '$'}`, 'i'))?.[1]?.trim() ?? ''; return { identifiedProblem: take('PROBLEMA IDENTIFICADO', 'TESTES FEITOS'), testsPerformed: take('TESTES FEITOS', 'PEÇA A SER TROCADA'), partToReplace: take('PEÇA A SER TROCADA') }; }
function dateTimeLocal(value?: string | null) { if (!value) return ''; const brazilian = value.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/); const date = brazilian ? new Date(Number(brazilian[3]), Number(brazilian[2]) - 1, Number(brazilian[1]), Number(brazilian[4]), Number(brazilian[5])) : new Date(value); if (Number.isNaN(date.getTime())) return ''; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function formatBytes(value: number) { if (!value) return 'Tamanho não informado'; if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
function formatAttachmentDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date); }
function jiraNumber(value?: string) { if (!value) return 0; const normalized = value.trim().replace(/[^\d,.-]/g, ''); const decimalComma = normalized.lastIndexOf(',') > normalized.lastIndexOf('.'); const parsed = Number(decimalComma ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0; }
function formatCurrency(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
