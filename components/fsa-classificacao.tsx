"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Layers3, Loader2, ShieldAlert, UserRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
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
  groupId: number;
  nome: string | null;
  status: "aberto" | "pronto" | "aprovado" | "bloqueado";
  tecnico: string;
  tipo: "servico" | "evidencia" | null;
  improdutiva: boolean;
  motivo: string | null;
  observacao: string | null;
  descobertaNaLoja: boolean;
  revisao: "ok" | "pendente";
  podeEditar: boolean;
};

type Mudanca = Partial<Pick<Classificacao, "tipo" | "improdutiva" | "motivo" | "observacao" | "descobertaNaLoja">>;
type User = { getIdToken: () => Promise<string> } | null;

/**
 * O tipo da FSA — atuação, evidência, improdutiva — marcado na tela do chamado.
 *
 * É quem opera o chamado que sabe o que aconteceu na loja; a tela financeira só
 * confere e aprova. A classificação pertence ao grupo de repasse em que o
 * chamado está, então chamado fora de grupo mostra como chegar lá em vez de um
 * formulário que não teria onde gravar.
 */
export function FsaClassificacao({ ticketKey, user }: { ticketKey: string; user: User }) {
  const [dados, setDados] = useState<Classificacao | null>(null);
  const [passadasPagas, setPassadasPagas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState("");
  // Clicou em "Improdutiva" e ainda não escolheu o motivo. O servidor recusa
  // improdutiva sem motivo, então a marcação fica só na tela até ele vir.
  const [pedindoMotivo, setPedindoMotivo] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/fsa-groups/por-chamado?ticketKey=${encodeURIComponent(ticketKey)}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { grupo?: Classificacao | null; passadasPagas?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar o tipo da FSA.");
      setDados(payload.grupo ?? null);
      setPassadasPagas(payload.passadasPagas ?? 0);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o tipo da FSA.");
    } finally {
      setLoading(false);
    }
  }, [ticketKey, user]);

  useEffect(() => {
    const primeira = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(primeira);
  }, [load]);

  const classificar = async (mudanca: Mudanca) => {
    if (!user || !dados) return;
    const proxima = {
      tipo: mudanca.tipo ?? dados.tipo ?? "servico",
      improdutiva: mudanca.improdutiva ?? dados.improdutiva,
      motivo: mudanca.motivo !== undefined ? mudanca.motivo : dados.motivo,
      observacao: mudanca.observacao !== undefined ? mudanca.observacao : dados.observacao,
      descobertaNaLoja: mudanca.descobertaNaLoja ?? dados.descobertaNaLoja,
    };
    if (proxima.improdutiva && !proxima.motivo) {
      setPedindoMotivo(true);
      return;
    }
    setSalvando(true);
    setError("");
    try {
      const response = await fetch(`/api/fsa-groups/${dados.groupId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ticketKey, ...proxima }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar.");
      setPedindoMotivo(false);
      // O grupo inteiro volta com valores; esta tela só precisa desta FSA, e
      // recarrega pelo caminho sem dinheiro.
      await load();
      window.dispatchEvent(new Event("caju:grupos-de-repasse"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/80 p-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Carregando o tipo da FSA…
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/60 p-3">
        <p className="text-sm font-bold">Tipo da FSA</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Esta FSA ainda não está num grupo de repasse. Selecione-a na fila da tela inicial e use
          &ldquo;Agrupar para repasse&rdquo; — aí o tipo pode ser marcado aqui.
          {passadasPagas > 0 && ` Ela já teve ${passadasPagas === 1 ? "uma passada paga" : `${passadasPagas} passadas pagas`} antes.`}
        </p>
        {error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
      </div>
    );
  }

  const travado = !dados.podeEditar || salvando;
  const mostrarMotivo = dados.tipo === "servico" && (dados.improdutiva || pedindoMotivo);

  return (
    <section
      className="rounded-xl border border-emerald-400/25 bg-background/80 p-3 shadow-sm"
      aria-label="Tipo da FSA para o repasse"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold">Tipo da FSA</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers3 className="size-3.5 text-emerald-300" aria-hidden="true" />
              {dados.nome ?? `Grupo ${dados.groupId}`}
            </span>
            <span className="flex items-center gap-1">
              <UserRound className="size-3.5" aria-hidden="true" />
              {dados.tecnico}
            </span>
          </p>
        </div>
        {salvando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>

      {!dados.podeEditar && (
        <p className="mt-2 text-xs text-muted-foreground">
          {dados.status === "aprovado"
            ? "O repasse deste grupo já foi aprovado, então o tipo não muda mais."
            : "Só quem montou o grupo ou a gerência pode marcar o tipo, porque ele muda o valor do repasse."}
        </p>
      )}

      {dados.revisao === "pendente" && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-xs text-cyan-100">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Passou de evidência para atuação. O valor já conta, mas o pagamento espera a gerência conferir.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={dados.tipo === "servico" ? "default" : "outline"}
          className="min-h-11"
          disabled={travado}
          aria-pressed={dados.tipo === "servico"}
          onClick={() => void classificar({ tipo: "servico" })}
        >
          <Wrench aria-hidden="true" /> Atuação
        </Button>
        <Button
          type="button"
          size="sm"
          variant={dados.tipo === "evidencia" ? "default" : "outline"}
          className="min-h-11"
          disabled={travado}
          aria-pressed={dados.tipo === "evidencia"}
          onClick={() => void classificar({ tipo: "evidencia", improdutiva: false, motivo: null })}
        >
          <Camera aria-hidden="true" /> Evidência
        </Button>
        {/* Evidência não tem improdutiva: entregar a evidência é o trabalho inteiro. */}
        {dados.tipo === "servico" && (
          <Button
            type="button"
            size="sm"
            variant={dados.improdutiva || pedindoMotivo ? "destructive" : "outline"}
            className="min-h-11"
            disabled={travado}
            aria-pressed={dados.improdutiva || pedindoMotivo}
            onClick={() => {
              if (!dados.improdutiva && pedindoMotivo) {
                setPedindoMotivo(false);
                return;
              }
              void classificar({ improdutiva: !dados.improdutiva, motivo: dados.improdutiva ? null : dados.motivo });
            }}
          >
            Improdutiva
          </Button>
        )}
      </div>

      {!dados.tipo && dados.podeEditar && (
        <p className="mt-2 text-xs text-amber-200">Ainda sem tipo — o grupo não fecha enquanto alguma FSA estiver assim.</p>
      )}

      {dados.tipo && (
        <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" htmlFor={`descoberta-${ticketKey}`}>
          <Checkbox
            id={`descoberta-${ticketKey}`}
            checked={dados.descobertaNaLoja}
            disabled={travado}
            onCheckedChange={(marcado) => void classificar({ descobertaNaLoja: marcado === true })}
          />
          Apareceu aqui na loja, não estava agendada
        </label>
      )}

      {mostrarMotivo && (
        <div className="mt-3 grid gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[.06] p-3">
          <label className="text-xs font-bold uppercase tracking-wide text-amber-200" htmlFor={`motivo-${ticketKey}`}>
            Por que não foi possível resolver?
          </label>
          <NativeSelect
            id={`motivo-${ticketKey}`}
            value={dados.motivo ?? ""}
            disabled={travado}
            onChange={(event) => void classificar({ improdutiva: true, motivo: event.target.value })}
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
            defaultValue={dados.observacao ?? ""}
            disabled={travado}
            onBlur={(event) => {
              const texto = event.target.value.trim();
              if (texto !== (dados.observacao ?? "")) void classificar({ observacao: texto });
            }}
          />
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
    </section>
  );
}
