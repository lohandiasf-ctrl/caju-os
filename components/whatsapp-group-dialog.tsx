'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageCirclePlus, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { participantJid, WHATSAPP_GROUP_NAME_MAX, whatsappGroupName, type GroupNameTicket } from '@/lib/whatsapp-group-name';

type User = { getIdToken: () => Promise<string> } | null;
type Contact = { jid: string; name: string };

// Creates a WhatsApp group from the selected tickets: name suggested from the
// operation's pattern (editable), participants picked from the inbox contacts
// or typed as phone numbers.
export function WhatsAppGroupDialog({ open, onOpenChange, tickets, user }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tickets: Array<GroupNameTicket & { title?: string }>;
  user: User;
}) {
  const [subject, setSubject] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ subject: string; missing: string[] } | null>(null);

  // The ticket list refreshes in the background; only suggest the name when
  // the dialog opens, so an edit in progress isn't overwritten.
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;

  useEffect(() => {
    if (!open) return;
    setSubject(whatsappGroupName(ticketsRef.current)); setSelected([]); setQuery(''); setPhone(''); setError(''); setCreated(null);
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/whatsapp/conversations', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const payload = await response.json() as { conversations?: Array<{ contactPhone: string; contactName: string | null }> };
        if (!active || !response.ok) return;
        setContacts((payload.conversations ?? [])
          .filter((item) => !item.contactPhone.endsWith('@g.us'))
          .map((item) => ({ jid: item.contactPhone, name: item.contactName || displayJid(item.contactPhone) })));
      } catch { /* Typing numbers still works without the contact list. */ }
    })();
    return () => { active = false; };
  }, [open, user]);

  const matches = useMemo(() => {
    const term = normalize(query);
    return contacts
      .filter((contact) => !selected.some((item) => item.jid === contact.jid))
      .filter((contact) => !term || normalize(`${contact.name} ${displayJid(contact.jid)}`).includes(term))
      .slice(0, 6);
  }, [contacts, selected, query]);

  function add(contact: Contact) {
    setSelected((current) => (current.some((item) => item.jid === contact.jid) ? current : [...current, contact]));
    setQuery('');
  }

  function addPhone() {
    const jid = participantJid(phone);
    if (!jid) { setError('Número inválido. Use DDD + número, ex.: (73) 98818-1339.'); return; }
    setError(''); add({ jid, name: displayJid(jid) }); setPhone('');
  }

  async function create() {
    if (!user || saving) return;
    if (!subject.trim()) { setError('Informe o nome do grupo.'); return; }
    if (!selected.length) { setError('Adicione ao menos um participante.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/whatsapp/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), participants: selected.map((item) => item.jid), ticketKeys: tickets.map((ticket) => ticket.id) }),
      });
      const payload = await response.json().catch(() => ({})) as { subject?: string; missing?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível criar o grupo.');
      setCreated({ subject: payload.subject ?? subject.trim(), missing: (payload.missing ?? []).map((jid) => selected.find((item) => item.jid === jid)?.name ?? displayJid(jid)) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar o grupo.'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageCirclePlus className="size-5 text-emerald-300" />Criar grupo no WhatsApp</DialogTitle>
          <DialogDescription>O grupo sai do número da operação. Ele aparece no WhatsApp do sistema com {tickets.length === 1 ? 'a FSA vinculada' : 'as FSAs vinculadas'}.</DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-200"><CheckCircle2 className="size-4" />Grupo criado</p>
            <p className="mt-1 break-words">{created.subject}</p>
            {created.missing.length > 0 && <p className="mt-2 text-amber-200">Não foi possível adicionar: {created.missing.join(', ')}. Confira se o número tem WhatsApp ou adicione pelo celular.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="whatsapp-group-subject" className="mb-1 block text-sm font-semibold">Nome do grupo</label>
              <Input id="whatsapp-group-subject" value={subject} maxLength={WHATSAPP_GROUP_NAME_MAX} onChange={(event) => setSubject(event.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Sugestão: data/hora do agendamento · 4 consoantes da cidade/UF · cliente e loja · FSAs. {subject.length}/{WHATSAPP_GROUP_NAME_MAX}</p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold">Participantes</p>
              {selected.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {selected.map((contact) => (
                    <li key={contact.jid} className="flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-400/10 py-0.5 pr-1 pl-2.5 text-xs text-emerald-100">
                      {contact.name}
                      <button type="button" onClick={() => setSelected((current) => current.filter((item) => item.jid !== contact.jid))} className="grid size-5 place-items-center rounded-full hover:bg-white/10" aria-label={`Remover ${contact.name}`}><X className="size-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar contato do WhatsApp" aria-label="Buscar contato do WhatsApp" className="pl-9" />
              </div>
              {(query || matches.length > 0) && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border">
                  {matches.length ? matches.map((contact) => (
                    <li key={contact.jid}>
                      <button type="button" onClick={() => add(contact)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                        <span className="truncate">{contact.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{displayJid(contact.jid)}</span>
                      </button>
                    </li>
                  )) : <li className="px-3 py-2 text-xs text-muted-foreground">Nenhum contato encontrado. Digite o número abaixo.</li>}
                </ul>
              )}
              <div className="mt-2 flex gap-2">
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addPhone(); } }} placeholder="Ou digite o número com DDD" aria-label="Número do participante" inputMode="tel" />
                <Button type="button" variant="outline" onClick={addPhone}><Plus />Adicionar</Button>
              </div>
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}

        <DialogFooter>
          {created ? <Button type="button" onClick={() => onOpenChange(false)}>Fechar</Button> : <>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" disabled={saving || !selected.length || !subject.trim()} onClick={() => void create()}>
              {saving ? <Loader2 className="animate-spin" /> : <MessageCirclePlus />}Criar grupo
            </Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "@lid" identifiers are opaque WhatsApp IDs, not phone numbers.
function displayJid(jid: string) {
  if (jid.endsWith('@lid')) return 'contato do WhatsApp';
  const digits = jid.replace(/@.*$/, '').replace(/\D/g, '');
  return digits ? `+${digits}` : jid;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
}
