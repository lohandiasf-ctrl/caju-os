"use client";

import { useId, type ReactNode } from "react";
import { Building2, ChevronDown, ChevronUp, Layers3, UserRound } from "lucide-react";
import type { VinculoDeGrupo } from "@/lib/ticket-stacks";

type Chamado = { id: string; store: string };

// Quantas FSAs aparecem como etiqueta no card fechado. Mais que isso vira "+N",
// senão a pilha fica mais alta que os cards que ela substitui.
const MAX_ETIQUETAS = 4;

/**
 * Pilha de chamados do mesmo grupo de repasse, no lugar dos cards soltos.
 *
 * Fechada, ela ocupa o espaço de um card e mostra o que o grupo é: quem atende,
 * quais FSAs, em que loja. Aberta, mostra os cards de sempre — cada um continua
 * abrindo o chamado —, então nada que se fazia com o card solto se perde.
 */
export function TicketStack<T extends Chamado>({
  grupo,
  chamados,
  aberta,
  onAlternar,
  selecao,
  selecionada = false,
  renderChamado,
}: {
  grupo: VinculoDeGrupo;
  chamados: T[];
  aberta: boolean;
  onAlternar: () => void;
  // A caixa de seleção vem de fora para ser a mesma do resto do kanban.
  selecao?: ReactNode;
  selecionada?: boolean;
  renderChamado: (chamado: T) => ReactNode;
}) {
  const conteudoId = useId();
  const lojas = [...new Set(chamados.map((c) => c.store).filter(Boolean))];
  const etiquetas = chamados.slice(0, MAX_ETIQUETAS);
  const resto = chamados.length - etiquetas.length;

  if (aberta) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[.04] p-1.5">
        <div className="flex items-center gap-1 px-1 pb-1.5">
          {selecao}
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded="true"
            aria-controls={conteudoId}
            className="flex min-h-9 flex-1 items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <Layers3 className="size-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{grupo.nome ?? "Grupo de repasse"}</span>
            <span className="shrink-0 text-emerald-200/80">Recolher</span>
            <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        </div>
        <div id={conteudoId} className="space-y-2 border-l border-emerald-400/25 pl-1.5">
          {chamados.map((chamado) => (
            <div key={chamado.id}>{renderChamado(chamado)}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    // O espaço embaixo é das duas cartas de trás: sem ele, elas invadem o card
    // seguinte da coluna.
    <div className="group/pilha relative pb-3">
      <div
        aria-hidden="true"
        className="absolute inset-x-3 bottom-0 top-3 rounded-xl border border-white/[.05] bg-black/25 transition-transform duration-200 group-hover/pilha:translate-y-1 motion-reduce:transition-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-1.5 bottom-1.5 top-1.5 rounded-xl border border-white/[.06] bg-black/20 transition-transform duration-200 group-hover/pilha:translate-y-0.5 motion-reduce:transition-none"
      />

      <article
        className={`relative rounded-xl border bg-card shadow-[0_14px_32px_rgba(0,0,0,.18)] transition hover:-translate-y-0.5 motion-reduce:transition-none ${selecionada ? "border-violet-300/60 ring-1 ring-violet-400/30" : "border-emerald-400/25 hover:border-emerald-300/45"}`}
      >
        {selecao && <div className="absolute left-1 top-1 z-10">{selecao}</div>}
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded="false"
          aria-controls={conteudoId}
          aria-label={`${grupo.nome ?? "Grupo de repasse"}: ${chamados.length} FSAs de ${grupo.tecnico}. Abrir.`}
          className="w-full rounded-xl p-3 text-left transition hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <div className={`flex items-center justify-between gap-2 ${selecao ? "pl-8" : ""}`}>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-emerald-300">
              <Layers3 className="size-3.5" aria-hidden="true" />
              Grupo
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-emerald-100">
              {chamados.length} FSAs
            </span>
          </div>

          <h4 className="mt-2 truncate text-sm font-semibold leading-snug">
            {grupo.nome ?? "Grupo de repasse"}
          </h4>

          <div className="mt-2 flex flex-wrap gap-1">
            {etiquetas.map((chamado) => (
              <span
                key={chamado.id}
                className="rounded-md border border-white/[.07] bg-black/25 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary"
              >
                {chamado.id}
              </span>
            ))}
            {resto > 0 && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                +{resto}
              </span>
            )}
          </div>

          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{grupo.tecnico}</span>
            </p>
            {lojas.length > 0 && (
              <p className="flex items-center gap-1.5">
                <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {lojas[0]}
                  {lojas.length > 1 && ` e mais ${lojas.length - 1}`}
                </span>
              </p>
            )}
          </div>

          <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-emerald-200/90">
            Ver as {chamados.length} FSAs
            <ChevronDown className="size-3.5 transition-transform duration-200 group-hover/pilha:translate-y-0.5 motion-reduce:transition-none" aria-hidden="true" />
          </p>
        </button>
      </article>
    </div>
  );
}
