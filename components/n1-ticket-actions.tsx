'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, ImagePlus, Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateImageFile } from '@/lib/image-validation';

type Evidence = { id: number; kind: 'photo' | 'video' | 'rat'; name: string; mimeType: string; data: string; createdAt: string; uploadedBy: string };
type Assignment = { n1Email: string; status: 'claimed' | 'validated'; claimedAt: string; validatedAt: string | null } | null;
type Pending = { kind: 'photo' | 'video' | 'rat'; name: string; mimeType: string; data: string; warning?: string };

export function N1TicketActions({ ticketKey, user }: { ticketKey: string; user: { email?: string | null; getIdToken: () => Promise<string> } | null }) {
  const [assignment, setAssignment] = useState<Assignment>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const mine = Boolean(assignment && assignment.n1Email.toLowerCase() === user?.email?.toLowerCase());
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
  if (loading) return <section className="grid min-h-28 place-items-center rounded-xl border border-border bg-muted/20"><Loader2 className="size-5 animate-spin text-primary" /></section>;
  return <section className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-4"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-lg bg-violet-400/15 text-violet-200"><CheckCircle2 className="size-5" /></span><div><h3 className="text-sm font-bold">Atendimento N1</h3><p className="mt-0.5 text-xs text-muted-foreground">Assuma chamado. Para validar, anexe evidência e RAT.</p></div></div>{assignment && <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${validated ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-violet-400/20 bg-violet-400/10 text-violet-200'}`}>{validated ? 'Chamado validado' : `Responsável N1: ${assignment.n1Email}`}</p>}{!assignment && <Button className="mt-3" onClick={() => void action('claim')} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Irei atender</Button>}{mine && !validated && <><div className="mt-4 grid gap-2 sm:grid-cols-3"><Upload label="Foto de evidência" icon={ImagePlus} accept="image/*" onFile={(file) => addFile('photo', file)} /><Upload label="Vídeo de evidência" icon={Video} accept="video/*" onFile={(file) => addFile('video', file)} /><Upload label="Anexar RAT" icon={FileText} accept="application/pdf,image/*" onFile={(file) => addFile('rat', file)} /></div><p className="mt-2 text-xs text-muted-foreground">Obrigatório: foto ou vídeo e RAT. Máximo 900 KB por arquivo.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{evidence.map((item) => <EvidencePreview key={item.id} item={item} />)}{pending.map((item, index) => <div key={`${item.name}-${index}`} className={`rounded-lg border border-dashed p-2 text-xs ${item.warning ? 'border-amber-400/50 bg-amber-400/10 text-amber-200' : 'border-primary/40 bg-background/60'}`}>Pronto para enviar: {item.name}{item.warning && <span className="mt-1 block font-semibold">{item.warning}</span>}</div>)}</div><Button className="mt-3" onClick={() => void action('validate')} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Chamado validado</Button></>}{message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}</section>;
}
function EvidencePreview({ item }: { item: Evidence }) { return <article className="overflow-hidden rounded-lg border border-border bg-background/70"><div className="p-2"><p className="truncate text-xs font-semibold">{item.kind === 'rat' ? 'RAT' : item.kind === 'photo' ? 'Foto' : 'Vídeo'} · {item.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.uploadedBy}</p></div>{item.kind === 'photo' && <img src={item.data} alt={`Evidência: ${item.name}`} className="h-28 w-full object-cover" />}{item.kind === 'video' && <video src={item.data} controls preload="metadata" className="h-28 w-full bg-black object-cover"><track kind="captions" /></video>}{item.kind === 'rat' && <a href={item.data} target="_blank" rel="noreferrer" className="m-2 inline-flex text-xs font-semibold text-primary hover:underline">Abrir RAT</a>}</article>; }
function Upload({ label, icon: Icon, accept, onFile }: { label: string; icon: typeof ImagePlus; accept: string; onFile: (file?: File) => void }) { return <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold transition hover:border-primary/50 hover:bg-muted"><Icon className="size-4 text-primary" />{label}<input type="file" className="sr-only" accept={accept} onChange={(event) => { onFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>; }
