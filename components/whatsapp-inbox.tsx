'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, Link2, Loader2, MessageCircle, Send, Unlink } from 'lucide-react';
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
type Message = { id: number; direction: string; messageType: string; body: string | null; senderEmail: string | null; occurredAt: string };
type Colleague = { email: string; role: string | null; displayName: string | null };

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
                    <b className="text-sm">{conversation.contactName || conversation.contactPhone}</b>
                    {conversation.ticketKey && <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{conversation.ticketKey}</span>}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.lastMessage?.direction === 'outgoing' ? 'Você: ' : ''}{conversation.lastMessage?.body || messageTypeLabel(conversation.lastMessage?.messageType)}</span>
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

function senderLabel(email: string, colleaguesByEmail: Record<string, Colleague>) {
  const colleague = colleaguesByEmail[email];
  const firstName = (colleague?.displayName || email.split('@')[0]).trim().split(/\s+/)[0];
  const role = colleague?.role && isUserRole(colleague.role) ? roleLabels[colleague.role] : null;
  return role ? `${firstName} · ${role}` : firstName;
}

function messageTypeLabel(type?: string) {
  if (!type) return 'Sem mensagens ainda';
  if (type === 'text') return '';
  return `[${type}]`;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastMessageId, loading]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const response = await fetch('/api/colleagues', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { colleagues?: Colleague[] };
      setColleaguesByEmail(Object.fromEntries((payload.colleagues ?? []).map((item) => [item.email, item])));
    })();
  }, [user]);

  const load = useCallback(async () => {
    if (!user || !conversation) return;
    try {
      const response = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(conversation.contactPhone)}/messages`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível carregar a conversa.');
      setMessages(payload.messages ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a conversa.'); }
    finally { setLoading(false); }
  }, [conversation, user]);

  useEffect(() => {
    if (!conversation) { setMessages([]); return; }
    setTicketKey(conversation.ticketKey ?? ''); setLoading(true); setError('');
    void load();
    const timer = window.setInterval(() => void load(), 8_000);
    return () => window.clearInterval(timer);
  }, [conversation, load]);

  const ticket = useMemo(() => tickets.find((item) => item.id === conversation?.ticketKey), [conversation, tickets]);

  async function send() {
    if (!user || !conversation || !draft.trim() || sending) return;
    setSending(true); setError('');
    try {
      const response = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(conversation.contactPhone)}/send`, {
        method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível enviar a mensagem.');
      setDraft(''); await load(); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a mensagem.'); }
    finally { setSending(false); }
  }

  async function link(nextTicketKey: string) {
    if (!user || !conversation) return;
    try {
      const response = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(conversation.contactPhone)}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketKey: nextTicketKey }),
      });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error); }
      setTicketKey(nextTicketKey); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível vincular o chamado.'); }
  }

  const title = conversation?.contactName || conversation?.contactPhone || '';

  return <Dialog open={Boolean(conversation)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex h-[min(88dvh,760px)] flex-col gap-0 overflow-hidden bg-[#0b141a] p-0 text-neutral-100 ring-white/10 sm:max-w-lg">
      <div className="flex shrink-0 items-center gap-2.5 bg-[#202c33] px-3 py-2.5">
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]" aria-label="Fechar conversa">
          <ArrowLeft className="size-5" />
        </button>
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#00a884]/20 text-sm font-bold text-[#25d366]" aria-hidden="true">
          {initials(title)}
        </div>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-[15px] leading-tight font-semibold text-neutral-100">{title}</DialogTitle>
          <DialogDescription className="truncate text-xs text-neutral-400">{conversation?.contactPhone}</DialogDescription>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 bg-[#111b21] px-3 py-2">
        <select value={ticketKey} onChange={(event) => void link(event.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#2a3942] px-2 text-xs text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]" aria-label="Vincular a um chamado">
          <option value="">Sem chamado vinculado</option>
          {tickets.slice(0, 200).map((item) => <option key={item.id} value={item.id}>{item.id} · {item.store}</option>)}
        </select>
        {ticket && <Button type="button" size="sm" variant="outline" className="h-8 border-white/10 bg-transparent text-neutral-200" onClick={() => { onClose(); onOpenTicket(ticket.id); }}><Link2 className="size-3.5" />Abrir {ticket.id}</Button>}
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
              return (
                <div key={message.id}>
                  {showDay && <div className="my-2 flex justify-center"><span className="rounded-lg bg-[#182229] px-2.5 py-1 text-[11px] font-medium text-neutral-400 shadow-sm">{day}</span></div>}
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className={`mb-1 flex ${outgoing ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`relative max-w-[85%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14px] leading-snug shadow-sm ${outgoing ? 'rounded-tr-none bg-[#005c4b]' : 'rounded-tl-none bg-[#202c33]'}`}>
                      {sender && <p className="mb-0.5 text-[12.5px] font-semibold text-[#53bdeb]">{sender}</p>}
                      <p className="whitespace-pre-wrap break-words text-neutral-100">{message.body || `[${message.messageType}]`}</p>
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-neutral-400">
                        <span>{timeLabel(message.occurredAt)}</span>
                        {outgoing && <Check className="size-3.5" aria-label="Enviada" />}
                      </div>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </AnimatePresence>
        ) : <p className="mt-6 text-center text-sm text-neutral-400">Nenhuma mensagem ainda.</p>}
      </div>

      {error && <p role="alert" className="shrink-0 bg-[#111b21] px-4 pt-2 text-xs text-rose-300">{error}</p>}
      <div className="flex shrink-0 items-center gap-2 bg-[#202c33] px-3 py-2.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
          placeholder="Mensagem"
          disabled={sending}
          aria-label="Responder pelo WhatsApp"
          className="h-11 min-w-0 flex-1 rounded-full bg-[#2a3942] px-4 text-[15px] text-neutral-100 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] disabled:opacity-60"
        />
        <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} aria-label="Enviar" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50">
          {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </button>
      </div>
    </DialogContent>
  </Dialog>;
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
