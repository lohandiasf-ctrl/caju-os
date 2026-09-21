"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  ShieldAlert,
  Unlock,
  WalletCards,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth-provider";
import { MOTIVOS_IMPRODUTIVO, type MotivoImprodutivo } from "@/lib/fsa-payment";

// O técnico escolhe pelo que aconteceu na loja, não pelo código do motivo.
const ROTULO_MOTIVO: Record<MotivoImprodutivo, string> = {
  "gerente-recusou": "O gerente não deixou fazer",
  "defeito-maior": "Máquina com defeito que não dá para resolver na hora",
  "problema-impeditivo": "Outro problema impedindo resolver o principal",
  "loja-fechada": "A loja estava fechada",
  "tempo-excedido": "Mais de 2 horas no mesmo problema, sem resolver",
  "loja-fechando": "A loja estava nos últimos 30 minutos",
};

const ROTULO_STATUS: Record<string, string> = {
  aberto: "Em aberto",
  pronto: "Fechado, esperando a gerência",
  aprovado: "Aprovado",
  pago: "Pago",
  bloqueado: "Retido para conferência",
};

type Fsa = {
  id: number;
  ticketKey: string;
  summary: string | null;
  store: string | null;
  tipo: "servico" | "evidencia" | null;
  improdutiva: boolean;
  motivo: string | null;
  observacao: string | null;
  descobertaNaLoja: boolean;
  revisao: "ok" | "pendente";
};

type Repasse = {
  servicos: { produtivos: number; excecaoQuintoChamado: boolean; produtivosCents: number };
  evidencias: { quantidade: number; totalCents: number };
  improdutivas: { quantidade: number; totalCents: number };
  totalCents: number;
};

type Grupo = {
  id: number;
  nome: string | null;
  tecnico: string;
  dia: string;
  status: "aberto" | "pronto" | "aprovado" | "pago" | "bloqueado";
  approvedBy: string | null;
  createdBy: string;
  fsas: Fsa[];
  naoClassificadas: string[];
  aguardandoRevisao: string[];
  repasse: Repasse;
};

type ResumoGrupo = {
  id: number;
  nome: string | null;
  tecnico: string;
  dia: string;
  status: Grupo["status"];
  totalCents: number;
  ticketKeys: string[];
  semClassificar: number;
};

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (iso: string) => iso.split("-").reverse().join("/");

const CORES: Record<string, string> = {
  aberto: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  pronto: "border-blue-400/30 bg-blue-400/10 text-blue-200",
  aprovado: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  pago: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  bloqueado: "border-amber-400/30 bg-amber-400/10 text-amber-200",
};

export function FsaGroups() {
  const { user, role } = useAuth();
  const [resumos, setResumos] = useState<ResumoGrupo[]>([]);
  const [abertos, setAbertos] = useState<Map<number, Grupo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [exportando, setExportando] = useState(false);
  // FSAs em que o técnico clicou "Improdutiva" e ainda não escolheu o motivo.
  // O servidor não aceita improdutiva sem motivo, então a marcação fica só na
  // tela até o motivo vir — sem isso o seletor nunca aparece, porque ele depende
  // da improdutiva já estar salva.
  const [pedindoMotivo, setPedindoMotivo] = useState<Set<number>>(new Set());

  const daGerencia = role === "gerencia";

  const marcarPedindo = (id: number, pedindo: boolean) =>
    setPedindoMotivo((atual) => {
      const proximo = new Set(atual);
      if (pedindo) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/fsa-groups", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { grupos?: ResumoGrupo[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os grupos.");
      setResumos(payload.grupos ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os grupos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(first);
  }, [load]);

  const guardar = (grupo: Grupo) => {
    setAbertos((atual) => new Map(atual).set(grupo.id, grupo));
    setResumos((atual) =>
      atual.map((r) =>
        r.id === grupo.id
          ? { ...r, status: grupo.status, totalCents: grupo.repasse.totalCents, semClassificar: grupo.naoClassificadas.length }
          : r,
      ),
    );
  };

  const abrir = async (id: number) => {
    if (abertos.has(id)) {
      setAbertos((atual) => {
        const proximo = new Map(atual);
        proximo.delete(id);
        return proximo;
      });
      return;
    }
    if (!user) return;
    setOcupado(id);
    try {
      const response = await fetch(`/api/fsa-groups/${id}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = (await response.json()) as { grupo?: Grupo; error?: string };
      if (!response.ok || !payload.grupo) throw new Error(payload.error ?? "Não foi possível abrir o grupo.");
      guardar(payload.grupo);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível abrir o grupo.");
    } finally {
      setOcupado(null);
    }
  };

  const classificar = async (grupo: Grupo, fsa: Fsa, mudanca: Partial<Fsa>) => {
    if (!user) return;
    const proxima = {
      tipo: mudanca.tipo ?? fsa.tipo ?? "servico",
      improdutiva: mudanca.improdutiva ?? fsa.improdutiva,
      motivo: mudanca.motivo !== undefined ? mudanca.motivo : fsa.motivo,
      observacao: mudanca.observacao !== undefined ? mudanca.observacao : fsa.observacao,
      descobertaNaLoja: mudanca.descobertaNaLoja ?? fsa.descobertaNaLoja,
    };
    // Sem motivo o servidor recusa. Em vez de mandar um pedido que já se sabe
    // que volta com erro, abre o seletor e espera o motivo.
    if (proxima.improdutiva && !proxima.motivo) {
      marcarPedindo(fsa.id, true);
      return;
    }
    setOcupado(grupo.id);
    setError("");
    try {
      const response = await fetch(`/api/fsa-groups/${grupo.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticketKey: fsa.ticketKey, ...proxima }),
      });
      const payload = (await response.json()) as { grupo?: Grupo; error?: string };
      if (!response.ok || !payload.grupo) throw new Error(payload.error ?? "Não foi possível salvar.");
      guardar(payload.grupo);
      marcarPedindo(fsa.id, false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setOcupado(null);
    }
  };

  const agir = async (id: number, action: string) => {
    if (!user) return;
    setOcupado(id);
    setError("");
    try {
      const response = await fetch(`/api/fsa-groups/${id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { grupo?: Grupo; error?: string };
      if (!response.ok || !payload.grupo) throw new Error(payload.error ?? "Não foi possível atualizar.");
      guardar(payload.grupo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar.");
    } finally {
      setOcupado(null);
    }
  };

  const exportar = async () => {
    if (!user) return;
    setExportando(true);
    try {
      const response = await fetch("/api/fsa-groups/report?status=aprovado,pago&dias=30", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Não foi possível gerar o relatório.");
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = "repasse-fsa-30-dias.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o relatório.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <article className="surface-panel mt-6 overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center">
        <div className="mr-auto">
          <h2 className="text-sm font-bold">Grupos de repasse</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O grupo define a faixa de preço. Selecione as FSAs na fila e agrupe — não precisa
            preparar atendimento.
          </p>
        </div>
        {daGerencia && (
          <Button size="sm" variant="outline" disabled={exportando} onClick={() => void exportar()}>
            {exportando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Exportar
          </Button>
        )}
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
      ) : resumos.length ? (
        <ul className="divide-y divide-border">
          {resumos.map((resumo) => {
            const grupo = abertos.get(resumo.id);
            const trabalhando = ocupado === resumo.id;
            return (
              <li key={resumo.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={CORES[resumo.status]}>
                        {resumo.status === "bloqueado" ? (
                          <ShieldAlert aria-hidden="true" />
                        ) : (
                          <WalletCards aria-hidden="true" />
                        )}
                        {ROTULO_STATUS[resumo.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{dia(resumo.dia)}</span>
                      {resumo.semClassificar > 0 && (
                        <span className="text-xs text-amber-200">
                          {resumo.semClassificar} a classificar
                        </span>
                      )}
                    </div>
                    {resumo.nome && <p className="mt-2 text-sm font-bold text-cyan-100">{resumo.nome}</p>}
                    <p className="mt-1 font-mono text-xs font-bold text-primary">
                      {resumo.ticketKeys.join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{resumo.tecnico}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-bold text-emerald-300">
                      {reais(grupo?.repasse.totalCents ?? resumo.totalCents)}
                    </span>
                    <Button size="sm" variant="ghost" disabled={trabalhando} onClick={() => void abrir(resumo.id)}>
                      {trabalhando ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : grupo ? (
                        <ChevronUp aria-hidden="true" />
                      ) : (
                        <ChevronDown aria-hidden="true" />
                      )}
                      {grupo ? "Fechar" : "Classificar"}
                    </Button>
                  </div>
                </div>

                {grupo && (
                  <div className="mt-4">
                    {grupo.naoClassificadas.length > 0 && (
                      <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                          {grupo.naoClassificadas.length === 1
                            ? "Falta classificar 1 FSA"
                            : `Faltam classificar ${grupo.naoClassificadas.length} FSAs`}
                          . O valor abaixo ainda está parcial.
                        </span>
                      </p>
                    )}
                    {grupo.aguardandoRevisao.length > 0 && (
                      <p className="mb-3 flex items-start gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
                        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                          {grupo.aguardandoRevisao.join(", ")} passou de evidência para atuação. O valor
                          já conta, mas o pagamento espera a gerência conferir.
                        </span>
                      </p>
                    )}

                    <ul className="grid gap-3">
                      {grupo.fsas.map((fsa) => (
                        <li key={fsa.id} className="rounded-xl border border-border bg-background/60 p-3">
                          <p className="text-sm font-bold">{fsa.ticketKey}</p>
                          {fsa.summary && (
                            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{fsa.summary}</p>
                          )}
                          {fsa.store && <p className="mt-0.5 text-xs text-muted-foreground">{fsa.store}</p>}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={fsa.tipo === "servico" ? "default" : "outline"}
                              className="min-h-11"
                              disabled={trabalhando}
                              aria-pressed={fsa.tipo === "servico"}
                              onClick={() => void classificar(grupo, fsa, { tipo: "servico" })}
                            >
                              <Wrench aria-hidden="true" /> Atuação
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={fsa.tipo === "evidencia" ? "default" : "outline"}
                              className="min-h-11"
                              disabled={trabalhando}
                              aria-pressed={fsa.tipo === "evidencia"}
                              onClick={() =>
                                void classificar(grupo, fsa, {
                                  tipo: "evidencia",
                                  improdutiva: false,
                                  motivo: null,
                                })
                              }
                            >
                              <Camera aria-hidden="true" /> Evidência
                            </Button>
                            {fsa.tipo === "servico" && (
                              <Button
                                type="button"
                                size="sm"
                                variant={fsa.improdutiva || pedindoMotivo.has(fsa.id) ? "destructive" : "outline"}
                                className="min-h-11"
                                disabled={trabalhando}
                                aria-pressed={fsa.improdutiva || pedindoMotivo.has(fsa.id)}
                                onClick={() => {
                                  // Desmarcar uma que só estava esperando motivo não
                                  // precisa ir ao servidor: nada foi salvo ainda.
                                  if (!fsa.improdutiva && pedindoMotivo.has(fsa.id)) {
                                    marcarPedindo(fsa.id, false);
                                    return;
                                  }
                                  void classificar(grupo, fsa, {
                                    improdutiva: !fsa.improdutiva,
                                    motivo: fsa.improdutiva ? null : fsa.motivo,
                                  });
                                }}
                              >
                                Improdutiva
                              </Button>
                            )}
                          </div>

                          {fsa.tipo && (
                            <label
                              className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
                              htmlFor={`descoberta-${fsa.id}`}
                            >
                              <Checkbox
                                id={`descoberta-${fsa.id}`}
                                checked={fsa.descobertaNaLoja}
                                disabled={trabalhando}
                                onCheckedChange={(marcado) =>
                                  void classificar(grupo, fsa, { descobertaNaLoja: marcado === true })
                                }
                              />
                              Apareceu aqui na loja, não estava agendada
                            </label>
                          )}

                          {fsa.tipo === "servico" && (fsa.improdutiva || pedindoMotivo.has(fsa.id)) && (
                            <div className="mt-3 grid gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[.06] p-3">
                              <label
                                className="text-xs font-bold uppercase tracking-wide text-amber-200"
                                htmlFor={`motivo-${fsa.id}`}
                              >
                                Por que não foi possível resolver?
                              </label>
                              <NativeSelect
                                id={`motivo-${fsa.id}`}
                                value={fsa.motivo ?? ""}
                                disabled={trabalhando}
                                onChange={(event) =>
                                  void classificar(grupo, fsa, {
                                    improdutiva: true,
                                    motivo: event.target.value,
                                  })
                                }
                              >
                                <NativeSelectOption value="" disabled>
                                  Escolha o motivo
                                </NativeSelectOption>
                                {MOTIVOS_IMPRODUTIVO.map((motivo) => (
                                  <NativeSelectOption key={motivo} value={motivo}>
                                    {ROTULO_MOTIVO[motivo]}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                              <Textarea
                                aria-label="Observação"
                                placeholder="Quer registrar algum detalhe? (opcional)"
                                defaultValue={fsa.observacao ?? ""}
                                disabled={trabalhando}
                                onBlur={(event) => {
                                  const texto = event.target.value.trim();
                                  if (texto !== (fsa.observacao ?? "")) {
                                    void classificar(grupo, fsa, { observacao: texto });
                                  }
                                }}
                              />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>

                    <dl className="mt-4 grid gap-1 rounded-xl border border-border bg-background/60 p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">
                          Atuação ({grupo.repasse.servicos.produtivos})
                          {grupo.repasse.servicos.excecaoQuintoChamado && " · com a atuação a mais da loja"}
                        </dt>
                        <dd className="font-bold">{reais(grupo.repasse.servicos.produtivosCents)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">
                          Evidências ({grupo.repasse.evidencias.quantidade})
                        </dt>
                        <dd className="font-bold">{reais(grupo.repasse.evidencias.totalCents)}</dd>
                      </div>
                      {grupo.repasse.improdutivas.quantidade > 0 && (
                        <div className="flex justify-between gap-3 text-amber-200">
                          <dt>Improdutivas ({grupo.repasse.improdutivas.quantidade})</dt>
                          <dd className="font-bold">{reais(grupo.repasse.improdutivas.totalCents)}</dd>
                        </div>
                      )}
                      <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 text-base">
                        <dt className="font-bold">Total do grupo</dt>
                        <dd className="font-bold text-emerald-300">{reais(grupo.repasse.totalCents)}</dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(grupo.status === "aberto" || grupo.status === "pronto" || grupo.status === "bloqueado") && (
                        <Button
                          size="sm"
                          className="min-h-11"
                          disabled={trabalhando || grupo.naoClassificadas.length > 0}
                          onClick={() => void agir(grupo.id, "fechar")}
                        >
                          <CheckCircle2 aria-hidden="true" />
                          {grupo.status === "aberto" ? "Fechar repasse" : "Atualizar o que a gerência vê"}
                        </Button>
                      )}
                      {daGerencia && grupo.status === "bloqueado" && (
                        <Button size="sm" variant="outline" disabled={trabalhando} onClick={() => void agir(grupo.id, "liberar")}>
                          <Unlock aria-hidden="true" /> Liberar
                        </Button>
                      )}
                      {daGerencia && grupo.status === "pronto" && (
                        <Button size="sm" disabled={trabalhando} onClick={() => void agir(grupo.id, "aprovar")}>
                          <BadgeCheck aria-hidden="true" /> Aprovar
                        </Button>
                      )}
                      {daGerencia && grupo.status === "aprovado" && (
                        <Button size="sm" disabled={trabalhando} onClick={() => void agir(grupo.id, "pagar")}>
                          <WalletCards aria-hidden="true" /> Marcar como pago
                        </Button>
                      )}
                      {daGerencia && grupo.status !== "pago" && grupo.status !== "aberto" && grupo.status !== "bloqueado" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"
                          disabled={trabalhando}
                          onClick={() => void agir(grupo.id, "bloquear")}
                        >
                          <Ban aria-hidden="true" /> Bloquear
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Nenhum grupo ainda. Selecione FSAs na fila de chamados e use &ldquo;Agrupar para
          repasse&rdquo;.
        </p>
      )}
    </article>
  );
}
