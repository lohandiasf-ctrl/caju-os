'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ImageOff, Loader2, MessageCirclePlus, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WHATSAPP_GROUP_PHOTOS, whatsappGroupPhotoSrc, type WhatsappGroupPhotoId } from '@/lib/whatsapp-group-photos';
import { groupTicketsConflict, participantJid, WHATSAPP_GROUP_NAME_MAX, whatsappGroupName, type GroupNameTicket } from '@/lib/whatsapp-group-name';

type User = { getIdToken: () => Promise<string> } | null;
type Contact = { jid: string; name: string; phone?: string | null };

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
  const [photo, setPhoto] = useState<WhatsappGroupPhotoId | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState('');
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [savingJid, setSavingJid] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ subject: string; missing: string[]; photoFailed: boolean } | null>(null);

  // The ticket list refreshes in the background; only suggest the name when
  // the dialog opens, so an edit in progress isn't overwritten.
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;

  const loadContacts = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/whatsapp/groups', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as { contacts?: Array<{ jid: string; name: string | null; phone: string | null }> };
      if (!response.ok) return;
      setContacts((payload.contacts ?? []).map((item) => ({ jid: item.jid, name: item.name || displayJid(item.phone ?? item.jid), phone: item.phone })));
    } catch { /* Typing numbers still works without the contact list. */ }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setSubject(whatsappGroupName(ticketsRef.current)); setPhoto(null); setSelected([]); setQuery(''); setPhone(''); setError(''); setCreated(null);
    void loadContacts();
  }, [open, loadContacts]);

  // One group per visit: same city, same schedule.
  const conflict = useMemo(() => groupTicketsConflict(tickets), [tickets]);

  const matches = useMemo(() => {
    const term = normalize(query);
    return contacts
      .filter((contact) => !selected.some((item) => item.jid === contact.jid))
      .filter((contact) => !term || normalize(`${contact.name} ${displayJid(contact.jid)}`).includes(term))
      .slice(0, 6);
  }, [contacts, selected, query]);

  // Pulls the WhatsApp address book, which is where most numbers come from.
  async function syncContacts() {
    if (!user || syncing) return;
    setSyncing(true); setError('');
    try {
      const response = await fetch('/api/whatsapp/contacts', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const payload = await response.json().catch(() => ({})) as { learned?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível sincronizar os contatos.');
      await loadContacts();
      if (!payload.learned) setError('O WhatsApp não trouxe números novos. Informe o número ao lado do contato.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível sincronizar os contatos.'); }
    finally { setSyncing(false); }
  }

  // Saving the number on the conversation keeps it for the next groups too.
  async function saveNumber(contact: Contact) {
    if (!user || savingJid) return;
    const typed = (numbers[contact.jid] ?? '').trim();
    const jid = participantJid(typed);
    if (!jid) { setError('Número inválido. Use DDD + número, ex.: (73) 98818-1339.'); return; }
    setSavingJid(contact.jid); setError('');
    try {
      const response = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(contact.jid)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneJid: typed }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Não foi possível salvar o número.');
      setContacts((current) => current.map((item) => (item.jid === contact.jid ? { ...item, phone: jid } : item)));
      add({ ...contact, phone: jid });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o número.'); }
    finally { setSavingJid(null); }
  }

  function add(contact: Contact & { phone?: string | null }) {
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
        body: JSON.stringify({ subject: subject.trim(), photo, participants: selected.map((item) => item.jid), ticketKeys: tickets.map((ticket) => ticket.id) }),
      });
      const payload = await response.json().catch(() => ({})) as { subject?: string; missing?: string[]; unknown?: string[]; photoSet?: boolean; error?: string };
      if (!response.ok) {
        // Contacts the bridge only knows by "@lid" have to be typed as phones.
        const pending = (payload.unknown ?? []).map((jid) => selected.find((item) => item.jid === jid)?.name ?? displayJid(jid));
        throw new Error(pending.length ? `${payload.error ?? 'Não foi possível criar o grupo.'} Faltam: ${pending.join(', ')}.` : payload.error ?? 'Não foi possível criar o grupo.');
      }
      setCreated({ subject: payload.subject ?? subject.trim(), photoFailed: Boolean(photo) && payload.photoSet === false, missing: (payload.missing ?? []).map((jid) => selected.find((item) => item.jid === jid)?.name ?? displayJid(jid)) });
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
            {created.photoFailed && <p className="mt-2 text-amber-200">A foto do grupo não foi aplicada. Defina pelo celular, se precisar.</p>}
            {created.missing.length > 0 && <p className="mt-2 text-amber-200">Não foi possível adicionar: {created.missing.join(', ')}. Confira se o número tem WhatsApp ou adicione pelo celular.</p>}
          </div>
        ) : conflict ? (
          <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{conflict}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="whatsapp-group-subject" className="mb-1 block text-sm font-semibold">Nome do grupo</label>
              <Input id="whatsapp-group-subject" value={subject} maxLength={WHATSAPP_GROUP_NAME_MAX} onChange={(event) => setSubject(event.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Sugestão: data/hora do agendamento · 4 consoantes da cidade/UF · cliente e loja · FSAs. {subject.length}/{WHATSAPP_GROUP_NAME_MAX}</p>
            </div>

            <fieldset>
              <legend className="mb-1 text-sm font-semibold">Foto do grupo</legend>
              <div role="radiogroup" aria-label="Foto do grupo" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <PhotoOption selected={photo === null} label="Sem foto" onSelect={() => setPhoto(null)}>
                  <span className="grid size-full place-items-center bg-white/5 text-muted-foreground"><ImageOff className="size-6" /></span>
                </PhotoOption>
                {WHATSAPP_GROUP_PHOTOS.map((item) => (
                  <PhotoOption key={item.id} selected={photo === item.id} label={item.label} onSelect={() => setPhoto(item.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={whatsappGroupPhotoSrc(item.id)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                  </PhotoOption>
                ))}
              </div>
            </fieldset>

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
              <div className="relative flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar contato do WhatsApp" aria-label="Buscar contato do WhatsApp" className="pl-9" />
                </div>
                <Button type="button" variant="outline" disabled={syncing} onClick={() => void syncContacts()} title="Buscar os números na agenda do WhatsApp">
                  {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}Buscar números
                </Button>
              </div>
              {(query || matches.length > 0) && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border">
                  {matches.length ? matches.map((contact) => (
                    <li key={contact.jid}>
                      {contact.phone ? (
                        <button type="button" onClick={() => add(contact)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent">
                          <span className="truncate">{contact.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{displayJid(contact.phone)}</span>
                        </button>
                      ) : (
                        // WhatsApp never told us this contact's number; saved once here, it stays.
                        <div className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{contact.name}</span>
                          <Input
                            value={numbers[contact.jid] ?? ''}
                            onChange={(event) => setNumbers((current) => ({ ...current, [contact.jid]: event.target.value }))}
                            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveNumber(contact); } }}
                            placeholder="número com DDD"
                            aria-label={`Número de ${contact.name}`}
                            inputMode="tel"
                            className="h-8 w-40"
                          />
                          <Button type="button" size="sm" variant="outline" className="h-8" disabled={savingJid === contact.jid} onClick={() => void saveNumber(contact)}>
                            {savingJid === contact.jid ? <Loader2 className="size-3.5 animate-spin" /> : 'Salvar'}
                          </Button>
                        </div>
                      )}
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
            <Button type="button" disabled={saving || Boolean(conflict) || !selected.length || !subject.trim()} onClick={() => void create()}>
              {saving ? <Loader2 className="animate-spin" /> : <MessageCirclePlus />}Criar grupo
            </Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One square choice in the group photo picker.
function PhotoOption({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={`relative aspect-square overflow-hidden rounded-xl border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${selected ? 'border-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.18)]' : 'border-transparent opacity-80 hover:opacity-100'}`}
    >
      {children}
      {selected && <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-emerald-400 text-emerald-950"><Check className="size-3.5" strokeWidth={3} /></span>}
    </button>
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
