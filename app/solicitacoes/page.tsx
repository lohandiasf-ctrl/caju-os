'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Menu, MessageCircle, Paperclip, Plus, RefreshCw, Users } from 'lucide-react';
import { AppNavigation } from '@/components/app-navigation';
import { useAuth } from '@/components/auth-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColleaguesPanel } from '@/components/user-menu';
import { missingSteps, STATUS_LABEL, whenText, type Solicitation, type SolicitationStatus } from '@/lib/solicitations';

// Solicitações da gerência para clientes que não estão no Jira: a equipe assume,
// escolhe o técnico da cidade, define o dia, cria o grupo no WhatsApp e devolve o
// resumo ao solicitante pelo WhatsApp. Sem prazo.

type Item = Solicitation & { status: SolicitationStatus };
type Candidate = { id: number; name: string; phone: string | null };
type Detail = { solicitation: Item; events: Array<{ kind: string; actor: string; at: string }>; candidates: Candidate[]; groupCreation?: boolean; files?: Array<{ id: number; name: string; mimeType: string; size: number }> };

const TONE: Record<SolicitationStatus, string> = {
  nova: 'border-primary/30 text-primary', em_andamento: 'border-warning/30 bg-warning-soft text-warning', pronta: 'border-success/30 bg-success-soft text-success',
  devolvida: 'text-muted-foreground', cancelada: 'text-muted-foreground',
};
const EVENT: Record<string, string> = { file: 'Anexo adicionado', created: 'Criada', assumed: 'Assumida', technician: 'Técnico definido', scheduled: 'Dia e hora definidos', group: 'Grupo criado', returned: 'Devolvida ao solicitante', cancelled: 'Cancelada' };
const nameOf = (email: string) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
const when = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
// Foto grande vira JPEG menor antes de subir (o limite é ~1,3 MB); PDF vai como está.
async function toDataUrl(file: File): Promise<{ name: string; mimeType: string; data: string }> {
  if (file.type === 'application/pdf') {
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    return { name: file.name, mimeType: file.type, data };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.72) };
}

const EMPTY = { client: '', city: '', uf: '', store: '', address: '', description: '', requesterPhone: '', priority: 'normal' };

export default function SolicitacoesPage() {
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState('');
  const [when_, setWhen] = useState('');
  const [groupText, setGroupText] = useState('');
  const [uploading, setUploading] = useState(false);

  async function attach(files: FileList | null) {
    if (!files?.length || open === null || uploading) return;
    setUploading(true); setMessage('');
    try {
      for (const file of Array.from(files)) {
        const body = await toDataUrl(file).catch(() => null);
        if (!body) { setMessage(`Não consegui ler ${file.name}.`); continue; }
        const response = await fetch(`/api/solicitations/${open}/files`, { method: 'POST', headers: await headers(), body: JSON.stringify(body) });
        const payload = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) { setMessage(payload.error ?? 'Não foi possível anexar.'); break; }
      }
      await loadDetail(open);
    } finally { setUploading(false); }
  }

  async function openFile(fileId: number) {
    if (open === null) return;
    const response = await fetch(`/api/solicitations/${open}/files/${fileId}`, { headers: { Authorization: `Bearer ${await user?.getIdToken()}` } });
    if (!response.ok) { setMessage('Não foi possível abrir o anexo.'); return; }
    window.open(URL.createObjectURL(await response.blob()), '_blank', 'noopener');
  }
  const [message, setMessage] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const headers = useCallback(async () => ({ Authorization: `Bearer ${await user?.getIdToken()}`, 'Content-Type': 'application/json' }), [user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/solicitations', { headers: await headers(), cache: 'no-store' });
      const payload = await response.json() as { solicitations?: Item[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar as solicitações.');
      setItems(payload.solicitations ?? []); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as solicitações.'); }
  }, [user, headers]);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  const loadDetail = useCallback(async (id: number) => {
    const response = await fetch(`/api/solicitations/${id}`, { headers: await headers(), cache: 'no-store' });
    const payload = await response.json() as Detail & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Não foi possível abrir a solicitação.');
    setDetail(payload);
    setWhen(payload.solicitation.scheduledAt?.slice(0, 16) ?? '');
  }, [headers]);

  async function toggle(id: number) {
    if (open === id) { setOpen(null); setDetail(null); return; }
    setOpen(id); setDetail(null); setMessage('');
    try { await loadDetail(id); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir a solicitação.'); }
  }

  async function create() {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/solicitations', { method: 'POST', headers: await headers(), body: JSON.stringify(form) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(payload.error ?? 'Não foi possível criar a solicitação.'); return; }
      setForm(EMPTY); setCreating(false); await load();
    } finally { setSaving(false); }
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (open === null || busy) return;
    setBusy(action); setMessage('');
    try {
      const response = await fetch(`/api/solicitations/${open}`, { method: 'PATCH', headers: await headers(), body: JSON.stringify({ action, ...extra }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setMessage(payload.error ?? 'Não foi possível concluir.'); return; }
      await Promise.all([load(), loadDetail(open)]);
      if (action === 'return') setMessage('Devolvida ao solicitante pelo WhatsApp.');
    } finally { setBusy(''); }
  }

  const visible = (items ?? []).filter((item) => showClosed || (item.status !== 'devolvida' && item.status !== 'cancelada'));
  const field = (key: keyof typeof EMPTY, label: string, props: { placeholder?: string; wide?: boolean } = {}) => (
    <label className={`text-xs font-semibold text-muted-foreground ${props.wide ? 'sm:col-span-2' : ''}`}>{label}
      <input value={form[key]} onChange={(event) => setForm((cur) => ({ ...cur, [key]: event.target.value }))} placeholder={props.placeholder} className="field mt-1 w-full text-sm font-normal text-foreground" />
    </label>
  );

  return <main className="min-h-screen text-foreground">
    <AppNavigation active="solicitations" open={menu} onOpenChange={setMenu} />
    <ColleaguesPanel />
    <section className="app-content">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu /></Button>
        <a href="/?view=overview" className="hidden items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:flex"><ArrowLeft className="size-4" />Operação</a>
        <div className="ml-auto flex items-center gap-2"><ThemeToggle /></div>
      </header>
      <div id="main-content" tabIndex={-1} className="app-main mx-auto max-w-[1100px] px-4 pt-6 pb-36 sm:px-6 lg:px-8 lg:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-eyebrow">Operação</p>
            <h1 className="page-title">Solicitações</h1>
            <p className="page-subtitle">Pedidos para qualquer cliente, mesmo fora do Jira: a equipe escolhe o técnico da cidade, define o dia, cria o grupo e devolve pelo WhatsApp.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw />Atualizar</Button>
            <Button size="sm" onClick={() => { setCreating((v) => !v); setMessage(''); }}><Plus />Nova solicitação</Button>
          </div>
        </div>

        {creating && (
          <article className="surface-panel mt-6 rounded-2xl p-5">
            <h2 className="text-[15px] font-semibold">Nova solicitação</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {field('client', 'Cliente *', { placeholder: 'Ex.: nome do cliente' })}
              {field('store', 'Loja', { placeholder: 'Ex.: Loja 12' })}
              {field('city', 'Cidade *', { placeholder: 'Ex.: Ipojuca' })}
              {field('uf', 'UF', { placeholder: 'PE' })}
              {field('address', 'Endereço', { wide: true })}
              <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">O que foi pedido *
                <textarea value={form.description} onChange={(event) => setForm((cur) => ({ ...cur, description: event.target.value }))} rows={3} className="field mt-1 w-full text-sm font-normal text-foreground" />
              </label>
              {field('requesterPhone', 'WhatsApp de quem pediu *', { placeholder: '(81) 99999-0000' })}
              <label className="text-xs font-semibold text-muted-foreground">Prioridade
                <select value={form.priority} onChange={(event) => setForm((cur) => ({ ...cur, priority: event.target.value }))} className="field mt-1 w-full text-sm font-normal text-foreground"><option value="normal">Normal</option><option value="alta">Alta</option></select>
              </label>
            </div>
            {message && <p role="alert" className="mt-3 text-sm text-danger">{message}</p>}
            <div className="mt-4 flex gap-2">
              <Button onClick={() => void create()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Criar solicitação</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            </div>
          </article>
        )}

        {error && <div role="alert" className="mt-6 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">{error}</div>}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{showClosed ? 'Todas' : 'Em aberto'}</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowClosed((v) => !v)}>{showClosed ? 'Só as abertas' : 'Mostrar devolvidas e canceladas'}</Button>
        </div>
        {items === null && !error ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</p>
          : !visible.length ? <div className="surface-panel mt-3 rounded-2xl p-6 text-sm text-muted-foreground">Nenhuma solicitação {showClosed ? '' : 'em aberto'}. Use “Nova solicitação” quando chegar um pedido.</div>
          : (
            <ul className="mt-3 grid gap-3">
              {visible.map((item) => {
                const expanded = open === item.id;
                const s = detail?.solicitation.id === item.id ? detail.solicitation : item;
                const closed = s.status === 'devolvida' || s.status === 'cancelada';
                const missing = missingSteps(s);
                return (
                  <li key={item.id} className="surface-panel rounded-2xl p-4">
                    <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left" onClick={() => void toggle(item.id)} aria-expanded={expanded}>
                      <Badge variant="outline" className={TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      {item.priority === 'alta' && <Badge variant="outline" className="border-danger/30 text-danger">Alta</Badge>}
                      <span className="font-semibold">{item.client}{item.store ? ` · ${item.store}` : ''}</span>
                      <span className="text-sm text-muted-foreground">{item.city}{item.uf ? `/${item.uf}` : ''}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{when(item.createdAt)} · {nameOf(item.requesterEmail)}</span>
                    </button>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                    {expanded && (
                      <div className="mt-4 space-y-4 border-t border-border pt-4">
                        {!detail || detail.solicitation.id !== item.id ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Abrindo…</p> : (
                          <>
                            <p className="whitespace-pre-wrap text-sm">{s.description}</p>
                            {s.address && <p className="text-xs text-muted-foreground">Endereço: {s.address}</p>}
                            <p className="text-xs text-muted-foreground">Quem pediu: {nameOf(s.requesterEmail)} · WhatsApp {s.requesterPhone}</p>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-semibold text-muted-foreground">Anexos</p>
                                {!closed && (
                                  <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted">
                                    {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}Anexar foto ou PDF
                                    <input type="file" multiple accept="image/*,application/pdf" className="sr-only" disabled={uploading} onChange={(event) => { void attach(event.target.files); event.currentTarget.value = ''; }} />
                                  </label>
                                )}
                              </div>
                              {detail.files?.length ? (
                                <ul className="mt-2 flex flex-wrap gap-2">
                                  {detail.files.map((f) => <li key={f.id}><button type="button" onClick={() => void openFile(f.id)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">{f.name}</button></li>)}
                                </ul>
                              ) : <p className="mt-1 text-xs text-muted-foreground">Nenhum anexo.</p>}
                            </div>
                            {!closed && (
                              <ol className="grid gap-3">
                                <li className="rounded-xl border border-border p-3">
                                  <p className="text-sm font-semibold">1. Responsável</p>
                                  {s.assigneeEmail ? <p className="mt-1 text-sm text-muted-foreground">{nameOf(s.assigneeEmail)}</p> : <Button className="mt-2" size="sm" onClick={() => void act('assume')} disabled={Boolean(busy)}>{busy === 'assume' ? <Loader2 className="animate-spin" /> : <Users />}Assumir</Button>}
                                </li>
                                <li className="rounded-xl border border-border p-3">
                                  <p className="text-sm font-semibold">2. Técnico da cidade{s.technicianName ? `: ${s.technicianName}` : ''}</p>
                                  {detail.candidates.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {detail.candidates.map((c) => <Button key={c.id} size="sm" variant={s.technicianId === c.id ? 'default' : 'outline'} aria-pressed={s.technicianId === c.id} disabled={Boolean(busy)} onClick={() => void act('set_technician', { technicianId: c.id })}>{c.name}</Button>)}
                                    </div>
                                  ) : <p className="mt-1 text-sm text-warning">Nenhum técnico cadastrado em {s.city}. Cadastre um técnico na cidade ou combine outro caminho com a equipe.</p>}
                                </li>
                                <li className="rounded-xl border border-border p-3">
                                  <p className="text-sm font-semibold">3. Dia e hora{s.scheduledAt ? `: ${whenText(s.scheduledAt)}` : ''}</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <input type="datetime-local" value={when_} onChange={(event) => setWhen(event.target.value)} aria-label="Dia e hora do atendimento" className="field min-h-9 w-auto py-0 text-sm" />
                                    <Button size="sm" variant="outline" disabled={!when_ || Boolean(busy)} onClick={() => void act('schedule', { scheduledAt: when_ })}>{busy === 'schedule' && <Loader2 className="animate-spin" />}Salvar</Button>
                                  </div>
                                </li>
                                <li className="rounded-xl border border-border p-3">
                                  <p className="text-sm font-semibold">4. Grupo no WhatsApp{s.groupName ? `: ${s.groupName}` : ''}</p>
                                  {s.groupJid ? <p className="mt-1 text-sm text-success">Grupo criado pelo sistema.</p> : (
                                    <div className="mt-2 space-y-2">
                                      {detail.groupCreation && (
                                        <Button size="sm" variant="outline" disabled={!s.technicianId || Boolean(busy)} onClick={() => void act('create_group')}>{busy === 'create_group' ? <Loader2 className="animate-spin" /> : <MessageCircle />}Criar grupo automaticamente</Button>
                                      )}
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input value={groupText} onChange={(event) => setGroupText(event.target.value)} placeholder="Nome ou link do grupo criado por fora" aria-label="Nome ou link do grupo" className="field min-h-9 min-w-64 flex-1 py-0 text-sm" />
                                        <Button size="sm" variant="outline" disabled={groupText.trim().length < 3 || Boolean(busy)} onClick={() => void act('set_group', { groupName: groupText })}>{busy === 'set_group' && <Loader2 className="animate-spin" />}Registrar</Button>
                                      </div>
                                      {!detail.groupCreation && <p className="text-xs text-muted-foreground">Crie o grupo no WhatsApp e registre aqui o nome ou o link. A criação automática entra quando houver um número para grupos.</p>}
                                    </div>
                                  )}
                                </li>
                                <li className="rounded-xl border border-border p-3">
                                  <p className="text-sm font-semibold">5. Devolver ao solicitante</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{missing.length ? `Falta: ${missing.join(', ')}.` : 'Manda o resumo (técnico, dia e grupo) no WhatsApp de quem pediu.'}</p>
                                  <Button className="mt-2" size="sm" disabled={missing.length > 0 || Boolean(busy)} onClick={() => void act('return')}>{busy === 'return' ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Devolver pelo WhatsApp</Button>
                                </li>
                              </ol>
                            )}
                            {message && <p aria-live="polite" className="text-sm text-muted-foreground">{message}</p>}
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground">Histórico</p>
                              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                {detail.events.map((e, index) => <li key={index}>{when(e.at)} · {EVENT[e.kind] ?? e.kind} · {nameOf(e.actor)}</li>)}
                              </ul>
                            </div>
                            {!closed && <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" disabled={Boolean(busy)} onClick={() => { if (window.confirm('Cancelar esta solicitação?')) void act('cancel'); }}>Cancelar solicitação</Button>}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </section>
  </main>;
}
