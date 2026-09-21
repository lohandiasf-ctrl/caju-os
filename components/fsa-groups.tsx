"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  ShieldAlert,
  Unlock,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import type { MotivoImprodutivo } from "@/lib/fsa-payment";
import { saveFile } from "@/lib/download-file";

// O técnico escolhe pelo que aconteceu na loja, não pelo código do motivo.
const ROTULO_MOTIVO: Record<MotivoImprodutivo, string> = {
  "gerente-recusou": "O gerente não deixou fazer",
  "defeito-maior": "Máquina com defeito que não dá para resolver na hora",
  "problema-impeditivo": "Outro problema impedindo resolver o principal",
  "loja-fechada": "A loja estava fechada",
  "tempo-excedido": "Mais de 2 horas no mesmo problema, sem resolver",
  "loja-fechando": "A loja estava nos últimos 30 minutos",
};

type TipoLido = "atuacao" | "evidencia" | "improdutiva" | "sem-tipo";

const tipoDaFsa = (fsa: { tipo: string | null; improdutiva: boolean }): TipoLido =>
  fsa.tipo === "evidencia" ? "evidencia" : fsa.tipo === "servico" ? (fsa.improdutiva ? "improdutiva" : "atuacao") : "sem-tipo";

const ROTULO_TIPO: Record<TipoLido, string> = {
  atuacao: "Atuação",
  evidencia: "Evidência",
  improdutiva: "Improdutiva",
  "sem-tipo": "Sem tipo",
};

const ROTULO_TIPO_COR: Record<TipoLido, string> = {
  atuacao: "border-blue-400/30 bg-blue-400/10 text-blue-200",
  evidencia: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  improdutiva: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "sem-tipo": "border-rose-400/30 bg-rose-400/10 text-rose-200",
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
  dataPagamento: string | null;
  createdBy: string;
  fsas: Fsa[];
  naoClassificadas: string[];
  aguardandoRevisao: string[];
  repasse: Repasse;
};

type ResumoGrupo = {
  id: number;
  dataPagamento: string | null;
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
  const [avisoExport, setAvisoExport] = useState("");
  // Data de pagamento escolhida antes de aprovar, por grupo.
  const [datasPagamento, setDatasPagamento] = useState<Map<number, string>>(new Map());

  const daGerencia = role === "gerencia";

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
          ? { ...r, status: grupo.status, dataPagamento: grupo.dataPagamento, totalCents: grupo.repasse.totalCents, semClassificar: grupo.naoClassificadas.length }
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

  const agir = async (id: number, action: string, extra: Record<string, unknown> = {}) => {
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
        body: JSON.stringify({ action, ...extra }),
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
    setAvisoExport("");
    try {
      const response = await fetch("/api/fsa-groups/report?status=aprovado,pago&dias=30", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Não foi possível gerar o relatório.");
      }
      const blob = await response.blob();
      const salvo = saveFile(blob, "repasse-fsa-30-dias.csv");
      // Sem quebra de linha = só o cabeçalho, nenhum grupo no período.
      const vazio = !(await blob.text()).trim().includes("\n");
      setAvisoExport(vazio ? `${salvo}. Nenhum grupo aprovado ou pago nos últimos 30 dias — o arquivo só tem o cabeçalho.` : salvo);
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
          <h2 className="text-sm font-bold">Grupos de chamados</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O grupo define a faixa de preço. O tipo de cada FSA é marcado no chamado, na tela
            inicial; aqui se confere, fecha e aprova.
          </p>
        </div>
        {daGerencia && (
          <Button size="sm" variant="outline" disabled={exportando} onClick={() => void exportar()}>
            {exportando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Exportar
          </Button>
        )}
      </div>

      {avisoExport && (
        <p aria-live="polite" className="border-b border-border bg-emerald-400/10 px-5 py-3 text-sm text-emerald-100">
          {avisoExport}
        </p>
      )}

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
                      {(grupo?.dataPagamento ?? resumo.dataPagamento) && (
                        <span className="text-xs text-emerald-200">
                          {(grupo?.status ?? resumo.status) === "pago" ? "pago" : "paga"} em {dia((grupo?.dataPagamento ?? resumo.dataPagamento)!)}
                        </span>
                      )}
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
                          . Marque o tipo abrindo o chamado na tela inicial; o valor abaixo ainda
                          está parcial.
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

                    {/* O tipo é marcado na tela do chamado, por quem opera. Aqui só se confere. */}
                    <ul className="grid gap-2">
                      {grupo.fsas.map((fsa) => (
                        <li key={fsa.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border bg-background/60 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold">{fsa.ticketKey}</p>
                            {fsa.summary && (
                              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{fsa.summary}</p>
                            )}
                            {fsa.store && <p className="mt-0.5 text-xs text-muted-foreground">{fsa.store}</p>}
                            {fsa.tipo === "servico" && fsa.improdutiva && fsa.motivo && (
                              <p className="mt-1 text-xs text-amber-200">
                                {ROTULO_MOTIVO[fsa.motivo as MotivoImprodutivo] ?? fsa.motivo}
                                {fsa.observacao && ` — ${fsa.observacao}`}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            {fsa.descobertaNaLoja && (
                              <Badge variant="outline" className="text-muted-foreground">apareceu na loja</Badge>
                            )}
                            <Badge variant="outline" className={ROTULO_TIPO_COR[tipoDaFsa(fsa)]}>
                              {ROTULO_TIPO[tipoDaFsa(fsa)]}
                            </Badge>
                          </div>
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
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="grid gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`pagamento-${grupo.id}`}>
                            Data do pagamento
                            <Input
                              id={`pagamento-${grupo.id}`}
                              type="date"
                              className="h-9 w-40"
                              value={datasPagamento.get(grupo.id) ?? ""}
                              disabled={trabalhando}
                              onChange={(event) =>
                                setDatasPagamento((atual) => new Map(atual).set(grupo.id, event.target.value))
                              }
                            />
                          </label>
                          {/* Sem data não aprova: a folha não sai no dia da aprovação, e é
                              esta data que diz ao painel quando o dinheiro sai. */}
                          <Button
                            size="sm"
                            disabled={trabalhando || !datasPagamento.get(grupo.id)}
                            onClick={() =>
                              void agir(grupo.id, "aprovar", { dataPagamento: datasPagamento.get(grupo.id) })
                            }
                          >
                            <BadgeCheck aria-hidden="true" /> Aprovar
                          </Button>
                        </div>
                      )}
                      {daGerencia && grupo.status === "aprovado" && (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="grid gap-1 text-xs font-semibold text-muted-foreground" htmlFor={`pagamento-${grupo.id}`}>
                            Pagamento previsto
                            <Input
                              id={`pagamento-${grupo.id}`}
                              type="date"
                              className="h-9 w-40"
                              value={grupo.dataPagamento ?? ""}
                              disabled={trabalhando}
                              onChange={(event) => {
                                if (event.target.value) {
                                  void agir(grupo.id, "reagendar", { dataPagamento: event.target.value });
                                }
                              }}
                            />
                          </label>
                          <Button size="sm" disabled={trabalhando} onClick={() => void agir(grupo.id, "pagar")}>
                            <WalletCards aria-hidden="true" /> Marcar como pago
                          </Button>
                        </div>
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
