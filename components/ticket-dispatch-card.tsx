"use client";

// Oferta do chamado pelo WhatsApp, na tela do chamado (gerência, coordenação e
// analistas): se já saiu, quantos técnicos receberam e o botão para oferecer
// ou reenviar (/api/dispatch/tickets/{key}; o mesmo do app). Na oferta manual
// dá para anexar outros chamados da mesma cidade e mudar o valor.

import { useEffect, useState } from "react";
import { Loader2, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TicketOffer = {
  offerId: number; status: string; mode: string; createdAt: string; expiresAt: string; assignedTo: string | null;
  holdReasons: string[]; counts: Record<string, number>; total: number;
} | null;
type Nearby = { key: string; store: string | null; status: string; technician: string | null; summary: string };

const STATUS: Record<string, string> = { open: "Aberta", assigned: "Aceita", expired: "Expirou", held: "Retida", cancelled: "Cancelada" };
const DEFAULT_VALUE = "a combinar com a equipe";
const KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const when = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

function summary(o: NonNullable<TicketOffer>) {
  const n = (k: string) => o.counts[k] ?? 0;
  return [
    `${o.total} ${o.total === 1 ? "técnico" : "técnicos"}`,
    n("delivered") && `${n("delivered")} entregues`, n("read") && `${n("read")} leram`,
    n("clicked") && `${n("clicked")} aceitou`, n("declined") && `${n("declined")} recusaram`,
    n("failed") && `${n("failed")} falharam`, n("skipped") && `${n("skipped")} fora da lista de teste`,
  ].filter(Boolean).join(" · ");
}

export function TicketDispatchCard({ ticketKey, technician, user }: {
  ticketKey: string;
  /** Técnico atual do chamado, para o aviso antes de enviar. */
  technician?: string | null;
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [data, setData] = useState<{ mode: string; offer: TicketOffer } | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  // Painel da oferta manual.
  const [open, setOpen] = useState(false);
  const [nearby, setNearby] = useState<{ city: string | null; tickets: Nearby[]; valueAllowed: boolean } | null>(null);
  const [nearbyError, setNearbyError] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [customValue, setCustomValue] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    void user.getIdToken().then((token) => fetch(`/api/dispatch/tickets/${encodeURIComponent(ticketKey)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    })).then(async (response) => {
      const payload = await response.json() as { mode: string; offer: TicketOffer; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível consultar a oferta.");
      if (active) setData(payload);
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Não foi possível consultar a oferta."); });
    return () => { active = false; };
  }, [ticketKey, user, refresh]);

  if (data?.mode === "off") return null;
  const offer = data?.offer ?? null;
  const again = !!offer && offer.status !== "cancelled";

  async function openPanel() {
    setOpen(true);
    setMessage("");
    if (nearby || !user) return;
    try {
      const response = await fetch(`/api/dispatch/tickets/${encodeURIComponent(ticketKey)}/nearby`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const body = await response.json() as { city: string | null; tickets: Nearby[]; valueAllowed: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível buscar os chamados da cidade.");
      setNearby(body);
    } catch (error) {
      setNearbyError(error instanceof Error ? error.message : "Não foi possível buscar os chamados da cidade.");
    }
  }

  function toggle(key: string) {
    setExtra((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  function addTyped() {
    const key = typed.trim().toUpperCase();
    if (!KEY.test(key)) { setMessage("Digite o número do chamado, por exemplo FSA-133491."); return; }
    if (key === ticketKey) { setMessage("Este já é o chamado da oferta."); return; }
    setExtra((list) => (list.includes(key) ? list : [...list, key]));
    setTyped("");
    setMessage("");
  }

  async function send() {
    if (!user || sending) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/dispatch/tickets/${encodeURIComponent(ticketKey)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ extra, value: customValue ? value : null }),
      });
      const body = await response.json().catch(() => ({})) as { status?: string; sent?: number; reason?: string; error?: string };
      if (!response.ok) { setMessage(body.error ?? "Não foi possível oferecer o chamado."); return; }
      if (body.status === "held") setMessage("A oferta ficou retida. Veja o motivo abaixo.");
      else if (data?.mode === "dry_run") setMessage("Oferta criada como simulação. Nada foi enviado.");
      else if (!body.sent) setMessage(`Nenhuma mensagem saiu${body.reason ? `: ${body.reason}` : "."}`);
      else setMessage(`Oferta enviada para ${body.sent} ${body.sent === 1 ? "técnico" : "técnicos"}.`);
      setOpen(false);
      setExtra([]);
      setCustomValue(false);
      setValue("");
      setRefresh((n) => n + 1);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="surface-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">Oferta no WhatsApp</p>
          {!data ? (
            <p className="mt-1 text-sm text-muted-foreground">{message ? "" : "Consultando a oferta…"}</p>
          ) : offer ? (
            <div className="mt-1 space-y-0.5 text-sm">
              <p className="font-semibold">{STATUS[offer.status] ?? offer.status} · {when(offer.createdAt)}</p>
              {offer.assignedTo && <p>Aceita por {offer.assignedTo}</p>}
              {offer.total > 0 && <p className="text-xs text-muted-foreground">{summary(offer)}</p>}
              {!!offer.holdReasons.length && <p className="text-xs text-warning">Retida: {offer.holdReasons.join(" · ")}</p>}
            </div>
          ) : <p className="mt-1 text-sm text-muted-foreground">Este chamado ainda não foi oferecido aos técnicos.</p>}
        </div>
        {data && !open && (
          <Button size="sm" variant="outline" onClick={() => void openPanel()}>
            <Send />{again ? "Reenviar aos técnicos" : "Oferecer aos técnicos"}
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-semibold">Anexar outros chamados{nearby?.city ? ` de ${nearby.city}` : ""}</p>
            <p className="text-xs text-muted-foreground">Saem na mesma oferta, e quem aceitar fica com todos. Só chamados da mesma cidade.</p>
            <div className="mt-2 flex gap-2">
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }}
                placeholder="Digite o FSA, ex.: FSA-133491" className="max-w-64" aria-label="Número do chamado para anexar" />
              <Button type="button" size="sm" variant="outline" onClick={addTyped}><Plus />Anexar</Button>
            </div>
            {!!extra.length && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {extra.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-2 py-0.5 font-mono text-xs text-primary">
                    {k}<button type="button" aria-label={`Tirar ${k}`} onClick={() => toggle(k)}><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
            {nearbyError ? <p className="mt-2 text-xs text-danger">{nearbyError}</p> : !nearby ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Buscando chamados da cidade…</p>
            ) : nearby.tickets.length ? (
              <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border text-sm">
                {nearby.tickets.map((t) => (
                  <li key={t.key} className="border-b border-border last:border-0">
                    <label className="flex cursor-pointer items-start gap-2 px-3 py-2">
                      <input type="checkbox" className="mt-1" aria-label={`Anexar ${t.key}`} checked={extra.includes(t.key)} onChange={() => toggle(t.key)} />
                      <span className="min-w-0">
                        <span className="font-mono text-xs text-primary">{t.key}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{t.store ?? "Loja não informada"} · {t.status}{t.technician ? ` · ${t.technician}` : ""}</span>
                        <span className="block truncate text-xs">{t.summary}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-muted-foreground">Nenhum outro chamado aberto nesta cidade.</p>}
          </div>

          <div>
            <p className="text-sm font-semibold">Valor</p>
            <div className="mt-1 space-y-1 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={!customValue} onChange={() => setCustomValue(false)} />{nearby?.valueAllowed ? `Manter o padrão (${DEFAULT_VALUE})` : "Manter o padrão do modelo em uso"}</label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={customValue} disabled={!nearby?.valueAllowed} onChange={() => setCustomValue(true)} />Outro valor
                {customValue && <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} placeholder="Ex.: R$ 90,00" className="h-8 max-w-40" aria-label="Valor da oferta" />}
              </label>
              {nearby && !nearby.valueAllowed && (
                <p className="text-xs text-muted-foreground">O valor personalizado fica disponível quando a Meta aprovar o modelo novo (oferta_valor, em análise). Até lá, a oferta sai com o valor padrão do modelo em uso.</p>
              )}
            </div>
          </div>

          {technician && <p className="text-xs text-muted-foreground">{technician} continua no chamado até outro técnico aceitar; quem aceitar passa a ficar com ele no Caju OS e no Jira.</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void send()} disabled={sending || (customValue && !value.trim())}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}Enviar oferta{extra.length ? ` (${extra.length + 1} chamados)` : ""}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setOpen(false); setMessage(""); }} disabled={sending}>Cancelar</Button>
          </div>
        </div>
      )}
      {message && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </section>
  );
}
