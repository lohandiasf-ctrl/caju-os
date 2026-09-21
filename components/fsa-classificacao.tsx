"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Layers3, Loader2, ShieldAlert, UserRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
type Tecnico = { id: number; name: string; city: string; state: string };
// O que o diálogo já sabe do chamado. Serve para montar o grupo quando o
// chamado ainda não tem um — o nome do grupo sai da cidade e da loja.
type ChamadoAberto = { title: string; store: string; city: string; technician?: string };

/**
 * O tipo da FSA — atuação, evidência, improdutiva — marcado na tela do chamado.
 *
 * É quem opera o chamado que sabe o que aconteceu na loja; a tela financeira só
 * confere e aprova. O tipo pertence ao grupo em que o chamado está. Chamado
 * ainda sem grupo não fica sem ter onde marcar: escolhido o técnico, marcar o
 * tipo cria o grupo dele na hora.
 */
export function FsaClassificacao({
  ticketKey,
  user,
  chamado,
}: {
  ticketKey: string;
  user: User;
  chamado?: ChamadoAberto;
}) {
  const [dados, setDados] = useState<Classificacao | null>(null);
  const [passadasPagas, setPassadasPagas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState("");
  // Clicou em "Improdutiva" e ainda não escolheu o motivo. O servidor recusa
  // improdutiva sem motivo, então a marcação fica só na tela até ele vir.
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  // Para o chamado sem grupo: o técnico que atendeu, escolhido no cadastro.
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [busca, setBusca] = useState(chamado?.technician ?? "");
  const [tecnicoId, setTecnicoId] = useState<number | null>(null);

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

  const semGrupo = !loading && !dados;

  // O cadastro de técnicos só é buscado quando o chamado não tem grupo: é o
  // único caso em que o técnico precisa ser escolhido aqui.
  useEffect(() => {
    if (!semGrupo || !user || tecnicos.length) return;
    let active = true;
    void user
      .getIdToken()
      .then((token) => fetch("/api/technicians", { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (response) => (response.ok ? ((await response.json()) as { technicians?: Tecnico[] }) : { technicians: [] }))
      .then((payload) => {
        if (active) setTecnicos(payload.technicians ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [semGrupo, user, tecnicos.length]);

  /**
   * Chamado sem grupo: marcar o tipo cria o grupo dele, com este chamado só.
   *
   * O nome do grupo o servidor tira da cidade e da loja. Se depois aparecer
   * outro chamado da mesma visita, dá para agrupar os dois pela fila.
   */
  const agruparEMarcar = async (tipo: "servico" | "evidencia") => {
    if (!user || !tecnicoId) return;
    setSalvando(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" };
      const criado = await fetch("/api/fsa-groups", {
        method: "POST",
        headers,
        body: JSON.stringify({
          technicianId: tecnicoId,
          tickets: [{ key: ticketKey, summary: chamado?.title, store: chamado?.store, city: chamado?.city }],
        }),
      });
      const grupo = (await criado.json()) as { grupo?: { id: number }; error?: string };
      if (!criado.ok || !grupo.grupo) throw new Error(grupo.error ?? "Não foi possível agrupar o chamado.");
      const marcado = await fetch(`/api/fsa-groups/${grupo.grupo.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ticketKey, tipo, improdutiva: false, motivo: null, descobertaNaLoja: false }),
      });
      const resposta = (await marcado.json()) as { error?: string };
      if (!marcado.ok) throw new Error(resposta.error ?? "O grupo foi criado, mas o tipo não foi salvo.");
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
    const termo = busca.trim().toLowerCase();
    const achados = termo.length > 1 ? tecnicos.filter((t) => t.name.toLowerCase().includes(termo)).slice(0, 6) : [];
    const escolhido = tecnicos.find((t) => t.id === tecnicoId);
    return (
      <section className="rounded-xl border border-emerald-400/25 bg-background/80 p-3 shadow-sm" aria-label="Tipo da FSA">
        <p className="text-sm font-bold">Tipo da FSA</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Escolha o técnico que atendeu e marque o tipo.
          {passadasPagas > 0 && ` Este chamado já teve ${passadasPagas === 1 ? "um atendimento pago" : `${passadasPagas} atendimentos pagos`} antes; este conta à parte.`}
        </p>

        <label className="mt-3 block text-xs font-semibold text-muted-foreground" htmlFor={`tecnico-${ticketKey}`}>
          Técnico que atendeu
        </label>
        <Input
          id={`tecnico-${ticketKey}`}
          className="mt-1 min-h-11"
          value={escolhido ? escolhido.name : busca}
          placeholder="Busque pelo nome"
          disabled={salvando}
          onChange={(event) => {
            setBusca(event.target.value);
            setTecnicoId(null);
          }}
        />
        {!escolhido && achados.length > 0 && (
          <div className="mt-1 rounded-xl border border-border bg-background/60 p-1">
            {achados.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTecnicoId(t.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <UserRound className="size-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <b>{t.name}</b>
                <span className="text-xs text-muted-foreground">
                  {t.city}/{t.state}
                </span>
              </button>
            ))}
          </div>
        )}
        {!escolhido && termo.length > 1 && !achados.length && tecnicos.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">Nenhum técnico com esse nome no cadastro.</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={!tecnicoId || salvando}
            onClick={() => void agruparEMarcar("servico")}
          >
            <Wrench aria-hidden="true" /> Atuação
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={!tecnicoId || salvando}
            onClick={() => void agruparEMarcar("evidencia")}
          >
            <Camera aria-hidden="true" /> Evidência
          </Button>
          {salvando && <Loader2 className="size-4 animate-spin self-center text-muted-foreground" aria-hidden="true" />}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Improdutiva é marcada depois de escolher Atuação, com o motivo.
        </p>
        {error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
      </section>
    );
  }

  const travado = !dados.podeEditar || salvando;
  const mostrarMotivo = dados.tipo === "servico" && (dados.improdutiva || pedindoMotivo);

  return (
    <section
      className="rounded-xl border border-emerald-400/25 bg-background/80 p-3 shadow-sm"
      aria-label="Tipo da FSA"
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
