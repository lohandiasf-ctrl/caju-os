"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleStop,
  Clock3,
  Layers3,
  Loader2,
  Play,
  Search,
  TicketCheck,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import { elapsedLabel, normalizeFsaKeys } from "@/lib/active-attendances";

export type ActiveAttendanceTicket = {
  id: number;
  attendanceId: number;
  ticketKey: string;
  summary: string;
  store: string | null;
  city: string | null;
  createdAt: string;
};

type ActiveAttendance = {
  id: number;
  ownerEmail: string;
  ownerName: string;
  startedAt: string;
  endedAt: string | null;
  tickets: ActiveAttendanceTicket[];
};

type TicketSuggestion = {
  key: string;
  summary: string;
  store?: string | null;
  city?: string | null;
};

type Props = {
  availableTickets: TicketSuggestion[];
  onOpenTicket: (ticket: ActiveAttendanceTicket) => void;
};

export function ActiveAttendances({ availableTickets, onOpenTicket }: Props) {
  const { user, role } = useAuth();
  const [attendances, setAttendances] = useState<ActiveAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<TicketSuggestion[]>([]);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [endingId, setEndingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/active-attendances", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { attendances?: ActiveAttendance[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar atendimentos.");
      setAttendances(payload.attendances ?? []);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar atendimentos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void load(), 0);
    const refresh = window.setInterval(() => void load(), 30_000);
    return () => { window.clearTimeout(firstLoad); window.clearInterval(refresh); };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (!query || normalizeFsaKeys(draft).length > 1) return [];
    return availableTickets
      .filter((ticket) => !selected.some((item) => item.key === ticket.key))
      .filter((ticket) => [ticket.key, ticket.summary, ticket.store, ticket.city].filter(Boolean).some((value) => value!.toLowerCase().includes(query)))
      .slice(0, 6);
  }, [availableTickets, draft, selected]);

  const verifyAndAdd = async (keys: string[]) => {
    const uniqueKeys = keys.filter((key) => !selected.some((item) => item.key === key));
    if (!uniqueKeys.length) return;
    if (!user) return;
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/api/active-attendances/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticketKeys: uniqueKeys }),
      });
      const payload = (await response.json()) as {
        valid?: TicketSuggestion[];
        invalid?: string[];
        error?: string;
      };
      if (payload.valid?.length) {
        setSelected((current) => [...current, ...payload.valid!.filter((ticket) => !current.some((item) => item.key === ticket.key))]);
      }
      if (!response.ok || payload.invalid?.length) {
        setError(payload.error ?? `Não foram encontradas no Jira: ${payload.invalid?.join(", ")}.`);
      }
      if (payload.valid?.length) setDraft("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível verificar as FSAs no Jira.");
    } finally {
      setChecking(false);
    }
  };

  const start = async () => {
    if (!user || !selected.length) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/active-attendances", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticketKeys: selected.map((item) => item.key) }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível iniciar o atendimento.");
      setDialogOpen(false);
      setDraft("");
      setSelected([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível iniciar o atendimento.");
    } finally {
      setSubmitting(false);
    }
  };

  const end = async (attendance: ActiveAttendance) => {
    if (!user) return;
    setEndingId(attendance.id);
    setError("");
    try {
      const response = await fetch(`/api/active-attendances/${attendance.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível encerrar o atendimento.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível encerrar o atendimento.");
    } finally {
      setEndingId(null);
    }
  };

  const isOwner = (attendance: ActiveAttendance) =>
    attendance.ownerEmail.toLowerCase() === user?.email?.toLowerCase();

  return (
    <section className="surface-panel mt-6 rounded-2xl p-4 sm:mt-7 sm:p-5" aria-labelledby="active-attendances-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex size-3" aria-hidden="true"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex size-3 rounded-full bg-emerald-400" /></span>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-300">Operação ao vivo</p>
          </div>
          <h2 id="active-attendances-title" className="mt-1 text-lg font-bold">Atendimentos em andamento</h2>
          <p className="mt-1 text-sm text-muted-foreground">Veja quem está trabalhando em cada chamado neste momento.</p>
        </div>
        <Button className="min-h-11 shrink-0 font-bold" onClick={() => { setError(""); setDialogOpen(true); }} disabled={!user}>
          <Play aria-hidden="true" /> Iniciar atendimento
        </Button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p>}

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {loading ? (
          <AttendanceLoading />
        ) : attendances.length ? (
          attendances.map((attendance) => {
            const grouped = attendance.tickets.length > 1;
            const open = expanded.has(attendance.id);
            return (
              <article key={attendance.id} className={`rounded-2xl border p-4 transition ${grouped ? "border-cyan-400/35 bg-cyan-400/[.07] shadow-[inset_3px_0_0_rgba(34,211,238,.8)]" : "border-border bg-background/40"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {grouped ? <Layers3 className="size-4 text-cyan-300" aria-hidden="true" /> : <TicketCheck className="size-4 text-emerald-300" aria-hidden="true" />}
                      <p className={`text-xs font-bold uppercase tracking-wide ${grouped ? "text-cyan-200" : "text-emerald-200"}`}>{grouped ? `Atendimento agrupado · ${attendance.tickets.length} FSAs` : "Em atendimento"}</p>
                    </div>
                    <p className="mt-2 truncate text-sm font-bold">{grouped ? attendance.tickets.map((ticket) => ticket.ticketKey).join(" · ") : attendance.tickets[0]?.ticketKey}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{grouped ? `${attendance.tickets[0]?.summary ?? ""}${attendance.tickets.length > 1 ? ` e mais ${attendance.tickets.length - 1}` : ""}` : attendance.tickets[0]?.summary}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-bold tabular-nums text-emerald-100"><Clock3 className="mr-1 inline size-3" aria-hidden="true" />{elapsedLabel(attendance.startedAt, now ?? Date.parse(attendance.startedAt))}</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="min-w-0 truncate"><UsersRound className="mr-1 inline size-3" aria-hidden="true" />{attendance.ownerName}</span><span>{isOwner(attendance) ? "Seu atendimento" : "Em execução"}</span></div>
                {grouped && (
                  <div className="mt-3">
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(attendance.id)) next.delete(attendance.id); else next.add(attendance.id); return next; })} aria-expanded={open}>
                      {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}{open ? "Ocultar chamados" : `Ver os ${attendance.tickets.length} chamados`}
                    </Button>
                    {open && <ul className="mt-2 space-y-1.5 border-l border-cyan-400/25 pl-3">{attendance.tickets.map((ticket) => <li key={ticket.id}><button type="button" onClick={() => onOpenTicket(ticket)} className="w-full rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><b className="text-cyan-100">{ticket.ticketKey}</b><span className="ml-1 text-muted-foreground">· {ticket.summary}</span></button></li>)}</ul>}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!grouped && attendance.tickets[0] && <Button variant="outline" size="sm" onClick={() => onOpenTicket(attendance.tickets[0])}>Abrir chamado</Button>}
                  {(isOwner(attendance) || role === "gerencia") && <Button variant="ghost" size="sm" className="text-rose-200 hover:bg-rose-400/10 hover:text-rose-100" onClick={() => void end(attendance)} disabled={endingId === attendance.id}>{endingId === attendance.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CircleStop aria-hidden="true" />}{grouped ? "Encerrar todos" : "Encerrar"}</Button>}
                </div>
              </article>
            );
          })
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/30 px-5 py-8 text-center"><TicketCheck className="size-7 text-muted-foreground" aria-hidden="true" /><p className="mt-3 font-semibold">Nenhum atendimento em andamento</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Quando alguém iniciar um atendimento com uma ou mais FSAs, ele aparecerá aqui para toda a equipe.</p></div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setDraft(""); setSelected([]); setError(""); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Iniciar atendimento</DialogTitle><DialogDescription>Busque uma FSA no menu ou cole vários códigos. Só chamados reais do Jira poderão ser adicionados.</DialogDescription></DialogHeader>
          <div className="mt-2 space-y-3">
            <label htmlFor="attendance-fsa" className="text-sm font-semibold">FSAs do atendimento</label>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="attendance-fsa" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void verifyAndAdd(normalizeFsaKeys(draft)); } }} placeholder="Ex.: FSA-132074, FSA-132073" className="min-h-11 pl-9" aria-describedby="attendance-fsa-help" /></div>
            <p id="attendance-fsa-help" className="text-xs text-muted-foreground">Separe com vírgula, espaço ou quebra de linha. Cada FSA será conferida no Jira antes de iniciar.</p>
            {suggestions.length > 0 && <div className="rounded-xl border border-border bg-background/60 p-1" aria-label="Chamados encontrados"><p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Chamados encontrados na fila</p>{suggestions.map((ticket) => <button key={ticket.key} type="button" className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => void verifyAndAdd([ticket.key])}><TicketCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0"><b className="text-sm">{ticket.key}</b><span className="ml-1 text-xs text-muted-foreground">· {ticket.summary}</span></span></button>)}</div>}
            <Button variant="outline" className="w-full" onClick={() => void verifyAndAdd(normalizeFsaKeys(draft))} disabled={checking || !normalizeFsaKeys(draft).length}>{checking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <TicketCheck aria-hidden="true" />}Adicionar e verificar FSAs</Button>
            <div aria-live="polite" className="min-h-8">{selected.length ? <div className="flex flex-wrap gap-2">{selected.map((ticket) => <span key={ticket.key} className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-100">{ticket.key}<button type="button" onClick={() => setSelected((current) => current.filter((item) => item.key !== ticket.key))} className="grid size-4 place-items-center rounded-full hover:bg-emerald-100/20" aria-label={`Remover ${ticket.key}`}><X className="size-3" /></button></span>)}</div> : <p className="text-xs text-muted-foreground">Nenhuma FSA confirmada ainda.</p>}</div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancelar</Button><Button onClick={() => void start()} disabled={!selected.length || submitting}>{submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}Iniciar {selected.length > 1 ? `atendimento com ${selected.length} FSAs` : "atendimento"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AttendanceLoading() {
  return <div className="col-span-full grid gap-3 xl:grid-cols-2">{[0, 1].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-border bg-muted/30" />)}</div>;
}
