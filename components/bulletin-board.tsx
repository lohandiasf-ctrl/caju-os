"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2, Megaphone, Pin, Send, StickyNote } from "lucide-react";
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
      className="relative mt-6 overflow-hidden rounded-3xl border-2 border-amber-300/45 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,.22),transparent_30%),linear-gradient(135deg,rgba(30,41,59,.96),rgba(15,23,42,.98))] p-4 shadow-[0_0_38px_rgba(251,191,36,.12)] sm:p-5"
      aria-labelledby="bulletin-title"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[.18em] text-amber-100">
            <Megaphone className="size-3.5" aria-hidden="true" />
            Mural da equipe
          </span>
          <h2 id="bulletin-title" className="flex items-center gap-2 font-semibold">
            <StickyNote className="size-5 text-amber-200" aria-hidden="true" />
            Bilhetes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recados importantes aparecem aqui no início para ninguém perder.
          </p>
        </div>
        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">
          {notes.length} ativo(s)
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(19rem,25rem)_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="grid gap-2">
            <Input
              value={targetName}
              onChange={(event) => setTargetName(event.target.value)}
              placeholder="Para quem? Ex.: Aiã"
              maxLength={80}
              className="min-h-11 border-white/10 bg-black/30"
            />
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Assunto opcional"
              maxLength={100}
              className="min-h-11 border-white/10 bg-black/30"
            />
            <Textarea
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
              className="min-h-11 bg-amber-300 text-slate-950 hover:bg-amber-200"
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Deixar bilhete
            </Button>
          </div>
        </div>

        <div className="min-h-40 space-y-2">
          {loading ? (
            <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
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
