'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Camera, Check, Download, FileText, Link2, Loader2, MessageCircle, Mic, Paperclip, Send, Trash2, Unlink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { roleLabels, isUserRole } from '@/lib/permissions';

type User = { getIdToken: () => Promise<string> } | null;
type Ticket = { id: string; title: string; store: string; city: string };
type Conversation = {
  contactPhone: string; contactName: string | null; ticketKey: string | null; assignedTo: string | null;
  lastMessageAt: string; lastReadAt: string | null; unread: number;
  lastMessage: { body: string | null; direction: string; occurredAt: string; messageType: string } | null;
};
type Message = { id: number; wamid: string; direction: string; messageType: string; body: string | null; mediaId: string | null; senderEmail: string | null; occurredAt: string };
type Colleague = { email: string; role: string | null; displayName: string | null };
type Presence = { state: string | null; photoUrl: string | null };
type Recording = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number; cancelled: boolean };

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export function WhatsAppInbox({ user, tickets, onOpenTicket }: { user: User; tickets: Ticket[]; onOpenTicket: (ticketId: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/whatsapp/conversations', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as { conversations?: Conversation[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar as conversas.');
      setConversations(payload.conversations ?? []);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as conversas.'); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return <section className="mt-6" aria-labelledby="whatsapp-inbox-title">
    <div className="surface-panel rounded-2xl p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">WhatsApp Business</p>
      <h2 id="whatsapp-inbox-title" className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Conversas</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Mensagens recebidas pelo WhatsApp da operação, com a opção de vincular a um chamado.</p>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p>}
      {loading ? <div className="grid min-h-56 place-items-center"><Loader2 className="size-6 animate-spin text-primary" aria-label="Carregando conversas" /></div> : conversations.length ? (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/25">
          {conversations.map((conversation) => (
            <li key={conversation.contactPhone}>
              <button type="button" onClick={() => setSelected(conversation)} className="flex min-h-20 w-full items-center gap-3 p-3 text-left transition hover:bg-white/[.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-100"><MessageCircle className="size-5" aria-hidden="true" /></div>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <b className="text-sm">{conversation.contactName || displayPhone(conversation.contactPhone) || 'Contato'}</b>
                    {conversation.ticketKey && <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{conversation.ticketKey}</span>}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {conversation.lastMessage ? `${conversation.lastMessage.direction === 'outgoing' ? 'Você: ' : ''}${previewText(conversation.lastMessage.messageType, conversation.lastMessage.body)}` : 'Sem mensagens ainda'}
                  </span>
                </span>
                {conversation.unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{conversation.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 grid min-h-56 place-items-center rounded-xl border border-dashed border-border p-6 text-center">
          <MessageCircle className="size-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-semibold">Nenhuma conversa ainda</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Mensagens recebidas no WhatsApp da operação aparecem aqui automaticamente.</p>
        </div>
      )}
    </div>
    <ConversationDialog conversation={selected} user={user} tickets={tickets} onClose={() => setSelected(null)} onUpdated={load} onOpenTicket={onOpenTicket} />
  </section>;
}

function ConversationDialog({ conversation, user, tickets, onClose, onUpdated, onOpenTicket }: {
  conversation: Conversation | null; user: User; tickets: Ticket[]; onClose: () => void; onUpdated: () => void; onOpenTicket: (ticketId: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [ticketKey, setTicketKey] = useState('');
  const [error, setError] = useState('');
  const [colleaguesByEmail, setColleaguesByEmail] = useState<Record<string, Colleague>>({});
  const [presence, setPresence] = useState<Presence>({ state: null, photoUrl: null });
  const [photoFailed, setPhotoFailed] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentAt = useRef(0);
  const contactPhone = conversation?.contactPhone ?? '';
  const basePath = `/api/whatsapp/conversations/${encodeURIComponent(contactPhone)}`;
  const lastMessageId = messages[messages.length - 1]?.id;
  const contactTyping = presence.state === 'composing' || presence.state === 'recording';

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => (user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}), [user]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastMessageId, loading, contactTyping]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const response = await fetch('/api/colleagues', { headers: await authHeaders(), cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { colleagues?: Colleague[] };
      setColleaguesByEmail(Object.fromEntries((payload.colleagues ?? []).map((item) => [item.email, item])));
    })();
  }, [user, authHeaders]);

  const load = useCallback(async () => {
    if (!user || !contactPhone) return;
    try {
      const response = await fetch(`${basePath}/messages`, { headers: await authHeaders(), cache: 'no-store' });
      const payload = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar a conversa.');
      setMessages(payload.messages ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a conversa.'); }
    finally { setLoading(false); }
  }, [user, contactPhone, basePath, authHeaders]);

  const loadPresence = useCallback(async () => {
    if (!user || !contactPhone) return;
    try {
      const response = await fetch(`${basePath}/presence`, { headers: await authHeaders(), cache: 'no-store' });
      if (response.ok) setPresence(await response.json() as Presence);
    } catch { /* presence is best-effort */ }
  }, [user, contactPhone, basePath, authHeaders]);

  useEffect(() => {
    if (!conversation) { setMessages([]); setPresence({ state: null, photoUrl: null }); return; }
    setTicketKey(conversation.ticketKey ?? ''); setLoading(true); setError(''); setPhotoFailed(false); setPendingFile(null); setDraft('');
    void load(); void loadPresence();
    const messagesTimer = window.setInterval(() => void load(), 4_000);
    const presenceTimer = window.setInterval(() => void loadPresence(), 3_000);
    return () => { window.clearInterval(messagesTimer); window.clearInterval(presenceTimer); };
  }, [conversation, load, loadPresence]);

  useEffect(() => {
    if (!recording) { setRecordingSeconds(0); return; }
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recording.startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const ticket = useMemo(() => tickets.find((item) => item.id === conversation?.ticketKey), [conversation, tickets]);

  const notifyPresence = useCallback(async (state: 'composing' | 'recording' | 'paused') => {
    if (!user || !contactPhone) return;
    if (state !== 'paused') {
      if (Date.now() - lastTypingSentAt.current < 8_000) return;
      lastTypingSentAt.current = Date.now();
    } else {
      lastTypingSentAt.current = 0;
    }
    try {
      await fetch(`${basePath}/presence`, { method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
    } catch { /* best-effort */ }
  }, [user, contactPhone, basePath, authHeaders]);

  async function sendText() {
    if (!user || !conversation || !draft.trim() || sending) return;
    setSending(true); setError('');
    try {
      const response = await fetch(`${basePath}/send`, {
        method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível enviar a mensagem.');
      setDraft(''); void notifyPresence('paused'); await load(); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.'); }
    finally { setSending(false); }
  }

  async function sendFile(file: File, options: { caption?: string; voice?: boolean } = {}) {
    if (!user || !conversation) return;
    if (file.size > MAX_UPLOAD_BYTES) { setError('Arquivo grande demais (máximo 32 MB).'); return; }
    setSending(true); setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      if (options.caption) form.set('caption', options.caption);
      if (options.voice) form.set('voice', '1');
      const response = await fetch(`${basePath}/send-media`, { method: 'POST', headers: await authHeaders(), body: form });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível enviar o arquivo.');
      setPendingFile(null); setDraft(''); await load(); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o arquivo.'); }
    finally { setSending(false); }
  }

  function pickFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { setError('Arquivo grande demais (máximo 32 MB).'); return; }
    setError(''); setPendingFile(file);
  }

  async function startRecording() {
    if (recording || sending) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setError('Este navegador não grava áudio.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const session: Recording = { recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false };
      recorder.ondataavailable = (event) => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(null);
        void notifyPresence('paused');
        if (session.cancelled || !session.chunks.length) return;
        const type = recorder.mimeType || 'audio/webm';
        const file = new File(session.chunks, `audio.${type.includes('ogg') ? 'ogg' : 'webm'}`, { type });
        void sendFile(file, { voice: true });
      };
      recorder.start();
      setError(''); setRecording(session);
      lastTypingSentAt.current = 0; void notifyPresence('recording');
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
    }
  }

  function stopRecording(cancel: boolean) {
    if (!recording) return;
    recording.cancelled = cancel;
    if (recording.recorder.state !== 'inactive') recording.recorder.stop();
  }

  async function link(nextTicketKey: string) {
    if (!user || !conversation) return;
    try {
      const response = await fetch(basePath, {
        method: 'PATCH', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketKey: nextTicketKey }),
      });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error); }
      setTicketKey(nextTicketKey); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível vincular o chamado.'); }
  }

  function close() {
    stopRecording(true);
    onClose();
  }

  const title = conversation?.contactName || displayPhone(contactPhone) || 'Contato';
  const subtitle = presence.state === 'composing' ? 'digitando...' : presence.state === 'recording' ? 'gravando áudio...' : presence.state === 'available' ? 'online' : displayPhone(contactPhone);
  const canSend = Boolean(draft.trim() || pendingFile);

  return <Dialog open={Boolean(conversation)} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent showCloseButton={false} className="flex h-[min(90dvh,780px)] flex-col gap-0 overflow-hidden bg-[#0b141a] p-0 text-neutral-100 ring-white/10 sm:max-w-lg">
      <div className="flex shrink-0 items-center gap-2.5 bg-[#202c33] px-3 py-2.5">
        <button type="button" onClick={close} className="grid size-9 place-items-center rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]" aria-label="Fechar conversa">
          <ArrowLeft className="size-5" />
        </button>
        {presence.photoUrl && !photoFailed ? (
          <img src={presence.photoUrl} alt="" onError={() => setPhotoFailed(true)} className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00a884]/20 text-sm font-bold text-[#25d366]" aria-hidden="true">{initials(title)}</div>
        )}
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-[15px] leading-tight font-semibold text-neutral-100">{title}</DialogTitle>
          <DialogDescription className={`truncate text-xs ${contactTyping || presence.state === 'available' ? 'text-[#25d366]' : 'text-neutral-400'}`} aria-live="polite">{subtitle}</DialogDescription>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 bg-[#111b21] px-3 py-2">
        <select value={ticketKey} onChange={(event) => void link(event.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#2a3942] px-2 text-xs text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]" aria-label="Vincular a um chamado">
          <option value="">Sem chamado vinculado</option>
          {tickets.slice(0, 200).map((item) => <option key={item.id} value={item.id}>{item.id} · {item.store}</option>)}
        </select>
        {ticket && <Button type="button" size="sm" variant="outline" className="h-8 border-white/10 bg-transparent text-neutral-200" onClick={() => { close(); onOpenTicket(ticket.id); }}><Link2 className="size-3.5" />Abrir {ticket.id}</Button>}
        {ticketKey && <Button type="button" size="sm" variant="ghost" className="h-8 text-neutral-300" onClick={() => void link('')} aria-label="Desvincular chamado"><Unlink className="size-3.5" /></Button>}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [background-image:radial-gradient(rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:18px_18px]" role="log" aria-label="Mensagens">
        {loading ? <Loader2 className="mx-auto mt-6 size-5 animate-spin text-[#00a884]" /> : messages.length ? (
          <AnimatePresence initial={false}>
            {messages.map((message, index) => {
              const outgoing = message.direction === 'outgoing';
              const sender = message.senderEmail ? senderLabel(message.senderEmail, colleaguesByEmail) : null;
              const day = dayLabel(message.occurredAt);
              const showDay = index === 0 || dayLabel(messages[index - 1].occurredAt) !== day;
              const isMedia = Boolean(MEDIA_TYPES[message.messageType]);
              const caption = message.messageType === 'document' ? null : message.body;
              return (
                <div key={message.wamid ?? message.id}>
                  {showDay && <div className="my-2 flex justify-center"><span className="rounded-lg bg-[#182229] px-2.5 py-1 text-[11px] font-medium text-neutral-400 shadow-sm">{day}</span></div>}
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className={`mb-1 flex ${outgoing ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`relative max-w-[85%] px-1.5 pt-1.5 pb-1 text-[14px] leading-snug shadow-sm ${outgoing ? 'bg-[#005c4b]' : 'bg-[#202c33]'} ${message.messageType === 'sticker' ? '!bg-transparent !shadow-none' : ''}`}
                      style={{ borderRadius: outgoing ? '8px 0 8px 8px' : '0 8px 8px 8px' }}
                    >
                      {sender && <p className="mb-0.5 px-1 text-[12.5px] font-semibold text-[#53bdeb]">{sender}</p>}
                      {isMedia && <MediaContent message={message} authHeaders={authHeaders} />}
                      {!isMedia && message.messageType === 'location' && message.body && (
                        <a href={message.body} target="_blank" rel="noreferrer" className="block px-1 text-[#53bdeb] underline">📍 Ver localização</a>
                      )}
                      {!isMedia && message.messageType === 'contact' && <p className="px-1">👤 {message.body}</p>}
                      {(!isMedia && message.messageType !== 'location' && message.messageType !== 'contact') && (
                        <p className="whitespace-pre-wrap break-words px-1 text-neutral-100">{message.body || '[mensagem não suportada]'}</p>
                      )}
                      {isMedia && caption && <p className="mt-1 whitespace-pre-wrap break-words px-1 text-neutral-100">{caption}</p>}
                      <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[11px] text-neutral-400">
                        <span>{timeLabel(message.occurredAt)}</span>
                        {outgoing && <Check className="size-3.5" aria-label="Enviada" />}
                      </div>
                    </div>
                  </motion.div>
                </div>
              );
            })}
            {contactTyping && (
              <motion.div key="typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-1 flex justify-start">
                <div className="flex items-center gap-1.5 bg-[#202c33] px-3 py-2" style={{ borderRadius: '0 8px 8px 8px' }}>
                  <span className="text-[12px] font-semibold text-[#25d366]">{presence.state === 'recording' ? 'gravando áudio' : 'digitando'}</span>
                  {[0, 1, 2].map((dot) => (
                    <motion.span key={dot} className="size-1.5 rounded-full bg-[#25d366]" animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.15 }} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : <p className="mt-6 text-center text-sm text-neutral-400">Nenhuma mensagem ainda.</p>}
      </div>

      {error && <p role="alert" className="shrink-0 bg-[#111b21] px-4 pt-2 text-xs text-rose-300">{error}</p>}

      {pendingFile && (
        <div className="flex shrink-0 items-center gap-3 border-t border-white/5 bg-[#111b21] px-3 py-2">
          <FilePreview file={pendingFile} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-neutral-100">{pendingFile.name}</p>
            <p className="text-xs text-neutral-400">{formatBytes(pendingFile.size)} · escreva uma legenda (opcional)</p>
          </div>
          <button type="button" onClick={() => setPendingFile(null)} disabled={sending} className="grid size-8 place-items-center rounded-full text-neutral-300 hover:bg-white/10" aria-label="Remover arquivo"><X className="size-4" /></button>
        </div>
      )}

      <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => { pickFile(event.target.files); event.target.value = ''; }} />
      <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(event) => { pickFile(event.target.files); event.target.value = ''; }} />

      <div className="flex shrink-0 items-center gap-2 bg-[#202c33] px-3 py-2.5">
        {recording ? (
          <>
            <button type="button" onClick={() => stopRecording(true)} className="grid size-11 shrink-0 place-items-center rounded-full text-neutral-300 hover:bg-white/10 hover:text-rose-300" aria-label="Cancelar gravação"><Trash2 className="size-5" /></button>
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#2a3942] px-4 text-[15px] text-neutral-100" aria-live="polite">
              <span className="size-2.5 animate-pulse rounded-full bg-rose-500" aria-hidden="true" />
              Gravando {formatDuration(recordingSeconds)}
            </div>
            <button type="button" onClick={() => stopRecording(false)} aria-label="Enviar áudio" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c]"><Send className="size-5" /></button>
          </>
        ) : (
          <>
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-full bg-[#2a3942] pr-1.5 pl-4">
              <input
                value={draft}
                onChange={(event) => { setDraft(event.target.value); if (event.target.value.trim()) void notifyPresence('composing'); }}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (pendingFile) void sendFile(pendingFile, { caption: draft.trim() }); else void sendText(); } }}
                placeholder={pendingFile ? 'Legenda' : 'Mensagem'}
                disabled={sending}
                aria-label={pendingFile ? 'Legenda do arquivo' : 'Responder pelo WhatsApp'}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-neutral-100 placeholder:text-neutral-400 focus-visible:outline-none disabled:opacity-60"
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} className="grid size-9 place-items-center rounded-full text-neutral-400 hover:text-neutral-100" aria-label="Anexar arquivo"><Paperclip className="size-5" /></button>
              <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={sending} className="grid size-9 place-items-center rounded-full text-neutral-400 hover:text-neutral-100" aria-label="Foto ou vídeo"><Camera className="size-5" /></button>
            </div>
            {canSend ? (
              <button type="button" onClick={() => { if (pendingFile) void sendFile(pendingFile, { caption: draft.trim() }); else void sendText(); }} disabled={sending} aria-label="Enviar" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50">
                {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
              </button>
            ) : (
              <button type="button" onClick={() => void startRecording()} disabled={sending} aria-label="Gravar áudio" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50">
                {sending ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
              </button>
            )}
          </>
        )}
      </div>
    </DialogContent>
  </Dialog>;
}

const MEDIA_TYPES: Record<string, true> = { image: true, video: true, audio: true, document: true, sticker: true };

// Media needs the Firebase token, so it can't be a plain <img src>: fetch it
// once per session and hand the element a blob URL.
const mediaCache = new Map<string, Promise<{ url: string; fileName: string | null }>>();

function useMediaUrl(mediaId: string | null, authHeaders: () => Promise<Record<string, string>>) {
  const [state, setState] = useState<{ url: string; fileName: string | null } | null | 'error'>(null);
  useEffect(() => {
    if (!mediaId) { setState('error'); return; }
    let active = true;
    let pending = mediaCache.get(mediaId);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(`/api/whatsapp/media/${encodeURIComponent(mediaId)}`, { headers: await authHeaders() });
        if (!response.ok) throw new Error('media');
        const name = response.headers.get('X-File-Name');
        return { url: URL.createObjectURL(await response.blob()), fileName: name ? decodeURIComponent(name) : null };
      })();
      mediaCache.set(mediaId, pending);
      pending.catch(() => mediaCache.delete(mediaId));
    }
    pending.then((value) => { if (active) setState(value); }, () => { if (active) setState('error'); });
    return () => { active = false; };
  }, [mediaId, authHeaders]);
  return state;
}

function MediaContent({ message, authHeaders }: { message: Message; authHeaders: () => Promise<Record<string, string>> }) {
  const media = useMediaUrl(message.mediaId, authHeaders);
  if (media === 'error') return <p className="px-1 text-sm text-neutral-400 italic">{previewText(message.messageType, null)} indisponível</p>;
  if (!media) return <div className="grid h-24 w-56 max-w-full place-items-center rounded-md bg-black/20"><Loader2 className="size-5 animate-spin text-neutral-400" /></div>;

  switch (message.messageType) {
    case 'image':
      return <a href={media.url} target="_blank" rel="noreferrer" className="block"><img src={media.url} alt="Imagem recebida" className="max-h-80 w-auto max-w-full rounded-md object-cover" /></a>;
    case 'sticker':
      return <img src={media.url} alt="Figurinha" className="size-32 object-contain" />;
    case 'video':
      return <video src={media.url} controls preload="metadata" className="max-h-80 w-full max-w-sm rounded-md bg-black" />;
    case 'audio':
      return <audio src={media.url} controls preload="metadata" className="h-10 w-64 max-w-full" />;
    default: {
      const name = message.body || media.fileName || 'arquivo';
      return (
        <a href={media.url} download={name} className="flex w-64 max-w-full items-center gap-3 rounded-md bg-black/20 px-3 py-2.5 text-neutral-100 hover:bg-black/30">
          <FileText className="size-8 shrink-0 text-[#53bdeb]" />
          <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
          <Download className="size-4 shrink-0 text-neutral-400" />
        </a>
      );
    }
  }
}

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) { setUrl(null); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (url) return <img src={url} alt="" className="size-12 shrink-0 rounded-md object-cover" />;
  return <div className="grid size-12 shrink-0 place-items-center rounded-md bg-[#2a3942]"><FileText className="size-6 text-[#53bdeb]" /></div>;
}

function senderLabel(email: string, colleaguesByEmail: Record<string, Colleague>) {
  const colleague = colleaguesByEmail[email];
  const firstName = (colleague?.displayName || email.split('@')[0]).trim().split(/\s+/)[0];
  const role = colleague?.role && isUserRole(colleague.role) ? roleLabels[colleague.role] : null;
  return role ? `${firstName} · ${role}` : firstName;
}

function previewText(type: string, body: string | null) {
  switch (type) {
    case 'image': return `📷 ${body || 'Foto'}`;
    case 'video': return `🎥 ${body || 'Vídeo'}`;
    case 'audio': return '🎤 Áudio';
    case 'document': return `📄 ${body || 'Documento'}`;
    case 'sticker': return 'Figurinha';
    case 'location': return '📍 Localização';
    case 'contact': return `👤 ${body || 'Contato'}`;
    default: return body || '';
  }
}

// "@lid" identifiers are opaque WhatsApp IDs, not phone numbers.
function displayPhone(jid: string) {
  if (!jid || jid.endsWith('@lid')) return '';
  const digits = jid.replace(/@.*$/, '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter((part) => /[\p{L}]/u.test(part));
  if (!parts.length) return '#';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR');
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
