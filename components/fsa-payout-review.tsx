"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Ban, Download, Loader2, ShieldAlert, Unlock, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

type Payout = {
  attendanceId: number;
  status: "aberto" | "pronto" | "aprovado" | "pago" | "bloqueado";
  servicosCents: number;
  evidenciasCents: number;
  descontoImprodutivoCents: number;
  totalCents: number;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  updatedAt: string;
  ownerEmail: string;
  whatsappGroupName: string | null;
  startedAt: string;
  ticketKeys: string[];
};

type Filtro = "pendentes" | "aprovados" | "pagos";

const CONSULTA: Record<Filtro, string> = {
  pendentes: "pronto,bloqueado",
  aprovados: "aprovado",
  pagos: "pago",
};

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export function FsaPayoutReview() {
  const { user, role } = useAuth();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agindo, setAgindo] = useState<number | null>(null);
  const [exportando, setExportando] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/fsa-payouts?status=${CONSULTA[filtro]}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { payouts?: Payout[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar a fila.");
      setPayouts(payload.payouts ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar a fila.");
    } finally {
      setLoading(false);
    }
  }, [filtro, user]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(first);
  }, [load]);

  const agir = async (payout: Payout, action: "aprovar" | "bloquear" | "liberar" | "pagar") => {
    if (!user) return;
    setAgindo(payout.attendanceId);
    setError("");
    try {
      const response = await fetch(`/api/active-attendances/${payout.attendanceId}/fsa-payment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar o repasse.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o repasse.");
    } finally {
      setAgindo(null);
    }
  };

  // O CSV vem do servidor, não da tela: o relatório cobre 30 dias, e a fila
  // mostra só o filtro atual — exportar o que está à vista entregaria menos do
  // que a folha precisa.
  const exportar = async () => {
    if (!user) return;
    setExportando(true);
    setError("");
    try {
      const response = await fetch(`/api/fsa-payouts/report?status=${CONSULTA[filtro]}&dias=30`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Não foi possível gerar o relatório.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `repasse-fsa-${filtro}-30-dias.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o relatório.");
    } finally {
      setExportando(false);
    }
  };

  // A fila é dinheiro de terceiros: quem não é gerência não vê nem a lista.
  if (role !== "gerencia") return null;

  return (
    <article id="repasse-fsa" className="surface-panel mt-6 scroll-mt-24 overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center">
        <div className="mr-auto">
          <h2 className="text-sm font-bold">Repasse por FSA</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Visitas fechadas pelo técnico, esperando conferência. Aprovar não paga ninguém — a folha
            continua saindo por fora.
          </p>
        </div>
        <fieldset aria-label="Filtrar repasses" className="flex rounded-lg border border-border bg-card p-1">
          {(["pendentes", "aprovados", "pagos"] as const).map((opcao) => (
            <Button
              key={opcao}
              size="sm"
              aria-pressed={filtro === opcao}
              variant={filtro === opcao ? "secondary" : "ghost"}
              onClick={() => setFiltro(opcao)}
            >
              {opcao === "pendentes" ? "Pendentes" : opcao === "aprovados" ? "Aprovados" : "Pagos"}
            </Button>
          ))}
        </fieldset>
        <Button size="sm" variant="outline" disabled={exportando} onClick={() => void exportar()}>
          {exportando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          Exportar
        </Button>
      </div>

      {error && (
        <p role="alert" className="border-b border-border bg-rose-400/10 px-5 py-3 text-sm text-rose-100">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid min-h-32 place-items-center p-5">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : payouts.length ? (
        <ul className="divide-y divide-border">
          {payouts.map((payout) => {
            const ocupado = agindo === payout.attendanceId;
            const bloqueado = payout.status === "bloqueado";
            return (
              <li key={payout.attendanceId} className="flex flex-col gap-3 p-5 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        bloqueado
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                          : payout.status === "aprovado"
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : payout.status === "pago"
                              ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
                              : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                      }
                    >
                      {bloqueado ? <ShieldAlert aria-hidden="true" /> : <WalletCards aria-hidden="true" />}
                      {bloqueado ? "Reclassificada, aguarda conferência" : payout.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{dia(payout.startedAt)}</span>
                  </div>
                  {payout.whatsappGroupName && (
                    <p className="mt-2 text-sm font-bold text-cyan-100">{payout.whatsappGroupName}</p>
                  )}
                  <p className="mt-1 font-mono text-xs font-bold text-primary">
                    {payout.ticketKeys.join(" · ") || "sem FSAs"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {payout.ownerEmail}
                    {payout.approvedBy && ` · aprovado por ${payout.approvedBy}`}
                  </p>
                </div>

                <dl className="flex shrink-0 gap-5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Serviços</dt>
                    <dd className="mt-0.5 font-mono font-bold">{money(payout.servicosCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Evidências</dt>
                    <dd className="mt-0.5 font-mono font-bold">{money(payout.evidenciasCents)}</dd>
                  </div>
                  {payout.descontoImprodutivoCents > 0 && (
                    <div>
                      <dt className="text-muted-foreground">Desconto</dt>
                      <dd className="mt-0.5 font-mono font-bold text-amber-200">
                        − {money(payout.descontoImprodutivoCents)}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Total</dt>
                    <dd className="mt-0.5 font-mono text-base font-bold text-emerald-300">
                      {money(payout.totalCents)}
                    </dd>
                  </div>
                </dl>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {bloqueado && (
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void agir(payout, "liberar")}>
                      {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Unlock aria-hidden="true" />}
                      Liberar
                    </Button>
                  )}
                  {payout.status === "pronto" && (
                    <Button size="sm" disabled={ocupado} onClick={() => void agir(payout, "aprovar")}>
                      {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}
                      Aprovar
                    </Button>
                  )}
                  {payout.status === "aprovado" && (
                    <Button size="sm" disabled={ocupado} onClick={() => void agir(payout, "pagar")}>
                      {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : <WalletCards aria-hidden="true" />}
                      Marcar como pago
                    </Button>
                  )}
                  {payout.status !== "pago" && !bloqueado && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"
                      disabled={ocupado}
                      onClick={() => void agir(payout, "bloquear")}
                    >
                      <Ban aria-hidden="true" />
                      Bloquear
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-8 text-center text-sm text-muted-foreground">
          {filtro === "pendentes"
            ? "Nenhuma visita esperando conferência."
            : "Nada por aqui neste filtro."}
        </p>
      )}
    </article>
  );
}
