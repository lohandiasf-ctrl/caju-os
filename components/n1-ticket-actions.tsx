'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, ImagePlus, Loader2, Trash2, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CajuLoading } from '@/components/caju-loading';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ImageZoom } from '@/components/image-zoom';
import { validateImageFile } from '@/lib/image-validation';
import { hasSafeDataUrlType } from '@/lib/safe-data-url';

// Abrir um data: URL direto numa aba nova (`<a target="_blank">`) é bloqueado
// em silêncio pelo Chrome havia alguns anos — clicava e não acontecia nada.
// Convertendo para blob: antes de abrir, o navegador não bloqueia.
function openDataUrlInNewTab(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) { window.open(dataUrl, '_blank', 'noreferrer'); return; }
  try {
    const [, mime, base64] = match;
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    window.open(url, '_blank', 'noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    window.open(dataUrl, '_blank', 'noreferrer');
  }
}

type Evidence = { id: number; kind: 'photo' | 'video' | 'rat'; name: string; mimeType: string; data: string; createdAt: string; uploadedBy: string };
type Assignment = { n1Email: string; participantN1Email?: string | null; status: 'claimed' | 'validated'; claimedAt: string; validatedAt: string | null } | null;
type Pending = { kind: 'photo' | 'video' | 'rat'; name: string; mimeType: string; data: string; warning?: string };

export function N1TicketActions({ ticketKey, user }: { ticketKey: string; user: { email?: string | null; getIdToken: () => Promise<string> } | null }) {
  const [assignment, setAssignment] = useState<Assignment>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Evidence | null>(null);
  const [message, setMessage] = useState('');
  const mine = Boolean(assignment && [assignment.n1Email, assignment.participantN1Email].some((email) => email?.toLowerCase() === user?.email?.toLowerCase()));
  const validated = assignment?.status === 'validated';
  useEffect(() => {
    if (!user) return; let active = true; setLoading(true);
    void user.getIdToken().then(async (token) => { const response = await fetch(`/api/n1-tickets/${ticketKey}`, { headers: { Authorization: `Bearer ${token}` } }); const data = await response.json() as { assignment?: Assignment; evidence?: Evidence[]; error?: string }; if (!response.ok) throw new Error(data.error || 'Falha ao carregar atendimento.'); if (active) { setAssignment(data.assignment ?? null); setEvidence(data.evidence ?? []); } }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : 'Falha ao carregar atendimento.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticketKey, user]);
  async function action(action: 'claim' | 'validate') {
    if (!user) return; setSaving(true); setMessage('');
    try { const response = await fetch(`/api/n1-tickets/${ticketKey}`, { method: 'PUT', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, evidence: action === 'validate' ? pending : [] }) }); const data = await response.json() as { assignment?: Assignment; evidence?: Evidence[]; error?: string }; if (!response.ok) throw new Error(data.error || 'Falha ao atualizar chamado.'); setAssignment(data.assignment ?? null); setEvidence(data.evidence ?? []); setPending([]); setMessage(action === 'claim' ? 'Chamado vinculado a você.' : 'Chamado validado com evidências e RAT.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao atualizar chamado.'); } finally { setSaving(false); }
  }
  async function removeEvidence(id: number) {
    if (!user || !window.confirm('Remover esta evidência? Ela também será apagada do Jira. Esta ação não pode ser desfeita.')) return;
    setRemovingId(id); setMessage('');
    try {
      const response = await fetch(`/api/n1-tickets/${ticketKey}`, { method: 'PUT', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'removeEvidence', evidenceId: id }) });
      const data = await response.json() as { assignment?: Assignment; evidence?: Evidence[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Falha ao remover evidência.');
      setAssignment(data.assignment ?? null); setEvidence(data.evidence ?? []); setMessage('Evidência removida.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao remover evidência.'); }
    finally { setRemovingId(null); }
  }
  // Evidence is the only proof the visit happened, and a dark or unreadable
  // photo is usually discovered long after the technician has left the store.
  // Checked here, while the file can still be retaken.
  async function inspectPhoto(file: File): Promise<string | undefined> {
    try {
      const result = await validateImageFile(file, { minWidth: 1, minHeight: 1 });
      return result.isValid ? undefined : result.message;
    } catch {
      return undefined;
    }
  }

  function addFile(kind: Pending['kind'], file?: File) {
    if (!file) return;
    if (file.size > 900_000) { setMessage('Cada anexo deve ter no máximo 900 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      const isImage = file.type.startsWith('image/');
      void (async () => {
        const warning = isImage ? await inspectPhoto(file) : undefined;
        setPending((items) => [...items, { kind, name: file.name, mimeType: file.type, data, warning }]);
        if (warning) setMessage(warning);
      })();
    };
    reader.readAsDataURL(file);
  }
  if (loading) return <section className="grid min-h-32 place-items-center rounded-xl border border-border bg-muted/20"><CajuLoading label="Carregando atendimento N1..." fullscreen={false} compact /></section>;
  return <>
    <section className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-4"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-lg bg-violet-400/15 text-violet-200"><CheckCircle2 className="size-5" /></span><div><h3 className="text-sm font-bold">Atendimento N1</h3><p className="mt-0.5 text-xs text-muted-foreground">Até dois N1 por chamado. Para validar, anexe evidência e RAT.</p></div></div>{assignment && <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${validated ? 'border-success/25 bg-success-soft text-success' : 'border-violet-400/20 bg-violet-400/10 text-violet-200'}`}><p>{validated ? 'Chamado validado' : `N1 principal: ${assignment.n1Email}`}</p>{assignment.participantN1Email && <p className="mt-1">N1 participante: {assignment.participantN1Email}</p>}</div>}{(!assignment || (assignment.n1Email.toLowerCase() !== user?.email?.toLowerCase() && !assignment.participantN1Email)) && <Button className="mt-3" onClick={() => void action('claim')} disabled={saving || Boolean(validated)}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {assignment ? 'Participar do atendimento' : 'Irei atender'}</Button>}{mine && !validated && <><div className="mt-4 grid gap-2 sm:grid-cols-3"><Upload label="Foto de evidência" icon={ImagePlus} accept="image/*" onFile={(file) => addFile('photo', file)} /><Upload label="Vídeo de evidência" icon={Video} accept="video/*" onFile={(file) => addFile('video', file)} /><Upload label="Anexar RAT" icon={FileText} accept="application/pdf,image/*" onFile={(file) => addFile('rat', file)} /></div><p className="mt-2 text-xs text-muted-foreground">Obrigatório: foto ou vídeo e RAT. Máximo 900 KB por arquivo.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{evidence.map((item) => <EvidencePreview key={item.id} item={item} onRemove={() => void removeEvidence(item.id)} removing={removingId === item.id} onOpen={() => setPreview(item)} />)}{pending.map((item, index) => <div key={`${item.name}-${index}`} className={`rounded-lg border border-dashed p-2 text-xs ${item.warning ? 'border-warning/25 bg-warning-soft text-warning' : 'border-primary/40 bg-background/60'}`}>Pronto para enviar: {item.name}{item.warning && <span className="mt-1 block font-semibold">{item.warning}</span>}</div>)}</div><Button className="mt-3" onClick={() => void action('validate')} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Chamado validado</Button></>}{message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}</section>
    {preview && <Dialog open onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <header className="flex items-center gap-3 border-b border-border p-3">
          <div className="min-w-0 flex-1"><DialogTitle className="text-sm font-bold">{preview.kind === 'rat' ? 'RAT' : preview.kind === 'photo' ? 'Foto' : 'Vídeo'} · {preview.name}</DialogTitle></div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setPreview(null)} aria-label="Fechar visualização"><X /></Button>
        </header>
        <div className="grid h-[76vh] min-h-0 flex-1 place-items-center overflow-hidden bg-black/40 p-3 [&>*]:h-full [&>*]:w-full">
          {preview.kind === 'photo' ? <ImageZoom src={preview.data} alt={`Evidência: ${preview.name}`} className="h-[76vh] w-full" /> : <video src={preview.data} controls autoPlay className="max-h-[76vh] max-w-full"><track kind="captions" /></video>}
        </div>
      </DialogContent>
    </Dialog>}
  </>;
}
function EvidencePreview({ item, onRemove, removing, onOpen }: { item: Evidence; onRemove: () => void; removing: boolean; onOpen: () => void }) {
  const safe = hasSafeDataUrlType(item.data, item.mimeType);
  return <article className="overflow-hidden rounded-lg border border-border bg-background/70">
    <div className="flex items-start gap-2 p-2">
      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{item.kind === 'rat' ? 'RAT' : item.kind === 'photo' ? 'Foto' : 'Vídeo'} · {item.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.uploadedBy}</p></div>
      <button type="button" onClick={onRemove} disabled={removing} aria-label={`Remover evidência ${item.name}`} title="Remover evidência (some daqui e do Jira)" className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">{removing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button>
    </div>
    {!safe ? <p className="p-2 text-xs text-muted-foreground">Anexo antigo com formato não verificado.</p> : <>
      {item.kind === 'photo' && <button type="button" onClick={onOpen} aria-label={`Ampliar foto ${item.name}`} className="block w-full"><img src={item.data} alt={`Evidência: ${item.name}`} className="h-28 w-full object-cover" /></button>}
      {item.kind === 'video' && <button type="button" onClick={onOpen} aria-label={`Ampliar vídeo ${item.name}`} className="block w-full"><video src={item.data} preload="metadata" muted className="h-28 w-full bg-black object-cover"><track kind="captions" /></video></button>}
      {item.kind === 'rat' && <button type="button" onClick={() => openDataUrlInNewTab(item.data)} className="m-2 inline-flex text-xs font-semibold text-primary hover:underline">Abrir RAT</button>}
    </>}
  </article>;
}
function Upload({ label, icon: Icon, accept, onFile }: { label: string; icon: typeof ImagePlus; accept: string; onFile: (file?: File) => void }) { return <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold transition hover:border-primary/50 hover:bg-muted"><Icon className="size-4 text-primary" />{label}<input type="file" className="sr-only" accept={accept} onChange={(event) => { onFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>; }
