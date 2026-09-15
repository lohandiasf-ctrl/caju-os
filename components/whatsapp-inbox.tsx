'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, MessageCircle, Send, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  return <Dialog open={Boolean(conversation)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[min(88dvh,760px)] flex-col overflow-hidden sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{conversation?.contactName || conversation?.contactPhone}</DialogTitle>
        <DialogDescription>{conversation?.contactPhone}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <select value={ticketKey} onChange={(event) => void link(event.target.value)} className="field h-9 flex-1 text-xs" aria-label="Vincular a um chamado">
          <option value="">Sem chamado vinculado</option>
          {tickets.slice(0, 200).map((item) => <option key={item.id} value={item.id}>{item.id} · {item.store}</option>)}
        </select>
        {ticket && <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { onClose(); onOpenTicket(ticket.id); }}><Link2 className="size-3.5" />Abrir {ticket.id}</Button>}
        {ticketKey && <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => void link('')} aria-label="Desvincular chamado"><Unlink className="size-3.5" /></Button>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3" role="log" aria-label="Mensagens">
        {loading ? <Loader2 className="mx-auto size-5 animate-spin text-primary" /> : messages.length ? messages.map((message) => {
          const sender = message.senderEmail ? senderLabel(message.senderEmail, colleaguesByEmail) : null;
          return (
            <div key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.direction === 'outgoing' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {sender && <p className="mb-0.5 text-[11px] font-bold opacity-80">{sender}</p>}
              <p className="whitespace-pre-wrap break-words">{message.body || `[${message.messageType}]`}</p>
              <p className="mt-1 text-[10px] opacity-70">{new Date(message.occurredAt).toLocaleString('pt-BR')}</p>
            </div>
          );
        }) : <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>}
      </div>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <div className="flex gap-2 border-t border-border pt-3">
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Responder pelo WhatsApp..." disabled={sending} className="min-h-11" />
        <Button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} className="min-h-11">{sending ? <Loader2 className="animate-spin" /> : <Send />}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
