'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, ImagePlus, Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Evidence = { id: number; kind: 'photo' | 'video' | 'rat'; name: string; mimeType: string; createdAt: string; uploadedBy: string };
type Assignment = { n1Email: string; status: 'claimed' | 'validated'; claimedAt: string; validatedAt: string | null } | null;
type Pending = { kind: 'photo' | 'video' | 'rat'; name: string; mimeType: string; data: string };

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
  function addFile(kind: Pending['kind'], file?: File) { if (!file) return; if (file.size > 900_000) { setMessage('Cada anexo deve ter no máximo 900 KB.'); return; } const reader = new FileReader(); reader.onload = () => setPending((items) => [...items, { kind, name: file.name, mimeType: file.type, data: String(reader.result) }]); reader.readAsDataURL(file); }
  if (loading) return <section className="grid min-h-28 place-items-center rounded-xl border border-border bg-muted/20"><Loader2 className="size-5 animate-spin text-primary" /></section>;
  return <section className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-4"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-lg bg-violet-400/15 text-violet-200"><CheckCircle2 className="size-5" /></span><div><h3 className="text-sm font-bold">Atendimento N1</h3><p className="mt-0.5 text-xs text-muted-foreground">Assuma chamado. Para validar, anexe evidência e RAT.</p></div></div>{assignment && <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${validated ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-violet-400/20 bg-violet-400/10 text-violet-200'}`}>{validated ? 'Chamado validado' : `Responsável N1: ${assignment.n1Email}`}</p>}{!assignment && <Button className="mt-3" onClick={() => void action('claim')} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Irei atender</Button>}{mine && !validated && <><div className="mt-4 grid gap-2 sm:grid-cols-3"><Upload label="Foto de evidência" icon={ImagePlus} accept="image/*" onFile={(file) => addFile('photo', file)} /><Upload label="Vídeo de evidência" icon={Video} accept="video/*" onFile={(file) => addFile('video', file)} /><Upload label="Anexar RAT" icon={FileText} accept="application/pdf,image/*" onFile={(file) => addFile('rat', file)} /></div><p className="mt-2 text-xs text-muted-foreground">Obrigatório: foto ou vídeo e RAT. Máximo 900 KB por arquivo.</p><div className="mt-2 flex flex-wrap gap-2">{[...evidence, ...pending].map((item, index) => <span key={'id' in item ? item.id : `${item.name}-${index}`} className="rounded-md border border-border bg-background px-2 py-1 text-xs">{item.kind === 'rat' ? 'RAT' : item.kind === 'photo' ? 'Foto' : 'Vídeo'} · {item.name}</span>)}</div><Button className="mt-3" onClick={() => void action('validate')} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Chamado validado</Button></>}{message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}</section>;
}
function Upload({ label, icon: Icon, accept, onFile }: { label: string; icon: typeof ImagePlus; accept: string; onFile: (file?: File) => void }) { return <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold transition hover:border-primary/50 hover:bg-muted"><Icon className="size-4 text-primary" />{label}<input type="file" className="sr-only" accept={accept} onChange={(event) => { onFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>; }
