"use client";

import { useEffect, useState } from "react";
import { ClipboardCopy, RefreshCw, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { sharedTicketUrl } from "@/lib/ticket-links";

type Team = {
  n1: { email: string; status: string } | null;
  analyst: { email: string; scheduledAt: string | null } | null;
  technician: { id: number; name: string; baseCity: string | null; baseState: string | null } | null;
};

export function TicketTeamCard({ ticketKey, user }: {
  ticketKey: string;
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [team, setTeam] = useState<Team | null>(null);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void user.getIdToken().then((token) => fetch(`/api/ticket-team/${encodeURIComponent(ticketKey)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    })).then(async (response) => {
      const payload = await response.json() as Team & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar equipe.");
      if (active) setTeam(payload);
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Falha ao carregar equipe."); });
    return () => { active = false; };
  }, [ticketKey, user, refresh]);

  const copyLink = async () => {
    try {
      const link = sharedTicketUrl(ticketKey);
      const copied = await copyToClipboard(link);
      setMessage(copied ? "Link do chamado copiado." : "Não foi possível copiar o link. Tente novamente.");
    } catch {
      setMessage("Não foi possível copiar o link. Tente novamente.");
    }
  };

  return <section className="rounded-xl border border-border bg-muted/20 p-4" aria-label="Vínculos do chamado">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold"><UsersRound className="size-4 text-primary" aria-hidden="true" />Equipe vinculada à {ticketKey}</h3>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setRefresh((value) => value + 1)}><RefreshCw aria-hidden="true" /> Atualizar vínculos</Button><Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}><ClipboardCopy aria-hidden="true" /> Copiar link único</Button></div>
    </div>
    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
      <p><span className="block text-muted-foreground">N1 responsável</span><b>{team?.n1?.email ?? "Não atribuído"}</b></p>
      <p><span className="block text-muted-foreground">Analista que agendou</span><b>{team?.analyst?.email ?? "Não registrado"}</b></p>
      <p><span className="block text-muted-foreground">Técnico de campo</span><b>{team?.technician?.name ?? "Não vinculado"}</b></p>
    </div>
    {message && <output className="mt-2 block text-xs text-muted-foreground">{message}</output>}
  </section>;
}
