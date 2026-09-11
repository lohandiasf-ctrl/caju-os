"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageSquarePlus,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "aberto" | "analisando" | "planejado" | "concluido" | "recusado";

type Item = {
  id: number;
  authorEmail: string;
  kind: "sugestao" | "correcao";
  title: string;
  body: string;
  status: Status;
  handledBy: string | null;
  handledNote: string | null;
  createdAt: string;
  votes: number;
  votedByMe: boolean;
  mine: boolean;
};

const STATUSES = [
  "aberto",
  "analisando",
  "planejado",
  "concluido",
  "recusado",
] as const;

const LABEL: Record<Status, string> = {
  aberto: "Aberto",
  analisando: "Em análise",
  planejado: "Planejado",
  concluido: "Concluído",
  recusado: "Não será feito",
};

const TONE: Record<Status, string> = {
  aberto: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  analisando: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  planejado: "border-violet-400/25 bg-violet-400/10 text-violet-200",
  concluido: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  recusado: "border-border bg-muted/40 text-muted-foreground",
};

const chip = (active: boolean) =>
  `min-h-8 rounded-lg border px-3 text-xs font-semibold transition ${
    active
      ? "border-primary/50 bg-primary/15 text-primary"
      : "border-border text-muted-foreground hover:bg-muted"
  }`;

export function FeedbackBoard({
  user,
}: {
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [canTriage, setCanTriage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Item["kind"]>("sugestao");
  const [filter, setFilter] = useState<"todos" | Status>("todos");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/feedback", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        items?: Item[];
        canTriage?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setItems(payload.items ?? []);
      setCanTriage(Boolean(payload.canTriage));
    } catch {
      setMessage("Não foi possível carregar os feedbacks.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(
    method: "POST" | "PATCH",
    payload: Record<string, unknown>,
  ) {
    if (!user) return null;
    const response = await fetch("/api/feedback", {
      method,
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return (await response.json()) as { error?: string; voted?: boolean };
  }

  async function submit() {
    setSending(true);
    setMessage("");
    try {
      const result = await send("POST", { title, body, kind });
      if (result?.error) {
        setMessage(result.error);
        return;
      }
      setTitle("");
      setBody("");
      setMessage("Obrigado. Seu registro entrou na lista.");
      await load();
    } finally {
      setSending(false);
    }
  }

  // O apoio é alternado na hora: esperar a resposta fazia o clique parecer que
  // não tinha funcionado. Se o servidor recusar, recarrega e corrige.
  async function toggleVote(item: Item) {
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? {
              ...row,
              votedByMe: !row.votedByMe,
              votes: row.votes + (row.votedByMe ? -1 : 1),
            }
          : row,
      ),
    );
    const result = await send("PATCH", { id: item.id, action: "vote" });
    if (result?.error) await load();
  }

  async function changeStatus(item: Item, status: Status) {
    const result = await send("PATCH", { id: item.id, status });
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    await load();
  }

  const visible =
    filter === "todos" ? items : items.filter((item) => item.status === filter);

  return (
    <section className="space-y-4">
      <div className="surface-panel rounded-2xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <MessageSquarePlus className="size-4 shrink-0 text-primary" />
          Sugerir melhoria ou relatar problema
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobre o Caju OS: o que atrapalha, o que falta, o que quebrou. Todo
          mundo lê e pode apoiar.
        </p>
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap gap-2">
            {(["sugestao", "correcao"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={`inline-flex items-center gap-2 ${chip(kind === value)}`}
              >
                {value === "sugestao" ? (
                  <MessageSquarePlus className="size-3.5 shrink-0" />
                ) : (
                  <Wrench className="size-3.5 shrink-0" />
                )}
                {value === "sugestao" ? "Sugestão" : "Correção"}
              </button>
            ))}
          </div>
          <label htmlFor="feedback-title" className="text-sm font-medium">Assunto</label>
          <Input id="feedback-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Resuma em uma linha"
            maxLength={160}
            className="min-h-11"
          />
          <label htmlFor="feedback-body" className="text-sm font-medium">Descrição</label>
          <textarea id="feedback-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Descreva o que acontece hoje e o que melhoraria. Se for um problema, diga em qual tela."
            rows={4}
            maxLength={4000}
            className="field min-h-24 text-foreground"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              onClick={() => void submit()}
              disabled={
                sending || title.trim().length < 4 || body.trim().length < 10
              }
            >
              {sending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MessageSquarePlus />
              )}{" "}
              Enviar
            </Button>
            {message && (
              <output className="text-xs text-muted-foreground">{message}</output>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["todos", ...STATUSES] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={chip(filter === value)}
          >
            {value === "todos" ? "Todos" : LABEL[value]}
            {value !== "todos" &&
              ` (${items.filter((item) => item.status === value).length})`}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && visible.length === 0 && (
        <p className="surface-panel rounded-2xl p-5 text-sm text-muted-foreground">
          Nada por aqui ainda. Seja o primeiro a registrar.
        </p>
      )}

      <div className="grid gap-3">
        {visible.map((item) => (
          <article key={item.id} className="surface-panel rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${TONE[item.status]}`}
                  >
                    {LABEL[item.status]}
                  </span>
                  <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {item.kind === "sugestao" ? "Sugestão" : "Correção"}
                  </span>
                  {item.mine && (
                    <span className="text-[11px] text-primary">seu</span>
                  )}
                </div>
                <h3 className="mt-2 break-words font-bold">{item.title}</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {item.body}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {item.authorEmail} ·{" "}
                  {new Date(item.createdAt).toLocaleString("pt-BR")}
                </p>
                {item.handledNote && (
                  <p className="mt-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
                    <b>Resposta:</b> {item.handledNote}
                    {item.handledBy && (
                      <span className="block text-[11px] text-muted-foreground">
                        {item.handledBy}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void toggleVote(item)}
                aria-pressed={item.votedByMe}
                aria-label={item.votedByMe ? "Remover apoio" : "Apoiar"}
                className={`flex min-h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border transition ${
                  item.votedByMe
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <ThumbsUp className="size-4 shrink-0" />
                <span className="text-sm font-bold tabular-nums">
                  {item.votes}
                </span>
              </button>
            </div>
            {canTriage && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Andamento:
                </span>
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => void changeStatus(item, status)}
                    disabled={item.status === status}
                    className={`${chip(item.status === status)} px-2.5 text-[11px] disabled:opacity-40`}
                  >
                    {LABEL[status]}
                  </button>
                ))}
                {item.status === "concluido" && (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
