'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Camera, Check, ClipboardCheck, Download, FileText, Link2, Loader2, MessageCircle, Mic, Paperclip, Search, Send, Trash2, Unlink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { isUserRole, roleLabels } from '@/lib/permissions';
import { whatsappSenderLabel } from '@/lib/whatsapp-sender';
import { splitTicketKeys } from '@/lib/whatsapp-bridge-payload';

type User = { getIdToken: () => Promise<string> } | null;
type AuthHeaders = () => Promise<Record<string, string>>;
type Ticket = { id: string; title: string; store: string; city: string };
type Conversation = {
  contactPhone: string; contactName: string | null; ticketKey: string | null; assignedTo: string | null;
  lastMessageAt: string; lastReadAt: string | null; unread: number;
  lastMessage: { body: string | null; direction: string; occurredAt: string; messageType: string } | null;
};
type Message = { id: number; wamid: string; direction: string; messageType: string; body: string | null; mediaId: string | null; contactName: string | null; senderJid: string | null; senderEmail: string | null;
  quotedWamid: string | null; quotedBody: string | null; quotedName: string | null; editedAt: string | null; deletedAt: string | null; evidenceTicketKeys: string | null; occurredAt: string };
type Colleague = { email: string; role: string | null; displayName: string | null };
type Presence = { state: string | null; photoUrl: string | null };
type Recording = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number; cancelled: boolean };
type Filter = 'all' | 'unread' | 'groups' | 'ticket';
type BridgeHealth = { status: 'open' | 'connecting' | 'qr' | 'logged_out' | 'unreachable'; since: string | null };

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const FILTERS: Array<[Filter, string]> = [['all', 'Todas'], ['unread', 'Não lidas'], ['groups', 'Grupos'], ['ticket', 'Com chamado']];
// A reconnect usually takes a few seconds; only warn if it drags on.
const RECONNECT_GRACE_MS = 60_000;

export function WhatsAppInbox({ user, tickets, onOpenTicket }: { user: User; tickets: Ticket[]; onOpenTicket: (ticketId: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [bridge, setBridge] = useState<BridgeHealth | null>(null);
  const bridgeWarning = bridgeWarningText(bridge);

  const authHeaders = useCallback<AuthHeaders>(async (): Promise<Record<string, string>> => (user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}), [user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/whatsapp/conversations', { headers: await authHeaders(), cache: 'no-store' });
      if (response.status === 429) return;
      const payload = await response.json() as { conversations?: Conversation[]; bridge?: BridgeHealth | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar as conversas.');
      setConversations(payload.conversations ?? []);
      setBridge(payload.bridge ?? null);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as conversas.'); }
    finally { setLoading(false); }
  }, [user, authHeaders]);

  useVisiblePolling(load, 15_000);

  const visible = useMemo(() => {
    const term = normalize(query);
    return conversations.filter((conversation) => {
      if (filter === 'unread' && conversation.unread === 0) return false;
      if (filter === 'ticket' && !conversation.ticketKey) return false;
      if (filter === 'groups' && !isGroup(conversation.contactPhone)) return false;
      if (!term) return true;
      return normalize(`${conversation.contactName ?? ''} ${displayPhone(conversation.contactPhone)} ${conversation.ticketKey ?? ''} ${conversation.lastMessage?.body ?? ''}`).includes(term);
    });
  }, [conversations, query, filter]);

  const selected = conversations.find((conversation) => conversation.contactPhone === selectedPhone) ?? null;

  return <section className="flex min-h-[360px] flex-1 flex-col" aria-label="Conversas do WhatsApp">
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0b141a] text-neutral-100 shadow-2xl">
      {/* Chat list */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/10 bg-[#111b21] md:w-[340px] lg:w-[380px]`}>
        <div className="flex h-16 shrink-0 items-center justify-between bg-[#202c33] px-4">
          <h2 className="text-lg font-bold tracking-tight">Conversas</h2>
          {conversations.some((conversation) => conversation.unread > 0) && (
            <span className="rounded-full bg-[#00a884] px-2 py-0.5 text-xs font-bold text-[#111b21]">{conversations.filter((conversation) => conversation.unread > 0).length} não lida(s)</span>
          )}
        </div>

        <div className="shrink-0 space-y-2 px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar nome, número ou chamado"
              aria-label="Pesquisar conversas"
              className="h-9 w-full rounded-lg bg-[#202c33] pr-3 pl-10 text-sm text-neutral-100 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar conversas">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] ${filter === value ? 'bg-[#0a332c] text-[#25d366]' : 'bg-[#202c33] text-neutral-300 hover:bg-[#2a3942]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {bridgeWarning && <p role="alert" className="mx-3 mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">{bridgeWarning}</p>}
        {error && <p role="alert" className="mx-3 mb-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="grid h-40 place-items-center"><Loader2 className="size-6 animate-spin text-[#00a884]" aria-label="Carregando conversas" /></div>
          ) : visible.length ? (
            <ul>
              {visible.map((conversation) => {
                const name = conversation.contactName || displayPhone(conversation.contactPhone) || (isGroup(conversation.contactPhone) ? 'Grupo' : 'Contato');
                const active = conversation.contactPhone === selectedPhone;
                const last = conversation.lastMessage;
                return (
                  <li key={conversation.contactPhone}>
                    <button
                      type="button"
                      onClick={() => setSelectedPhone(conversation.contactPhone)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00a884] ${active ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}`}
                    >
                      <ContactAvatar contactPhone={conversation.contactPhone} name={name} authHeaders={authHeaders} className="size-12" />
                      <span className="flex min-w-0 flex-1 flex-col border-b border-white/5 py-3">
                        <span className="flex items-baseline gap-2">
                          <b className="min-w-0 flex-1 truncate text-[15px] font-medium text-neutral-100">{name}</b>
                          <span className={`shrink-0 text-xs ${conversation.unread > 0 ? 'text-[#25d366]' : 'text-neutral-400'}`}>{last ? listTimeLabel(last.occurredAt) : ''}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-400">
                            {last ? <>{last.direction === 'outgoing' && <Check className="mr-1 inline size-3.5 align-[-2px]" aria-label="Enviada" />}{previewText(last.messageType, last.body)}</> : 'Sem mensagens ainda'}
                          </span>
                          {conversation.ticketKey && <span className="max-w-[45%] shrink-0 truncate rounded-full bg-[#53bdeb]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#53bdeb]">{splitTicketKeys(conversation.ticketKey).join(' · ')}</span>}
                          {conversation.unread > 0 && <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-bold text-[#111b21]">{conversation.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid place-items-center px-6 py-12 text-center">
              <MessageCircle className="size-7 text-neutral-500" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{conversations.length ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}</p>
              <p className="mt-1 text-xs text-neutral-400">{conversations.length ? 'Ajuste a pesquisa ou o filtro.' : 'Mensagens recebidas no WhatsApp da operação aparecem aqui automaticamente.'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {selected ? (
          <ConversationPane
            key={selected.contactPhone}
            conversation={selected}
            user={user}
            authHeaders={authHeaders}
            tickets={tickets}
            onBack={() => setSelectedPhone(null)}
            onUpdated={load}
            onOpenTicket={onOpenTicket}
          />
        ) : (
          <div className="grid flex-1 place-items-center border-b-4 border-[#00a884] bg-[#222e35] px-6 text-center">
            <div>
              <div className="mx-auto grid size-20 place-items-center rounded-full bg-[#00a884]/15 text-[#25d366]"><MessageCircle className="size-10" aria-hidden="true" /></div>
              <p className="mt-5 text-2xl font-light text-neutral-200">WhatsApp da operação</p>
              <p className="mt-2 max-w-sm text-sm text-neutral-400">Selecione uma conversa para ler e responder. As respostas saem com seu nome e cargo.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  </section>;
}

function ConversationPane({ conversation, user, authHeaders, tickets, onBack, onUpdated, onOpenTicket }: {
  conversation: Conversation; user: User; authHeaders: AuthHeaders; tickets: Ticket[];
  onBack: () => void; onUpdated: () => void; onOpenTicket: (ticketId: string) => void;
}) {
  const contactPhone = conversation.contactPhone;
  const basePath = `/api/whatsapp/conversations/${encodeURIComponent(contactPhone)}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [ticketKey, setTicketKey] = useState(conversation.ticketKey ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attaching, setAttaching] = useState<string | null>(null);
  const [colleaguesByEmail, setColleaguesByEmail] = useState<Record<string, Colleague>>({});
  const [presence, setPresence] = useState<Presence>({ state: null, photoUrl: null });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentAt = useRef(0);
  const recordingRef = useRef<Recording | null>(null);
  const lastMessageId = messages[messages.length - 1]?.id;
  const contactTyping = presence.state === 'composing' || presence.state === 'recording';

  useEffect(() => { setTicketKey(conversation.ticketKey ?? ''); }, [conversation.ticketKey]);

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

  // One request brings messages and the contact's typing state.
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`${basePath}/messages?presence=1`, { headers: await authHeaders(), cache: 'no-store' });
      // A background refresh that hits the rate limit just waits for the next one.
      if (response.status === 429) return;
      const payload = await response.json() as { messages?: Message[]; presence?: Presence; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar a conversa.');
      setMessages(payload.messages ?? []);
      if (payload.presence) setPresence(payload.presence);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a conversa.'); }
    finally { setLoading(false); }
  }, [user, basePath, authHeaders]);

  useVisiblePolling(load, 4_000);

  // Opening a conversation marks it read on the server; refresh the list badge.
  useEffect(() => { if (!loading) onUpdated(); }, [loading, onUpdated]);

  // Switching conversations unmounts this pane: never leave the mic open.
  useEffect(() => () => {
    const active = recordingRef.current;
    if (active) { active.cancelled = true; if (active.recorder.state !== 'inactive') active.recorder.stop(); }
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
    if (!recording) { setRecordingSeconds(0); return; }
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recording.startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  // Groups can be linked to several FSAs at once (taken from the group name).
  const linkedKeys = useMemo(() => splitTicketKeys(ticketKey), [ticketKey]);
  const linkedTickets = useMemo(() => tickets.filter((item) => linkedKeys.includes(item.id)), [linkedKeys, tickets]);

  const notifyPresence = useCallback(async (state: 'composing' | 'recording' | 'paused') => {
    if (!user) return;
    if (state !== 'paused') {
      if (Date.now() - lastTypingSentAt.current < 8_000) return;
      lastTypingSentAt.current = Date.now();
    } else {
      lastTypingSentAt.current = 0;
    }
    try {
      await fetch(`${basePath}/presence`, { method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ state }) });
    } catch { /* best-effort */ }
  }, [user, basePath, authHeaders]);

  async function sendText() {
    if (!user || !draft.trim() || sending) return;
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
    if (!user) return;
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

  function scrollToMessage(wamid: string | null) {
    if (!wamid) return;
    const element = scrollRef.current?.querySelector<HTMLElement>(`[data-wamid="${CSS.escape(wamid)}"]`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.animate([{ backgroundColor: 'rgba(37,211,102,.18)' }, { backgroundColor: 'transparent' }], { duration: 1400 });
  }

  async function addEvidence(message: Message, key: string, kind: 'evidence' | 'rat') {
    if (!user || attaching) return;
    setAttaching(message.wamid); setError(''); setNotice('');
    try {
      const response = await fetch(`${basePath}/evidence`, {
        method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ wamid: message.wamid, ticketKey: key, kind }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; storedForN1?: boolean };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível anexar a evidência.');
      const label = kind === 'rat' ? 'RAT anexado' : 'Evidência anexada';
      setNotice(`${label} no Jira da ${key}${payload.storedForN1 ? ' e na validação N1' : ''}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível anexar a evidência.'); }
    finally { setAttaching(null); }
  }

  async function link(nextTicketKey: string) {
    if (!user) return;
    try {
      const response = await fetch(basePath, {
        method: 'PATCH', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketKey: nextTicketKey }),
      });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error); }
      setTicketKey(nextTicketKey); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível vincular o chamado.'); }
  }

  const title = conversation.contactName || displayPhone(contactPhone) || (isGroup(contactPhone) ? 'Grupo' : 'Contato');
  const subtitle = presence.state === 'composing' ? 'digitando...' : presence.state === 'recording' ? 'gravando áudio...' : presence.state === 'available' ? 'online' : isGroup(contactPhone) ? 'grupo' : displayPhone(contactPhone);
  const canSend = Boolean(draft.trim() || pendingFile);

  return <>
    <div className="flex h-16 shrink-0 items-center gap-3 bg-[#202c33] px-3">
      <button type="button" onClick={onBack} className="grid size-9 place-items-center rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] md:hidden" aria-label="Voltar para as conversas">
        <ArrowLeft className="size-5" />
      </button>
      <ContactAvatar contactPhone={contactPhone} name={title} authHeaders={authHeaders} photoUrl={presence.photoUrl} className="size-10" />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] leading-tight font-semibold text-neutral-100">{title}</h3>
        <p className={`truncate text-xs ${contactTyping || presence.state === 'available' ? 'text-[#25d366]' : 'text-neutral-400'}`} aria-live="polite">{subtitle}</p>
      </div>
    </div>

    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/5 bg-[#111b21] px-3 py-2">
      <select value={linkedKeys.length > 1 ? '' : ticketKey} onChange={(event) => void link(event.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#2a3942] px-2 text-xs text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] md:max-w-sm" aria-label="Vincular a um chamado">
        <option value="">{linkedKeys.length > 1 ? `${linkedKeys.length} chamados vinculados` : 'Sem chamado vinculado'}</option>
        {tickets.slice(0, 200).map((item) => <option key={item.id} value={item.id}>{item.id} · {item.store}</option>)}
      </select>
      {linkedKeys.map((key) => linkedTickets.some((item) => item.id === key)
        ? <Button key={key} type="button" size="sm" variant="outline" className="h-8 border-white/10 bg-transparent text-neutral-200" onClick={() => onOpenTicket(key)}><Link2 className="size-3.5" />Abrir {key}</Button>
        : <span key={key} className="grid h-8 shrink-0 place-items-center rounded-lg border border-white/10 px-2 text-xs text-neutral-400" title="FSA fora da fila atual">{key}</span>)}
      {ticketKey && <Button type="button" size="sm" variant="ghost" className="h-8 text-neutral-300" onClick={() => void link('')} aria-label="Desvincular chamado"><Unlink className="size-3.5" /></Button>}
    </div>

    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 [background-image:radial-gradient(rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:18px_18px] md:px-[6%]" role="log" aria-label="Mensagens">
      {loading ? <Loader2 className="mx-auto mt-6 size-5 animate-spin text-[#00a884]" /> : messages.length ? (
        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            const outgoing = message.direction === 'outgoing';
            const agentSender = message.senderEmail ? senderLabel(message.senderEmail, colleaguesByEmail) : null;
            const day = dayLabel(message.occurredAt);
            const showDay = index === 0 || dayLabel(messages[index - 1].occurredAt) !== day;
            const isMedia = Boolean(MEDIA_TYPES[message.messageType]);
            const caption = message.messageType === 'document' ? null : message.body;
            // Group bubbles carry the sender's photo on the first message of
            // each run from that person, like WhatsApp.
            const groupIncoming = !outgoing && isGroup(contactPhone);
            const previous = messages[index - 1];
            const senderKey = message.senderJid || message.contactName || '';
            const firstOfRun = groupIncoming && (showDay || !previous || previous.direction === 'outgoing' || (previous.senderJid || previous.contactName || '') !== senderKey);
            const sender = agentSender ?? (firstOfRun ? message.contactName : null);
            return (
              <div key={message.wamid ?? message.id} data-wamid={message.wamid}>
                {showDay && <div className="my-2 flex justify-center"><span className="rounded-lg bg-[#182229] px-2.5 py-1 text-[11px] font-medium text-neutral-400 shadow-sm">{day}</span></div>}
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className={`mb-1 flex ${outgoing ? 'justify-end' : 'justify-start'} ${groupIncoming ? 'gap-2' : ''}`}
                >
                  {groupIncoming && (firstOfRun
                    ? (message.senderJid
                      ? <ContactAvatar contactPhone={message.senderJid} name={message.contactName || 'Participante'} authHeaders={authHeaders} className="size-8" />
                      : <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#00a884]/20 text-xs font-bold text-[#25d366]" aria-hidden="true">{initials(message.contactName || '#')}</div>)
                    : <div className="w-8 shrink-0" aria-hidden="true" />)}
                  <div
                    className={`relative max-w-[85%] px-1.5 pt-1.5 pb-1 text-[14px] leading-snug shadow-sm md:max-w-[65%] ${outgoing ? 'bg-[#005c4b]' : 'bg-[#202c33]'} ${message.messageType === 'sticker' ? '!bg-transparent !shadow-none' : ''}`}
                    style={{ borderRadius: outgoing ? '8px 0 8px 8px' : '0 8px 8px 8px' }}
                  >
                    {sender && <p className="mb-0.5 px-1 text-[12.5px] font-semibold text-[#53bdeb]">{sender}</p>}
                    {message.quotedBody && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(message.quotedWamid)}
                        className="mb-1 block w-full rounded-md border-l-4 border-[#06cf9c] bg-black/20 px-2 py-1 text-left hover:bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]"
                        aria-label="Ir para a mensagem respondida"
                      >
                        {message.quotedName && <span className="block truncate text-[12px] font-semibold text-[#06cf9c]">{message.quotedName}</span>}
                        <span className="line-clamp-2 text-[12.5px] text-neutral-300">{message.quotedBody}</span>
                      </button>
                    )}
                    {isMedia && (EVIDENCE_TYPES[message.messageType] && message.mediaId ? (
                      <ContextMenu>
                        <ContextMenuTrigger className="block select-auto"><MediaContent message={message} authHeaders={authHeaders} /></ContextMenuTrigger>
                        <ContextMenuContent className="min-w-52">
                          {linkedKeys.length ? (
                            ([['evidence', 'Adicionar como evidência'], ['rat', 'Adicionar como RAT']] as const)
                              .filter(([kind]) => kind === 'evidence' || canBeRat(message))
                              .map(([kind, label]) => (
                                <ContextMenuSub key={kind}>
                                  <ContextMenuSubTrigger disabled={Boolean(attaching)}>{kind === 'rat' ? <FileText /> : <ClipboardCheck />}{label}</ContextMenuSubTrigger>
                                  <ContextMenuSubContent>
                                    {/* Base UI throws (and blanks the page) if a label sits outside a Group. */}
                                    <ContextMenuGroup>
                                      <ContextMenuLabel>Anexar no Jira da FSA</ContextMenuLabel>
                                      {linkedKeys.map((key) => {
                                        const done = splitTicketKeys(message.evidenceTicketKeys).includes(key);
                                        return <ContextMenuItem key={key} disabled={done} onClick={() => void addEvidence(message, key, kind)}>{done && <Check />}{key}{done ? ' · já anexada' : ''}</ContextMenuItem>;
                                      })}
                                    </ContextMenuGroup>
                                  </ContextMenuSubContent>
                                </ContextMenuSub>
                              ))
                          ) : <ContextMenuItem disabled><ClipboardCheck />Vincule uma FSA para adicionar evidência</ContextMenuItem>}
                        </ContextMenuContent>
                      </ContextMenu>
                    ) : <MediaContent message={message} authHeaders={authHeaders} />)}
                    {attaching === message.wamid && <p className="mt-1 flex items-center gap-1.5 px-1 text-[12px] text-[#53bdeb]"><Loader2 className="size-3 animate-spin" />Anexando no Jira...</p>}
                    {message.evidenceTicketKeys && (
                      <div className="mt-1 flex flex-wrap gap-1 px-1">
                        {splitTicketKeys(message.evidenceTicketKeys).map((key) => <span key={key} className="inline-flex items-center gap-1 rounded-full bg-[#25d366]/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#25d366]"><ClipboardCheck className="size-3" aria-hidden="true" />Evidência · {key}</span>)}
                      </div>
                    )}
                    {!isMedia && message.messageType === 'location' && message.body && (
                      <a href={message.body} target="_blank" rel="noreferrer" className="block px-1 text-[#53bdeb] underline">📍 Ver localização</a>
                    )}
                    {!isMedia && message.messageType === 'contact' && <p className="px-1">👤 {message.body}</p>}
                    {(!isMedia && message.messageType !== 'location' && message.messageType !== 'contact') && (
                      <p className={`whitespace-pre-wrap break-words px-1 ${message.deletedAt ? 'text-neutral-400 line-through decoration-neutral-500' : 'text-neutral-100'}`}>{message.body || '[mensagem não suportada]'}</p>
                    )}
                    {isMedia && caption && <p className="mt-1 whitespace-pre-wrap break-words px-1 text-neutral-100">{caption}</p>}
                    {message.deletedAt && <p className="mt-0.5 px-1 text-[11.5px] text-neutral-400 italic">🚫 Apagada pelo remetente · mantida para registro</p>}
                    <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[11px] text-neutral-400">
                      {message.editedAt && !message.deletedAt && <span className="italic">editada</span>}
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
    {notice && !error && <p role="status" className="shrink-0 bg-[#111b21] px-4 pt-2 text-xs text-[#25d366]">{notice}</p>}

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
  </>;
}

// Refreshes right away, then every `intervalMs` while the tab is visible, and
// again as soon as it becomes visible. Every authenticated API call counts
// toward a per-IP limit shared by the whole app, so hidden tabs stay quiet.
function useVisiblePolling(callback: () => void | Promise<void>, intervalMs: number) {
  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      void callback();
      timer = window.setInterval(() => void callback(), intervalMs);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', start); };
  }, [callback, intervalMs]);
}

// Profile photos are looked up once per contact (only when the row scrolls
// into view) and shared between the list and the open conversation.
const photoCache = new Map<string, Promise<string | null>>();

function ContactAvatar({ contactPhone, name, authHeaders, photoUrl, className }: {
  contactPhone: string; name: string; authHeaders: AuthHeaders; photoUrl?: string | null; className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(photoUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (photoUrl) { setUrl(photoUrl); setFailed(false); } }, [photoUrl]);

  useEffect(() => {
    if (photoUrl !== undefined) return;
    const element = ref.current;
    if (!element) return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      let pending = photoCache.get(contactPhone);
      if (!pending) {
        pending = (async () => {
          const response = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(contactPhone)}/presence?photo=1`, { headers: await authHeaders(), cache: 'no-store' });
          if (!response.ok) return null;
          return (await response.json() as Presence).photoUrl ?? null;
        })().catch(() => null);
        photoCache.set(contactPhone, pending);
      }
      void pending.then((value) => { if (active) setUrl(value); });
    });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, [contactPhone, authHeaders, photoUrl]);

  return (
    <div ref={ref} className={`${className} shrink-0 overflow-hidden rounded-full`}>
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center bg-[#00a884]/20 text-sm font-bold text-[#25d366]" aria-hidden="true">{initials(name)}</div>
      )}
    </div>
  );
}

const MEDIA_TYPES: Record<string, true> = { image: true, video: true, audio: true, document: true, sticker: true };
// Media that can be attached to an FSA as evidence (right-click menu).
const EVIDENCE_TYPES: Record<string, true> = { image: true, video: true, document: true };

// A RAT is a photo of the signed form or its PDF.
function canBeRat(message: Message) {
  return message.messageType === 'image' || (message.messageType === 'document' && /\.pdf$/i.test(message.body ?? ''));
}

// Media needs the Firebase token, so it can't be a plain <img src>: fetch it
// once per session and hand the element a blob URL.
const mediaCache = new Map<string, Promise<{ url: string; fileName: string | null }>>();

function useMediaUrl(mediaId: string | null, authHeaders: AuthHeaders) {
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

function MediaContent({ message, authHeaders }: { message: Message; authHeaders: AuthHeaders }) {
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
  const role = colleague?.role && isUserRole(colleague.role) ? roleLabels[colleague.role] : null;
  return whatsappSenderLabel(email, colleague?.displayName, role);
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

function isGroup(jid: string) { return jid.endsWith('@g.us'); }

function bridgeWarningText(bridge: BridgeHealth | null) {
  if (!bridge || bridge.status === 'open') return '';
  if (bridge.status === 'logged_out' || bridge.status === 'qr') return 'WhatsApp desconectado: a sessão do bridge foi encerrada. Mensagens novas não estão chegando — é preciso escanear o QR code de novo.';
  if (bridge.status === 'unreachable') return 'Bridge do WhatsApp fora do ar. Mensagens novas não estão chegando e respostas não saem.';
  const since = bridge.since ? Date.parse(bridge.since) : Number.NaN;
  if (!Number.isNaN(since) && Date.now() - since < RECONNECT_GRACE_MS) return '';
  return 'WhatsApp reconectando. Mensagens novas podem atrasar.';
}

// "@lid" and group ("@g.us") identifiers are opaque WhatsApp IDs, not phone numbers.
function displayPhone(jid: string) {
  if (!jid || jid.endsWith('@lid') || isGroup(jid)) return '';
  const digits = jid.replace(/@.*$/, '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
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

function listTimeLabel(iso: string) {
  const day = dayLabel(iso);
  return day === 'Hoje' ? timeLabel(iso) : day;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
