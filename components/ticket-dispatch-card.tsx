"use client";

// Oferta do chamado pelo WhatsApp, na tela do chamado (gerência, coordenação e
// analistas): se já saiu, quantos técnicos receberam e o botão para oferecer
// ou reenviar (/api/dispatch/tickets/{key}; o mesmo do app).

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type TicketOffer = {
  offerId: number; status: string; mode: string; createdAt: string; expiresAt: string; assignedTo: string | null;
  holdReasons: string[]; counts: Record<string, number>; total: number;
} | null;

const STATUS: Record<string, string> = { open: "Aberta", assigned: "Aceita", expired: "Expirou", held: "Retida", cancelled: "Cancelada" };
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
  /** Técnico atual do chamado, para o aviso da confirmação. */
  technician?: string | null;
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [data, setData] = useState<{ mode: string; offer: TicketOffer } | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [refresh, setRefresh] = useState(0);

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

  async function send() {
    if (!user || sending) return;
    const text = [
      again ? "Sai uma nova oferta pelo WhatsApp para os técnicos da cidade, com prazo de 2 horas." : "Sai uma oferta pelo WhatsApp para os técnicos da cidade. O primeiro que aceitar fica com o chamado.",
      technician ? `${technician} continua no chamado até outro técnico aceitar; quem aceitar passa a ficar com ele no Caju OS e no Jira.` : "",
    ].filter(Boolean).join("\n\n");
    if (!window.confirm(text)) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/dispatch/tickets/${encodeURIComponent(ticketKey)}`, { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const body = await response.json().catch(() => ({})) as { status?: string; sent?: number; reason?: string; error?: string };
      if (!response.ok) setMessage(body.error ?? "Não foi possível oferecer o chamado.");
      else if (body.status === "held") setMessage("A oferta ficou retida. Veja o motivo abaixo.");
      else if (data?.mode === "dry_run") setMessage("Oferta criada como simulação. Nada foi enviado.");
      else if (!body.sent) setMessage(`Nenhuma mensagem saiu${body.reason ? `: ${body.reason}` : "."}`);
      else setMessage(`Oferta enviada para ${body.sent} ${body.sent === 1 ? "técnico" : "técnicos"}.`);
      setRefresh((value) => value + 1);
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
        {data && (
          <Button size="sm" variant="outline" onClick={() => void send()} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}{again ? "Reenviar aos técnicos" : "Oferecer aos técnicos"}
          </Button>
        )}
      </div>
      {message && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </section>
  );
}
