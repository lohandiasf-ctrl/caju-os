"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2, Pin, Plus, Send, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Note = {
  id: number;
  authorEmail: string;
  authorName: string | null;
  targetName: string | null;
  title: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

export function BulletinBoard({
  user,
}: {
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [composing, setComposing] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [canArchiveAny, setCanArchiveAny] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/bilhetes", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        notes?: Note[];
        canArchiveAny?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setNotes(payload.notes ?? []);
      setCanArchiveAny(Boolean(payload.canArchiveAny));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os bilhetes.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!user) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/bilhetes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetName, title, note }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      setTargetName("");
      setTitle("");
      setNote("");
      setComposing(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o bilhete.");
    } finally {
      setSending(false);
    }
  }

  async function archive(id: number) {
    if (!user) return;
    setNotes((current) => current.filter((item) => item.id !== id));
    try {
      const response = await fetch("/api/bilhetes", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, action: "archive" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível arquivar o bilhete.");
      await load();
    }
  }

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-2xl border border-amber-300/25 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,.10),transparent_34%),linear-gradient(135deg,rgba(30,41,59,.96),rgba(15,23,42,.98))] p-4 shadow-[0_10px_30px_rgba(0,0,0,.18)] sm:p-5"
      aria-labelledby="bulletin-title"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="bulletin-title" className="flex flex-wrap items-center gap-2 font-semibold">
            <StickyNote className="size-[18px] shrink-0 text-amber-200" aria-hidden="true" />
            Mural da equipe
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-100">
              {notes.length}
              <span className="sr-only"> {notes.length === 1 ? "bilhete ativo" : "bilhetes ativos"}</span>
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recados importantes aparecem aqui no início para ninguém perder.
          </p>
        </div>
        <Button variant="outline" aria-expanded={composing} aria-controls="bulletin-compose" onClick={() => setComposing((current) => !current)} className="border-amber-300/30 text-amber-100"><Plus />{composing ? "Fechar formulário" : "Novo bilhete"}</Button>
      </div>

      <div className={`mt-4 grid gap-3 ${composing ? "xl:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]" : ""}`}>
        {composing && <div id="bulletin-compose" className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="grid gap-2">
            <label htmlFor="note-target" className="text-xs font-medium text-muted-foreground">Para quem</label>
            <Input id="note-target"
              value={targetName}
              onChange={(event) => setTargetName(event.target.value)}
              placeholder="Para quem? Ex.: Aiã"
              maxLength={80}
              className="min-h-11 border-white/10 bg-black/30"
            />
            <label htmlFor="note-title" className="text-xs font-medium text-muted-foreground">Assunto <span className="font-normal">(opcional)</span></label>
            <Input id="note-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Assunto opcional"
              maxLength={100}
              className="min-h-11 border-white/10 bg-black/30"
            />
            <label htmlFor="note-body" className="text-xs font-medium text-muted-foreground">Recado</label>
            <Textarea id="note-body"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ex.: lembrar de procurar o técnico de Jaguaquara"
              maxLength={800}
              className="min-h-24 resize-none border-white/10 bg-black/30"
            />
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={sending || note.trim().length < 6}
              variant="secondary"
              className="min-h-11 bg-amber-300 text-slate-950 hover:bg-amber-200"
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Deixar bilhete
            </Button>
          </div>
        </div>}

        <div className="min-w-0 space-y-2">
          {loading ? (
            <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              Carregando bilhetes...
            </div>
          ) : notes.length ? (
            notes.map((item) => (
              <article key={item.id} className="rounded-2xl border border-amber-300/20 bg-black/25 p-3">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-200">
                    <Pin className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold">{item.title}</h3>
                      {item.targetName && (
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          Para {item.targetName}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{item.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.authorName || item.authorEmail.split("@")[0]} · {formatDate(item.createdAt)}
                    </p>
                  </div>
                  {(item.mine || canArchiveAny) && (
                    <button
                      type="button"
                      onClick={() => void archive(item.id)}
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Arquivar bilhete ${item.title}`}
                      title="Arquivar"
                    >
                      <Archive className="size-4" />
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Nenhum bilhete ativo.
            </div>
          )}
        </div>
      </div>
      {message && <p className="mt-3 text-sm text-amber-200">{message}</p>}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
