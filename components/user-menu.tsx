'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronUp, File, Loader2, LogOut, MessageCircle, Paperclip, Send, Users } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/auth-provider';
import { roleLabels } from '@/lib/permissions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const statuses = ['Online', 'Ocupado', 'Almoçando', 'Pausa de 15 minutos', 'Offline'] as const;
export type Status = typeof statuses[number];
type Colleague = { email: string; role: 'gerencia' | 'n1' | 'analista'; displayName: string | null; phone: string | null; photoUrl: string | null; status: Status; updatedAt: string | null };
type Message = { id: number; senderEmail: string; recipientEmail: string; body: string; attachmentName?: string | null; attachmentType?: string | null; attachmentData?: string | null; createdAt: string; readAt: string | null };
type ChatTicket = { id: string; title: string; store: string; city: string };

const statusColors: Record<Status, string> = {
  Online: 'bg-emerald-400', Ocupado: 'bg-rose-400', Almoçando: 'bg-amber-400',
  'Pausa de 15 minutos': 'bg-sky-400', Offline: 'bg-slate-500',
};

export function ColleaguesPanel({ tickets = [] }: { tickets?: ChatTicket[] }) {
  const { user } = useAuth();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/colleagues', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as { colleagues?: Colleague[] };
      if (response.ok) setColleagues((payload.colleagues ?? []).filter((item) => item.email.toLowerCase() !== user.email?.toLowerCase()));
    } finally { setLoading(false); }
  }, [user]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    const refresh = () => void load();
    window.addEventListener('caju-presence-updated', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('caju-presence-updated', refresh); };
  }, [load]);
  const list = <ColleagueList colleagues={colleagues} loading={loading} onSelect={(colleague) => { setSelected(colleague); setMobileOpen(false); }} />;
  return <>
    <aside className="colleagues-sidebar fixed inset-y-0 right-0 z-30 hidden w-[228px] flex-col border-l border-sidebar-border bg-sidebar/95 px-3 py-4 shadow-[-18px_0_50px_rgba(0,0,0,.18)] backdrop-blur-xl xl:flex" aria-label="Colegas">
      <div className="flex h-10 items-center justify-between px-1"><div><p className="text-sm font-bold">Colegas</p><p className="text-[11px] text-muted-foreground">Equipe e disponibilidade</p></div><div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="size-4" aria-hidden="true" /></div></div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{list}</div>
    </aside>
    <button type="button" onClick={() => setMobileOpen(true)} className="fixed bottom-4 right-4 z-30 grid size-12 place-items-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-2xl xl:hidden" aria-label="Abrir colegas"><Users className="size-5" /></button>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Colegas</DialogTitle><DialogDescription>Status da equipe em tempo real. Toque em uma foto para conversar.</DialogDescription></DialogHeader>{list}</DialogContent></Dialog>
    <ChatDialog colleague={selected} tickets={tickets} onClose={() => setSelected(null)} />
  </>;
}

function ColleagueList({ colleagues, loading, onSelect }: { colleagues: Colleague[]; loading: boolean; onSelect: (colleague: Colleague) => void }) {
  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-border bg-card/40 p-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando equipe...</div>;
  if (!colleagues.length) return <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum outro funcionário ativo.</div>;
  return <div className="space-y-1.5">{colleagues.map((colleague) => {
    const name = colleague.displayName || colleague.email.split('@')[0];
    return <button key={colleague.email} type="button" onClick={() => onSelect(colleague)} className="group flex min-h-12 w-full items-center gap-2.5 rounded-lg border border-transparent px-1.5 py-1.5 text-left transition hover:border-border hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Conversar com ${name}, status ${colleague.status}`}>
      <span className="relative grid size-8 shrink-0 place-items-center overflow-visible rounded-full border border-white/10 bg-muted text-[10px] font-bold text-foreground">{colleague.photoUrl ? <img src={colleague.photoUrl} alt="" className="size-full rounded-full object-cover" /> : initials(name)}<span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-sidebar ${statusColors[colleague.status]}`} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{name}</span><span className="block truncate text-[11px] text-muted-foreground">{roleLabels[colleague.role]} · {colleague.status}</span></span>
      <MessageCircle className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden="true" />
    </button>;
  })}</div>;
}

function ChatDialog({ colleague, tickets, onClose }: { colleague: Colleague | null; tickets: ChatTicket[]; onClose: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [ticketRef, setTicketRef] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const loadMessages = useCallback(async (quiet = false) => {
    if (!user || !colleague) return;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/messages?with=${encodeURIComponent(colleague.email)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Falha ao carregar a conversa.');
      setMessages(payload.messages ?? []); setError('');
    } catch (reason) { if (!quiet) setError(reason instanceof Error ? reason.message : 'Falha ao carregar a conversa.'); }
    finally { if (!quiet) setLoading(false); }
  }, [colleague, user]);
  useEffect(() => {
    if (!colleague) return;
    setMessages([]); setDraft(''); setTicketRef(''); setError(''); void loadMessages();
    const timer = window.setInterval(() => void loadMessages(true), 5_000);
    return () => window.clearInterval(timer);
  }, [colleague, loadMessages]);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !colleague || (!draft.trim() && !attachment && !ticketRef) || sending) return;
    setSending(true); setError('');
    try {
      const selectedTicket = tickets.find((ticket) => ticket.id === ticketRef);
      const ticketText = selectedTicket ? `Chamado ${selectedTicket.id}: ${selectedTicket.title} (${selectedTicket.store} · ${selectedTicket.city})` : '';
      const messageText = [draft.trim(), ticketText].filter(Boolean).join('\n');
      const response = await fetch('/api/messages', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: colleague.email, body: messageText, attachment }) });
      const payload = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error || 'Falha ao enviar a mensagem.');
      setMessages((current) => [...current, payload.message!]); setDraft(''); setTicketRef(''); setAttachment(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao enviar a mensagem.'); }
    finally { setSending(false); }
  }
  const name = colleague?.displayName || colleague?.email.split('@')[0] || '';
  return <Dialog open={Boolean(colleague)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="grid h-[min(620px,88vh)] grid-rows-[auto_1fr_auto] overflow-hidden p-0 sm:max-w-lg">
    <DialogHeader className="border-b border-border p-4 pr-14"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center overflow-hidden rounded-full bg-muted text-xs font-bold">{colleague?.photoUrl ? <img src={colleague.photoUrl} alt="" className="size-full object-cover" /> : initials(name)}</span><div><DialogTitle>{name}</DialogTitle><DialogDescription>{colleague?.status} · {colleague?.email}</DialogDescription></div></div></DialogHeader>
    <div className="min-h-0 overflow-y-auto bg-black/10 p-4" aria-live="polite">{loading ? <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div> : messages.length ? <div className="space-y-2">{messages.map((message) => { const mine = message.senderEmail.toLowerCase() === user?.email?.toLowerCase(); return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 ${mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card'}`}>{message.body && <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}{message.attachmentData && <a href={message.attachmentData} download={message.attachmentName || 'anexo'} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-2 text-xs font-semibold underline"><File className="size-4" />{message.attachmentName || 'Abrir anexo'}</a>}<p className={`mt-1 text-[10px] ${mine ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</p></div></div>; })}<div ref={bottomRef} /></div> : <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">Envie a primeira mensagem para {name}.</div>}{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}</div>
    <form onSubmit={sendMessage} className="border-t border-border bg-card p-3"><div className="flex gap-2"><label htmlFor="chat-message" className="sr-only">Mensagem</label><input id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Escreva uma mensagem..." className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm" /><label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-input bg-background hover:bg-muted" aria-label="Anexar foto ou PDF"><Paperclip className="size-4" /><input className="sr-only" type="file" accept="image/*,.pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 3_000_000) { setError('O anexo deve ter até 3 MB.'); return; } const reader = new FileReader(); reader.onload = () => setAttachment({ name: file.name, type: file.type, data: String(reader.result) }); reader.readAsDataURL(file); event.currentTarget.value = ''; }} /></label><select aria-label="Enviar chamado" value={ticketRef} onChange={(event) => setTicketRef(event.target.value)} className="h-11 max-w-36 rounded-xl border border-input bg-background px-2 text-xs"><option value="">Chamado...</option>{tickets.slice(0, 100).map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.id} · {ticket.store}</option>)}</select><button type="submit" disabled={(!draft.trim() && !attachment && !ticketRef) || sending} className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Enviar mensagem">{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button></div>{attachment && <p className="mt-2 truncate text-xs text-muted-foreground">Anexo: {attachment.name}</p>}{ticketRef && <p className="mt-2 truncate text-xs text-muted-foreground">Chamado selecionado: {ticketRef}</p>}</form>
  </DialogContent></Dialog>;
}

export function UserMenu() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('Online');
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [feedback, setFeedback] = useState('');
  const syncPresence = useCallback(async (changes: Partial<{ status: Status; displayName: string; phone: string; photoUrl: string | null }> = {}) => {
    if (!user) return;
    const response = await fetch('/api/colleagues', { method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, ...changes }) });
    if (!response.ok) throw new Error('Não foi possível sincronizar seu perfil.');
    window.dispatchEvent(new Event('caju-presence-updated'));
  }, [status, user]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const localStatus = (localStorage.getItem('caju-status') as Status) || 'Online'; setStatus(localStatus);
      try {
        const response = await fetch('/api/colleagues', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const payload = await response.json() as { colleagues?: Colleague[] };
        const profile = payload.colleagues?.find((item) => item.email.toLowerCase() === user.email?.toLowerCase());
        if (active && profile) { setName(profile.displayName || ''); setPhone(profile.phone || ''); setPhoto(profile.photoUrl); }
      } finally { if (active) void syncPresence({ status: localStatus }); }
    })();
    const timer = window.setInterval(() => void syncPresence(), 45_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [syncPresence, user]);
  async function updateStatus(value: Status) {
    setStatus(value); localStorage.setItem('caju-status', value); setFeedback(`Status alterado para ${value}.`);
    try { await syncPresence({ status: value }); } catch (reason) { setFeedback(reason instanceof Error ? reason.message : 'Falha ao atualizar o status.'); }
  }
  async function saveProfile() {
    setFeedback('Salvando perfil...');
    try { await syncPresence({ displayName: name, phone, photoUrl: photo }); localStorage.setItem('caju-profile-name', name); localStorage.setItem('caju-profile-phone', phone); setFeedback('Perfil atualizado.'); }
    catch (reason) { setFeedback(reason instanceof Error ? reason.message : 'Falha ao salvar o perfil.'); }
  }
  function choosePhoto(file?: File) {
    if (!file) return;
    if (file.size > 650_000) { setFeedback('Escolha uma imagem de até 650 KB.'); return; }
    const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.readAsDataURL(file);
  }
  const label = name || user?.email?.slice(0, 2).toUpperCase() || 'US';
  return <div className="relative mt-2 rounded-xl border border-border/70 bg-card/40 p-2 group-hover/sidebar:p-3">
    <button type="button" className="flex min-h-10 w-full items-center gap-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 text-xs font-bold text-emerald-200">{photo ? <img src={photo} alt="Foto do perfil" className="size-full object-cover" /> : label.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1 opacity-0 transition-opacity group-hover/sidebar:opacity-100"><p className="truncate text-xs font-semibold">{name || user?.email}</p><p className="truncate text-xs text-muted-foreground">{role ? roleLabels[role] : 'Sem perfil'} · <span className="font-semibold text-emerald-300">{status}</span></p></div><ChevronUp className={`size-4 shrink-0 opacity-0 transition group-hover/sidebar:opacity-100 ${open ? '' : 'rotate-180'}`} /></button>
    {open && <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 max-h-[min(72vh,34rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meu status</p><div className="mt-2 grid gap-1">{statuses.map((item) => <button key={item} type="button" onClick={() => void updateStatus(item)} className={`flex min-h-11 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${status === item ? 'border-primary/50 bg-primary/15 font-bold text-primary' : 'border-transparent hover:bg-muted'}`}>{item}{status === item && <Check className="size-4 text-primary" />}</button>)}</div><div className="my-3 border-t border-border" /><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meu perfil</p><label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-primary"><Camera className="size-4" />Alterar foto<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label><label className="mt-2 block text-xs text-muted-foreground" htmlFor="profile-name">Nome de exibição</label><input id="profile-name" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={name} onChange={(event) => setName(event.target.value)} /><label className="mt-2 block text-xs text-muted-foreground" htmlFor="profile-phone">Telefone</label><input id="profile-phone" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={phone} onChange={(event) => setPhone(event.target.value)} /><button type="button" onClick={() => void saveProfile()} className="mt-3 h-10 w-full rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">Salvar perfil</button>{feedback && <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">{feedback}</p>}<button type="button" onClick={() => void signOut(auth)} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted"><LogOut className="size-4" />Sair da conta</button></div>}
  </div>;
}

function initials(value: string) { return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'US'; }
