"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, ShieldAlert, Wrench } from "lucide-react";
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

type Classificacao = {
  tipo: "servico" | "evidencia";
  improdutiva: boolean;
  motivo: string | null;
  observacao: string | null;
  descobertaNaLoja: boolean;
  revisao: "ok" | "pendente";
  updatedBy: string;
  updatedAt: string;
};

type Fsa = {
  ticketKey: string;
  summary: string;
  store: string | null;
  classificacao: Classificacao | null;
};

type Repasse = {
  servicos: {
    quantidade: number;
    produtivos: number;
    descobertos: number;
    improdutivos: number;
    faixaCents: number;
    excecaoQuintoChamado: boolean;
    produtivosCents: number;
    improdutivosCents: number;
    totalCents: number;
  };
  evidencias: {
    quantidade: number;
    produtivas: number;
    improdutivas: number;
    baseCents: number;
    produtivasCents: number;
    improdutivasCents: number;
    totalCents: number;
  };
  improdutivas: { quantidade: number; totalCents: number };
  descontoImprodutivoCents: number;
  totalCents: number;
};

type Payout = {
  status: "aberto" | "pronto" | "aprovado" | "pago" | "bloqueado";
  totalCents: number;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  updatedAt: string;
};

type Dados = {
  fsas: Fsa[];
  naoClassificadas: string[];
  aguardandoRevisao: string[];
  repasse: Repasse;
  payout: Payout | null;
};

const ROTULO_STATUS: Record<Payout["status"], string> = {
  aberto: "Em aberto",
  pronto: "Fechado, esperando a gerência",
  aprovado: "Aprovado pela gerência",
  pago: "Pago",
  bloqueado: "Retido para conferência da gerência",
};

const reais = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function FsaPaymentPanel({ attendanceId }: { attendanceId: number }) {
  const { user } = useAuth();
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [abrindoMotivo, setAbrindoMotivo] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/active-attendances/${attendanceId}/fsa-payment`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = (await response.json()) as Dados & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o repasse.");
      setDados(payload);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o repasse.");
    } finally {
      setLoading(false);
    }
  }, [attendanceId, user]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(firstLoad);
  }, [load]);

  const classificar = async (fsa: Fsa, mudanca: Partial<Classificacao>) => {
    if (!user) return;
    const atual = fsa.classificacao;
    const proxima = {
      tipo: mudanca.tipo ?? atual?.tipo ?? "servico",
      improdutiva: mudanca.improdutiva ?? atual?.improdutiva ?? false,
      motivo: mudanca.motivo !== undefined ? mudanca.motivo : (atual?.motivo ?? null),
      observacao: mudanca.observacao !== undefined ? mudanca.observacao : (atual?.observacao ?? null),
      descobertaNaLoja: mudanca.descobertaNaLoja ?? atual?.descobertaNaLoja ?? false,
    };
    // Sem motivo o servidor recusa. Abrir o seletor aqui evita mandar um pedido
    // que já se sabe que vai voltar com erro.
    if (proxima.improdutiva && !proxima.motivo) {
      setAbrindoMotivo(fsa.ticketKey);
      return;
    }
    setSalvando(fsa.ticketKey);
    setError("");
    try {
      const response = await fetch(`/api/active-attendances/${attendanceId}/fsa-payment`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticketKey: fsa.ticketKey, ...proxima }),
      });
      const payload = (await response.json()) as Dados & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar.");
      setDados(payload);
      setAbrindoMotivo(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSalvando(null);
    }
  };

  // Fechar é o que transforma o cálculo em algo que a gerência aprova. Antes
  // disso a visita é só do técnico, e nada foi apresentado a ninguém.
  const fechar = async () => {
    if (!user) return;
    setFechando(true);
    setError("");
    try {
      const response = await fetch(`/api/active-attendances/${attendanceId}/fsa-payment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "fechar" }),
      });
      const payload = (await response.json()) as Dados & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível fechar o repasse.");
      setDados(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível fechar o repasse.");
    } finally {
      setFechando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando o repasse…
      </div>
    );
  }

  if (!dados) {
    return (
      <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
        {error || "Não foi possível carregar o repasse."}
      </p>
    );
  }

  const { repasse } = dados;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-background/40 p-4" aria-label="Repasse da visita">
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      )}

      {dados.naoClassificadas.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {dados.naoClassificadas.length === 1 ? "Falta classificar 1 FSA" : `Faltam classificar ${dados.naoClassificadas.length} FSAs`}
            . O valor abaixo ainda está parcial.
          </span>
        </p>
      )}

      {dados.aguardandoRevisao.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {dados.aguardandoRevisao.join(", ")} passou de evidência para serviço. O valor já conta, mas o
            pagamento espera a gerência conferir.
          </span>
        </p>
      )}

      <ul className="grid gap-3">
        {dados.fsas.map((fsa) => {
          const c = fsa.classificacao;
          const ocupada = salvando === fsa.ticketKey;
          const pedindoMotivo = abrindoMotivo === fsa.ticketKey || (c?.improdutiva ?? false);
          return (
            <li key={fsa.ticketKey} className="rounded-xl border border-border bg-background/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{fsa.ticketKey}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{fsa.summary}</p>
                  {fsa.store && <p className="mt-0.5 text-xs text-muted-foreground">{fsa.store}</p>}
                </div>
                {ocupada && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={c?.tipo === "servico" ? "default" : "outline"}
                  className="min-h-11"
                  disabled={ocupada}
                  aria-pressed={c?.tipo === "servico"}
                  onClick={() => void classificar(fsa, { tipo: "servico" })}
                >
                  <Wrench aria-hidden="true" /> Atuação
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={c?.tipo === "evidencia" ? "default" : "outline"}
                  className="min-h-11"
                  disabled={ocupada}
                  aria-pressed={c?.tipo === "evidencia"}
                  onClick={() => void classificar(fsa, { tipo: "evidencia" })}
                >
                  <Camera aria-hidden="true" /> Evidência
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={c?.improdutiva ? "destructive" : "outline"}
                  className="min-h-11"
                  disabled={ocupada || !c}
                  aria-pressed={c?.improdutiva ?? false}
                  onClick={() => void classificar(fsa, { improdutiva: !c?.improdutiva, motivo: c?.improdutiva ? null : undefined })}
                >
                  Improdutiva
                </Button>
              </div>

              {c && (
                <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" htmlFor={`descoberta-${fsa.ticketKey}`}>
                  <Checkbox
                    id={`descoberta-${fsa.ticketKey}`}
                    checked={c.descobertaNaLoja}
                    disabled={ocupada}
                    onCheckedChange={(marcado) =>
                      void classificar(fsa, { descobertaNaLoja: marcado === true })
                    }
                  />
                  Apareceu aqui na loja, não estava agendada
                </label>
              )}

              {pedindoMotivo && c && (
                <div className="mt-3 grid gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[.06] p-3">
                  <label className="text-xs font-bold uppercase tracking-wide text-amber-200" htmlFor={`motivo-${fsa.ticketKey}`}>
                    Por que não foi possível resolver?
                  </label>
                  <NativeSelect
                    id={`motivo-${fsa.ticketKey}`}
                    value={c.motivo ?? ""}
                    disabled={ocupada}
                    onChange={(event) =>
                      void classificar(fsa, { improdutiva: true, motivo: event.target.value })
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
                    defaultValue={c.observacao ?? ""}
                    disabled={ocupada}
                    onBlur={(event) => {
                      const texto = event.target.value.trim();
                      if (texto !== (c.observacao ?? "")) void classificar(fsa, { observacao: texto });
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <dl className="mt-4 grid gap-1 rounded-xl border border-border bg-background/60 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            Atuação ({repasse.servicos.produtivos})
            {repasse.servicos.excecaoQuintoChamado && " · com a atuação a mais da loja"}
          </dt>
          <dd className="font-bold">{reais(repasse.servicos.produtivosCents)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Evidências ({repasse.evidencias.produtivas})</dt>
          <dd className="font-bold">{reais(repasse.evidencias.produtivasCents)}</dd>
        </div>
        {repasse.improdutivas.quantidade > 0 && (
          <div className="flex justify-between gap-3 text-amber-200">
            <dt>Improdutivas ({repasse.improdutivas.quantidade})</dt>
            <dd className="font-bold">{reais(repasse.improdutivas.totalCents)}</dd>
          </div>
        )}
        <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 text-base">
          <dt className="font-bold">Total da visita</dt>
          <dd className="font-bold text-emerald-300">{reais(repasse.totalCents)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {dados.payout ? ROTULO_STATUS[dados.payout.status] : "Ainda não fechado"}
        </p>
        {(!dados.payout || dados.payout.status === "pronto" || dados.payout.status === "bloqueado") && (
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={fechando || dados.naoClassificadas.length > 0}
            onClick={() => void fechar()}
          >
            {fechando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            {dados.payout ? "Atualizar o que a gerência vê" : "Fechar repasse"}
          </Button>
        )}
      </div>
    </section>
  );
}
