"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  History,
  Loader2,
  MapPin,
  PackageOpen,
  Save,
  ShieldCheck,
  Store,
  TrendingUp,
  Truck,
  Wrench,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Technician = {
  id: number;
  name: string;
  city: string;
  state: string;
  status?: string;
  approved?: boolean;
  availableTools?: string | null;
  specialties?: string | null;
  extraCities?: string | null;
};
type Props = {
  open: boolean;
  ticket: {
    id: string;
    title: string;
    store: string;
    city: string;
    rawStatus?: string;
  };
  role: string | null;
  user: { getIdToken: () => Promise<string> } | null;
  onOpenChange: (open: boolean) => void;
  onArchived: (ticketKey: string) => void;
  onSaved?: (ticketKey: string) => void;
};
type Form = Record<string, string | number | boolean | null>;
type Intelligence = {
  requesters: Array<{
    id: number;
    name: string;
    role: string | null;
    phone: string | null;
    createdAt: string;
  }>;
  shipments: Array<{
    id: number;
    source: string;
    trackingCode: string;
    carrier: string | null;
    status: string;
    expectedAt: string | null;
    updatedAt: string;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    assignedTo: string | null;
    acceptedBy: string | null;
    status: string;
    progressNote: string | null;
    nextCheckAt: string;
  }>;
  snapshots: Array<{
    id: number;
    actorEmail: string;
    reason: string;
    createdAt: string;
  }>;
  audit?: Array<{
    id: number;
    action: string;
    actorEmail: string;
    details: string | null;
    createdAt: string;
  }>;
};
const statuses = [
  ["triage", "Triagem"],
  ["scheduling", "Pendente de agendamento"],
  ["scheduled", "Agendado"],
  ["operational_preparation", "Preparação operacional"],
  ["in_service", "Técnico em campo"],
  ["technical_pending", "Pendência técnica"],
  ["validated", "Validado"],
  ["awaiting_approval", "Aguardando aprovação"],
  ["awaiting_spare", "Aguardando spare"],
  ["spare_validated", "Spare validado"],
  ["awaiting_payment", "Aguardando pagamento"],
  ["resolved", "Resolvido"],
  ["cancelled", "Cancelado"],
];
const purchaseStatuses = [
  "Agendado",
  "Cancelado",
  "Comprado",
  "Delfia",
  "Direcionado",
  "Encerrado",
  "Enviado",
  "Fechado",
  "Finalizado",
  "Indisponível",
  "Parceiro Delfia",
  "Pendente",
  "Recebido",
  "Reenviado",
];
const initial = (ticket: Props["ticket"]): Form => ({
  ticketKey: ticket.id,
  storeCode: ticket.store.replace(/^Código da loja:\s*/i, ""),
  storeName: "",
  city: ticket.city,
  status: localStatus(ticket.rawStatus),
  openedAt: new Date().toISOString().slice(0, 16),
  technicianId: null,
  scheduledAt: "",
  expectedReturnAt: "",
  clientValueCents: null,
  payoutCents: null,
  partsValueCents: null,
  partsSaleCents: null,
  paidValueCents: null,
  spareSource: "",
  purchaseStatus: "",
  validationStatus: "",
  paymentDate: "",
  identifiedProblem: "",
  testsPerformed: "",
  partToReplace: "",
  changeReason: "",
});

export function OperationWorkflowDialog({
  open,
  ticket,
  role,
  user,
  onOpenChange,
  onArchived,
  onSaved,
}: Props) {
  const [form, setForm] = useState<Form>(() => initial(ticket));
  const [visits, setVisits] = useState<
    Array<{
      id: number;
      visitNumber: number;
      scheduledAt: string | null;
      expectedReturnAt: string | null;
      status: string;
      note: string | null;
    }>
  >([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [technicianQuery, setTechnicianQuery] = useState("");
  const [intelligence, setIntelligence] = useState<Intelligence>({
    requesters: [],
    shipments: [],
    tasks: [],
    snapshots: [],
    audit: [],
  });
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingSource, setTrackingSource] = useState<"Delfia" | "Caju">(
    "Delfia",
  );
  const [trackingEta, setTrackingEta] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const financial = role === "gerencia";
  const set = (key: string, value: Form[string]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const money = (key: string) => ({
    value:
      typeof form[key] === "number" && form[key] !== null
        ? String(Number(form[key]) / 100)
        : "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      set(key, moneyToCents(event.target.value)),
    inputMode: "decimal" as const,
  });

  useEffect(() => {
    if (!open || !user) return;
    let live = true;
    setLoading(true);
    setMessage("");
    setTechnicianQuery("");
    setForm(initial(ticket));
    setVisits([]);
    void user
      .getIdToken()
      .then(async (token) => {
        const headers = { Authorization: `Bearer ${token}` };
        const [
          operationResponse,
          techniciansResponse,
          jiraResponse,
          intelligenceResponse,
        ] = await Promise.all([
          fetch(`/api/operations?ticket=${encodeURIComponent(ticket.id)}`, {
            headers,
            cache: "no-store",
          }),
          fetch("/api/technicians", { headers }),
          fetch(`/api/jira/issues/${encodeURIComponent(ticket.id)}`, {
            headers,
            cache: "no-store",
          }),
          fetch(
            `/api/operations/intelligence?ticket=${encodeURIComponent(ticket.id)}`,
            { headers, cache: "no-store" },
          ),
        ]);
        const operation = (await operationResponse.json()) as {
          workflow?: Form | null;
          visits?: typeof visits;
          store?: Form | null;
          audit?: unknown[];
          error?: string;
        };
        const techPayload = (await techniciansResponse.json()) as {
          technicians?: Technician[];
        };
        const jiraPayload = (await jiraResponse.json()) as {
          status?: string;
          operationalFields?: Record<string, string | null>;
        };
        const intelligencePayload =
          (await intelligenceResponse.json()) as Intelligence;
        if (!operationResponse.ok)
          throw new Error(operation.error || "Falha ao carregar operação.");
        if (live) {
          const jira = jiraPayload.operationalFields ?? {};
          const currentJira = jiraResponse.ok
            ? {
                status: localStatus(jiraPayload.status),
                storeCode: jira.storeCode,
                storeName: jira.storeName,
                requesterName: jira.contactName,
                requesterPhone: jira.contactPhone,
                category: jira.problemCategory,
                pdvNumber: jira.pdvNumber,
                scheduledAt: jira.scheduledDateTime,
                clientValueCents: jira.ticketTotal
                  ? moneyToCents(String(jira.ticketTotal))
                  : automaticCategoryPrice(String(jira.problemCategory ?? "")),
              }
            : {};
          const jiraValues = Object.fromEntries(
            Object.entries(currentJira).filter(
              ([, value]) => value !== null && value !== "",
            ),
          );
          setForm({
            ...initial(ticket),
            ...jiraValues,
            ...(operation.workflow ?? {}),
            ...(operation.store ?? {}),
            status:
              jiraValues.status ??
              operation.workflow?.status ??
              initial(ticket).status,
            category: jiraValues.category ?? operation.workflow?.category ?? "",
            scheduledAt:
              jiraValues.scheduledAt ?? operation.workflow?.scheduledAt ?? "",
            storeCode:
              jiraValues.storeCode ??
              operation.workflow?.storeCode ??
              initial(ticket).storeCode,
            storeName:
              jiraValues.storeName ?? operation.workflow?.storeName ?? "",
            requesterName:
              jiraValues.requesterName ?? operation.store?.requesterName ?? "",
            requesterPhone:
              jiraValues.requesterPhone ??
              operation.store?.requesterPhone ??
              "",
            pdvNumber:
              jiraValues.pdvNumber ?? operation.workflow?.pdvNumber ?? "",
          });
          setVisits(operation.visits ?? []);
          setTechnicians(techPayload.technicians ?? []);
          if (intelligenceResponse.ok) setIntelligence(intelligencePayload);
        }
      })
      .catch((error: unknown) => {
        if (live)
          setMessage(
            error instanceof Error
              ? error.message
              : "Falha ao carregar operação.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open, ticket, user]);

  async function lookupStore() {
    if (!user || !String(form.storeCode ?? "").trim()) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/operations?storeCode=${encodeURIComponent(String(form.storeCode))}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const payload = (await response.json()) as { store?: Form | null };
      if (payload.store)
        setForm((current) => ({ ...current, ...payload.store }));
      else setMessage("Loja não cadastrada. Preencha dados abaixo para criar.");
    } catch {
      setMessage("Não foi possível consultar loja.");
    }
  }
  async function save(addVisit = false, confirmPayment = false) {
    if (!user) return;
    setSaving(true);
    setMessage("");
    try {
      const token = await user.getIdToken();
      const payload = {
        ...form,
        technicianId: Number(form.technicianId) || null,
        scheduledAt: toIso(form.scheduledAt),
        expectedReturnAt: toIso(form.expectedReturnAt),
        openedAt: toIso(form.openedAt),
        paymentDate: toIso(form.paymentDate),
        addVisit,
        confirmPayment,
      };
      const response = await fetch("/api/operations", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        workflow?: Form;
        visits?: typeof visits;
        error?: string;
        notice?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Falha ao salvar operação.");
      if (data.workflow)
        setForm((current) => ({ ...current, ...data.workflow }));
      setVisits(data.visits ?? []);
      setMessage(
        data.notice ||
          (confirmPayment
            ? "Pagamento confirmado. Chamado arquivado."
            : addVisit
              ? "Nova visita adicionada ao histórico."
              : "Operação salva."),
      );
      if (confirmPayment) onArchived(ticket.id);
      else onSaved?.(ticket.id);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao salvar operação.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveIntelligence(
    action: "shipment" | "task",
    extra: Record<string, unknown>,
  ) {
    if (!user) return;
    setSaving(true);
    setMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/operations/intelligence", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ticketKey: ticket.id, ...extra }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error);
      const refreshed = await fetch(
        `/api/operations/intelligence?ticket=${encodeURIComponent(ticket.id)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      setIntelligence((await refreshed.json()) as Intelligence);
      setTrackingCode("");
      setTrackingEta("");
      setTaskTitle("");
      setTaskAssignee("");
      setMessage(
        action === "shipment"
          ? "Rastreio salvo e monitorado."
          : "Atividade criada para acompanhamento.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao registrar.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function updateTask(
    id: number,
    status: "accepted" | "in_progress" | "done",
  ) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/operations/intelligence", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        status,
        progressNote:
          status === "done"
            ? "Concluído pelo sistema"
            : status === "in_progress"
              ? "Já entrei em contato"
              : "Vou realizar",
      }),
    });
    const refreshed = await fetch(
      `/api/operations/intelligence?ticket=${encodeURIComponent(ticket.id)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    setIntelligence((await refreshed.json()) as Intelligence);
  }
  async function restorePreview(snapshotId: number) {
    if (
      !user ||
      !window.confirm(
        "Carregar este backup no formulário? Nada será alterado até você clicar em Salvar operação.",
      )
    )
      return;
    const token = await user.getIdToken();
    const response = await fetch("/api/operations/intelligence", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "restore-preview", snapshotId }),
    });
    const payload = (await response.json()) as {
      snapshot?: Form | { fields?: Record<string, unknown>; status?: string };
      error?: string;
    };
    if (!response.ok || !payload.snapshot) {
      setMessage(payload.error || "Não foi possível abrir o backup.");
      return;
    }
    const rawSnapshot = payload.snapshot as Record<string, unknown>;
    const snapshot = rawSnapshot.fields && typeof rawSnapshot.fields === "object"
      ? { ...(rawSnapshot.fields as Record<string, unknown>), status: localStatus(typeof rawSnapshot.status === "string" ? rawSnapshot.status : "") }
      : rawSnapshot;
    setForm((current) => ({ ...current, ...snapshot, ticketKey: ticket.id }));
    setMessage(
      "Backup carregado. Revise e clique em Salvar operação para aplicar.",
    );
  }
  const technicianOptions = useMemo(() => {
    const query = technicianQuery.trim().toLocaleLowerCase("pt-BR");
    const unique = Array.from(
      new Map(
        technicians.map((tech) => [
          `${tech.name.trim().toLocaleLowerCase("pt-BR")}|${tech.city.trim().toLocaleLowerCase("pt-BR")}|${tech.state}`,
          tech,
        ]),
      ).values(),
    );
    return unique
      .filter(
        (tech) =>
          !query ||
          `${tech.name} ${tech.city} ${tech.state}`
            .toLocaleLowerCase("pt-BR")
            .includes(query),
      )
      .map((tech) => (
        <option key={tech.id} value={tech.id}>
          {tech.name} · {tech.city}/{tech.state}
        </option>
      ));
  }, [technicianQuery, technicians]);
  const margin =
    Number(form.clientValueCents ?? 0) -
    Number(form.payoutCents ?? 0) -
    Number(form.partsValueCents ?? 0);
  const marginLevel =
    margin > 0 && margin >= Number(form.clientValueCents ?? 0) * 0.35
      ? "Alta lucratividade · priorizar agendamento"
      : margin <= 0
        ? "Baixa lucratividade · validar outras pendências em até 24h"
        : "Margem regular";
  const selectedTechnician = technicians.find(
    (tech) => tech.id === Number(form.technicianId),
  );
  const recommendedTechnicians = recommendTechnicians(technicians, {
    city: String(form.city ?? ticket.city ?? ""),
    state: String(form.state ?? ""),
    category: String(form.category ?? ticket.title ?? ""),
    priority:
      margin > 0 && margin >= Number(form.clientValueCents ?? 0) * 0.35
        ? "alta"
        : margin <= 0
          ? "baixa"
          : "normal",
    marginCents: margin,
  }).slice(0, 3);
  const articles = knowledgeArticles(String(form.category ?? ""), ticket.title);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="size-5 text-primary" /> Gestão operacional ·{" "}
            {ticket.id}
          </DialogTitle>
          <DialogDescription>
            Dados atuais do Jira, histórico e operação Caju.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="grid min-h-52 place-items-center">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
            <section className="sticky top-0 z-10 grid gap-3 rounded-xl border border-primary/25 bg-background p-4 shadow-lg sm:grid-cols-3">
              <Field label="Etapa">
                <select
                  value={String(form.status ?? "triage")}
                  onChange={(event) => set("status", event.target.value)}
                  className="field"
                >
                  {statuses.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data/hora abertura">
                <Input
                  type="datetime-local"
                  value={dateField(form.openedAt)}
                  onChange={(event) => set("openedAt", event.target.value)}
                />
              </Field>
              <Field label="Categoria/problema">
                <Input
                  value={String(form.category ?? "")}
                  onChange={(event) => set("category", event.target.value)}
                  placeholder="Categoria atual do Jira"
                />
              </Field>
              <Field label="Técnico">
                <div className="space-y-2">
                  <Input
                    type="search"
                    value={technicianQuery}
                    onChange={(event) => setTechnicianQuery(event.target.value)}
                    placeholder="Pesquisar por nome ou cidade"
                    aria-label="Pesquisar técnico"
                  />
                  <select
                    value={String(form.technicianId ?? "")}
                    onChange={(event) =>
                      set("technicianId", Number(event.target.value) || null)
                    }
                    className="field"
                  >
                    <option value="">Selecionar técnico</option>
                    {technicianOptions}
                  </select>
                </div>
              </Field>
              <Field label="Agendamento">
                <Input
                  type="datetime-local"
                  value={dateField(form.scheduledAt)}
                  onChange={(event) => set("scheduledAt", event.target.value)}
                />
              </Field>
              <Field label="Retorno previsto">
                <Input
                  type="datetime-local"
                  value={dateField(form.expectedReturnAt)}
                  onChange={(event) =>
                    set("expectedReturnAt", event.target.value)
                  }
                />
              </Field>
            </section>
            <section
              className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${margin <= 0 ? "border-amber-400/30 bg-amber-400/10" : "border-emerald-400/30 bg-emerald-400/10"}`}
            >
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <TrendingUp className="size-4" />
                  Inteligência de rentabilidade
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {marginLevel}
                </p>
              </div>
              <output className="text-xl font-bold tabular-nums">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(margin / 100)}
              </output>
            </section>
            <Section icon={Brain} title="Central inteligente do chamado">
              <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Melhor técnico calculado
                    </h4>
                    {selectedTechnician && (
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                        Selecionado: {selectedTechnician.name}
                      </span>
                    )}
                  </div>
                  {recommendedTechnicians.map((item, index) => (
                    <button
                      key={item.tech.id}
                      type="button"
                      onClick={() => {
                        set("technicianId", item.tech.id);
                        setTechnicianQuery(item.tech.name);
                      }}
                      className="w-full rounded-xl border border-border bg-background/45 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {index === 0 ? "⭐ " : ""}
                            {item.tech.name}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="size-3.5" />
                            {item.tech.city}/{item.tech.state}
                            {item.tech.status ? ` · ${item.tech.status}` : ""}
                          </p>
                        </div>
                        <span className="rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
                          {item.score}/100
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.reasons.join(" · ")}
                      </p>
                    </button>
                  ))}
                  {!recommendedTechnicians.length && (
                    <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                      Cadastre/importe técnicos para ativar a recomendação automática.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Artigos e checklists sugeridos
                  </h4>
                  {articles.map((article) => (
                    <details
                      key={article.title}
                      className="rounded-xl border border-border bg-background/45 p-3"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold">
                        <BookOpen className="size-4 text-primary" />
                        {article.title}
                      </summary>
                      <ul className="mt-2 space-y-1 pl-6 text-xs text-muted-foreground">
                        {article.steps.map((step) => (
                          <li key={step} className="list-disc">
                            {step}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-border bg-background/35 p-3">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  Auditoria detalhada
                </h4>
                <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {intelligence.audit?.slice(0, 8).map((item) => {
                    const details = parseAuditDetails(item.details);
                    return (
                      <article
                        key={item.id}
                        className="rounded-lg border border-border bg-black/10 p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b>{item.action}</b>
                          <span className="text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          Colaborador: {details.collaborator || item.actorEmail} · origem: {details.origin || "sistema"} · motivo: {details.reason || "não informado"}
                        </p>
                        {!!details.changes.length && (
                          <div className="mt-2 space-y-1">
                            {details.changes.slice(0, 6).map((change) => (
                              <p key={change.field} className="rounded bg-background/60 px-2 py-1">
                                <b>{fieldLabel(change.field)}:</b>{" "}
                                <span className="text-red-200">{formatAuditValue(change.previous)}</span>{" "}
                                →{" "}
                                <span className="text-emerald-200">{formatAuditValue(change.next)}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {!intelligence.audit?.length && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma alteração auditada ainda.
                    </p>
                  )}
                </div>
              </div>
            </Section>
            <Section icon={Store} title="Loja e solicitantes">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Código da loja">
                  <div className="flex gap-2">
                    <Input
                      value={String(form.storeCode ?? "")}
                      onChange={(event) => set("storeCode", event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void lookupStore()}
                    >
                      Buscar
                    </Button>
                  </div>
                </Field>
                <Field label="Nome">
                  <Input
                    value={String(form.storeName ?? "")}
                    onChange={(event) => set("storeName", event.target.value)}
                  />
                </Field>
                <Field label="PDV">
                  <Input
                    value={String(form.pdvNumber ?? "")}
                    onChange={(event) => set("pdvNumber", event.target.value)}
                  />
                </Field>
                <Field label="Endereço completo">
                  <Input
                    value={String(form.address ?? "")}
                    onChange={(event) => set("address", event.target.value)}
                  />
                </Field>
                <Field label="Cidade">
                  <Input
                    value={String(form.city ?? "")}
                    onChange={(event) => set("city", event.target.value)}
                  />
                </Field>
                <Field label="UF">
                  <Input
                    value={String(form.state ?? "")}
                    onChange={(event) =>
                      set("state", event.target.value.toUpperCase())
                    }
                    maxLength={2}
                  />
                </Field>
                <Field label="Solicitante">
                  <Input
                    value={String(form.requesterName ?? "")}
                    onChange={(event) =>
                      set("requesterName", event.target.value)
                    }
                  />
                </Field>
                <Field label="Telefone">
                  <Input
                    value={String(form.requesterPhone ?? "")}
                    onChange={(event) =>
                      set("requesterPhone", event.target.value)
                    }
                  />
                </Field>
                <Field label="Cargo">
                  <Input
                    value={String(form.requesterRole ?? "")}
                    onChange={(event) =>
                      set("requesterRole", event.target.value)
                    }
                  />
                </Field>
                <Field label="2º solicitante">
                  <Input
                    value={String(form.secondaryName ?? "")}
                    onChange={(event) =>
                      set("secondaryName", event.target.value)
                    }
                  />
                </Field>
                <Field label="Telefone 2">
                  <Input
                    value={String(form.secondaryPhone ?? "")}
                    onChange={(event) =>
                      set("secondaryPhone", event.target.value)
                    }
                  />
                </Field>
                <Field label="Cargo 2">
                  <Input
                    value={String(form.secondaryRole ?? "")}
                    onChange={(event) =>
                      set("secondaryRole", event.target.value)
                    }
                  />
                </Field>
              </div>
            </Section>
            <Section
              icon={PackageOpen}
              title="Spare, aprovação e segunda visita"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Validação">
                  <select
                    value={String(form.validationStatus ?? "")}
                    onChange={(event) =>
                      set("validationStatus", event.target.value)
                    }
                    className="field"
                  >
                    <option value="">Não informado</option>
                    <option>Em validação</option>
                    <option>Aprovado</option>
                    <option>Direcionado</option>
                    <option>Resolvido</option>
                  </select>
                </Field>
                <Field label="Origem spare">
                  <select
                    value={String(form.spareSource ?? "")}
                    onChange={(event) => set("spareSource", event.target.value)}
                    className="field"
                  >
                    <option value="">Não informado</option>
                    <option>Delfia</option>
                    <option>Caju</option>
                  </select>
                </Field>
                <Field label="Status da compra">
                  <select
                    value={String(form.purchaseStatus ?? "")}
                    onChange={(event) =>
                      set("purchaseStatus", event.target.value)
                    }
                    className="field"
                  >
                    <option value="">Não informado</option>
                    {purchaseStatuses.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status spare">
                  <Input
                    value={String(form.spareStatus ?? "")}
                    onChange={(event) => set("spareStatus", event.target.value)}
                    placeholder="Ex.: recebido, enviado"
                  />
                </Field>
                <Field label="Valor peças" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    {...money("partsValueCents")}
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Venda peças" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    {...money("partsSaleCents")}
                    placeholder="0,00"
                  />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void save(true)}
                  disabled={saving}
                >
                  <CalendarClock /> Adicionar visita/retorno
                </Button>
                {visits.map((visit) => (
                  <span
                    key={visit.id}
                    className="rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    Visita {visit.visitNumber} ·{" "}
                    {visit.scheduledAt
                      ? new Date(visit.scheduledAt).toLocaleString("pt-BR")
                      : "a definir"}
                  </span>
                ))}
              </div>
            </Section>
            <Section icon={CircleDollarSign} title="Valores e pagamento">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Valor recebido" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    {...money("clientValueCents")}
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Repasse técnico" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    {...money("payoutCents")}
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Data pagamento" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    type="date"
                    value={dateOnly(form.paymentDate)}
                    onChange={(event) => set("paymentDate", event.target.value)}
                  />
                </Field>
                <Field label="Valor pago" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    {...money("paidValueCents")}
                    placeholder="0,00"
                  />
                </Field>
                <Field label="Chave PIX" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    value={String(form.pixKey ?? "")}
                    onChange={(event) => set("pixKey", event.target.value)}
                  />
                </Field>
                <Field label="Tipo chave" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    value={String(form.pixKeyType ?? "")}
                    onChange={(event) => set("pixKeyType", event.target.value)}
                  />
                </Field>
                <Field label="Banco" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    value={String(form.bank ?? "")}
                    onChange={(event) => set("bank", event.target.value)}
                  />
                </Field>
                <Field label="Titular" disabled={!financial}>
                  <Input
                    disabled={!financial}
                    value={String(form.accountHolder ?? "")}
                    onChange={(event) =>
                      set("accountHolder", event.target.value)
                    }
                  />
                </Field>
              </div>
            </Section>
            <Section icon={Truck} title="Rastreios e entregas">
              <div className="grid gap-3 sm:grid-cols-[140px_1fr_180px_auto]">
                <Field label="Origem">
                  <select
                    value={trackingSource}
                    onChange={(event) =>
                      setTrackingSource(event.target.value as "Delfia" | "Caju")
                    }
                    className="field"
                  >
                    <option>Delfia</option>
                    <option>Caju</option>
                  </select>
                </Field>
                <Field label="Código de rastreio">
                  <Input
                    value={trackingCode}
                    onChange={(event) => setTrackingCode(event.target.value)}
                    placeholder="Código da postagem"
                  />
                </Field>
                <Field label="Previsão de entrega">
                  <Input
                    type="date"
                    value={trackingEta}
                    onChange={(event) => setTrackingEta(event.target.value)}
                  />
                </Field>
                <div className="self-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || !trackingCode.trim()}
                    onClick={() =>
                      void saveIntelligence("shipment", {
                        source: trackingSource,
                        trackingCode,
                        expectedAt: trackingEta
                          ? new Date(`${trackingEta}T12:00:00`).toISOString()
                          : null,
                      })
                    }
                  >
                    <Save />
                    Salvar rastreio
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {intelligence.shipments.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs"
                  >
                    <span>
                      <b>{item.source}</b> · {item.trackingCode}
                      {item.carrier ? ` · ${item.carrier}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {item.status}
                      {item.expectedAt
                        ? ` · previsão ${new Date(item.expectedAt).toLocaleDateString("pt-BR")}`
                        : ""}
                    </span>
                  </div>
                ))}
                {!intelligence.shipments.length && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum envio registrado.
                  </p>
                )}
              </div>
            </Section>
            <Section icon={ClipboardCheck} title="Atividades acompanhadas">
              <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
                <Field label="Atividade">
                  <Input
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="Ex.: entrar em contato com o técnico"
                  />
                </Field>
                <Field label="Responsável">
                  <Input
                    value={taskAssignee}
                    onChange={(event) => setTaskAssignee(event.target.value)}
                    placeholder="Nome ou e-mail"
                  />
                </Field>
                <div className="self-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || !taskTitle.trim()}
                    onClick={() =>
                      void saveIntelligence("task", {
                        title: taskTitle,
                        assignedTo: taskAssignee,
                        followUpMinutes: 30,
                      })
                    }
                  >
                    Criar atividade
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {intelligence.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-border bg-background/40 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <b>{task.title}</b>
                        {task.assignedTo
                          ? ` · ${task.assignedTo}`
                          : " · equipe"}
                      </span>
                      <span className="text-muted-foreground">
                        {task.status} · retorno{" "}
                        {new Date(task.nextCheckAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {task.status !== "done" && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void updateTask(task.id, "accepted")}
                        >
                          Vou realizar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void updateTask(task.id, "in_progress")
                          }
                        >
                          Já entrei em contato
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void updateTask(task.id, "done")}
                        >
                          Concluir
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {!intelligence.tasks.length && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma atividade pendente.
                  </p>
                )}
              </div>
            </Section>
            <Section icon={History} title="Histórico e recuperação">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground">
                    QUEM ACIONOU
                  </h4>
                  <div className="mt-2 space-y-2">
                    {intelligence.requesters.map((item) => (
                      <p
                        key={item.id}
                        className="rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        <b>{item.name}</b>
                        {item.role ? ` · ${item.role}` : ""}
                        <span className="block text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </p>
                    ))}
                    {!intelligence.requesters.length && (
                      <p className="text-xs text-muted-foreground">
                        Será registrado no próximo salvamento.
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground">
                    BACKUPS ANTES DE ALTERAÇÕES
                  </h4>
                  <div className="mt-2 space-y-2">
                    {intelligence.snapshots.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1"><b>{item.reason}</b>
                          <span className="block text-muted-foreground">{item.actorEmail} · {new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={() => void restorePreview(item.id)}>Restaurar</Button>
                      </div>
                    ))}
                    {!intelligence.snapshots.length && (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma alteração anterior.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Section>
            <Section icon={Wrench} title="Resumo técnico no Jira">
              <div className="grid gap-3">
                <Field label="PROBLEMA IDENTIFICADO">
                  <textarea
                    value={String(form.identifiedProblem ?? "")}
                    onChange={(event) =>
                      set("identifiedProblem", event.target.value)
                    }
                    rows={3}
                    className="field min-h-20"
                  />
                </Field>
                <Field label="TESTES FEITOS">
                  <textarea
                    value={String(form.testsPerformed ?? "")}
                    onChange={(event) =>
                      set("testsPerformed", event.target.value)
                    }
                    rows={3}
                    className="field min-h-20"
                  />
                </Field>
                <Field label="PEÇA A SER TROCADA">
                  <textarea
                    value={String(form.partToReplace ?? "")}
                    onChange={(event) =>
                      set("partToReplace", event.target.value)
                    }
                    rows={3}
                    className="field min-h-20"
                  />
                </Field>
              </div>
            </Section>
            <Field label="Descrição do atendimento">
              <textarea
                value={String(form.description ?? "")}
                onChange={(event) => set("description", event.target.value)}
                rows={4}
                className="field min-h-24"
                placeholder="Problema, serviço, pendências e instruções."
              />
            </Field>
            <Field label="Motivo da alteração">
              <Input
                value={String(form.changeReason ?? "")}
                onChange={(event) => set("changeReason", event.target.value)}
                placeholder="Ex.: agendamento confirmado com gerente, ajuste vindo do Jira, correção de valor"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button
                type="button"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}{" "}
                Salvar operação
              </Button>
              {financial && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-emerald-400/30 text-emerald-300"
                  onClick={() => void save(false, true)}
                  disabled={saving}
                >
                  <CheckCircle2 /> Confirmar pagamento e arquivar
                </Button>
              )}
              {message && (
                <p role="status" className="text-sm text-muted-foreground">
                  {message}
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
function Field({
  label,
  children,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "opacity-50" : ""}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Store;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4 text-primary" />
        {title}
      </h3>
      {children}
    </section>
  );
}
function dateField(value: Form[string]) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function dateOnly(value: Form[string]) {
  return typeof value === "string" && value ? value.slice(0, 10) : "";
}
function toIso(value: Form[string]) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function moneyToCents(value: string) {
  const normalized = value.trim().replace(/[^\d,.-]/g, "");
  const decimalComma = normalized.lastIndexOf(",") > normalized.lastIndexOf(".");
  const amount = Number(
    decimalComma
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, ""),
  );
  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : null;
}
function automaticCategoryPrice(category: string) {
  const value = category.toLocaleLowerCase("pt-BR");
  if (/rede|cabeamento|switch/.test(value)) return 18000;
  if (/impress|scanner/.test(value)) return 20000;
  if (/cpu|pdv|hardware|desktop/.test(value)) return 15000;
  if (/software|sistema|configura/.test(value)) return 12000;
  return 10000;
}
function localStatus(value = "") {
  const status = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (status === "agendado") return "scheduled";
  if (status.includes("agendamento")) return "scheduling";
  if (status.includes("direcion")) return "operational_preparation";
  if (status.includes("campo") || status.includes("atendimento"))
    return "in_service";
  if (status.includes("spare")) return "awaiting_spare";
  return "triage";
}

function recommendTechnicians(
  technicians: Technician[],
  ticket: {
    city: string;
    state: string;
    category: string;
    priority: "alta" | "normal" | "baixa";
    marginCents: number;
  },
) {
  const city = normalize(ticket.city);
  const state = normalize(ticket.state);
  const category = normalize(ticket.category);
  const profitable = ticket.priority === "alta" || ticket.marginCents > 0;
  return technicians
    .map((tech) => {
      let score = 30;
      const reasons: string[] = [];
      const techCity = normalize(tech.city);
      const techState = normalize(tech.state);
      const specialties = normalize(tech.specialties ?? "");
      const tools = normalize(tech.availableTools ?? "");
      const extraCities = normalize(tech.extraCities ?? "");
      if (techCity && city && techCity === city) {
        score += 28;
        reasons.push("mesma cidade");
      } else if (city && extraCities.includes(city)) {
        score += 20;
        reasons.push("atende a região");
      } else if (techState && state && techState === state) {
        score += 12;
        reasons.push("mesmo estado");
      }
      if (tech.status === "online") {
        score += 18;
        reasons.push("disponível agora");
      } else if (tech.status === "busy") {
        score -= 10;
        reasons.push("ocupado");
      } else if (tech.status === "offline") {
        score -= 18;
        reasons.push("offline");
      }
      if (tech.approved) {
        score += 8;
        reasons.push("aprovado");
      }
      if (matchesSpecialty(category, specialties)) {
        score += 16;
        reasons.push("especialidade compatível");
      }
      if (matchesTools(category, tools)) {
        score += 10;
        reasons.push("ferramentas adequadas");
      }
      if (profitable && score >= 60) {
        score += 6;
        reasons.push("prioridade por lucro");
      }
      if (!reasons.length) reasons.push("candidato geral");
      return { tech, score: Math.max(0, Math.min(100, score)), reasons };
    })
    .sort((a, b) => b.score - a.score || a.tech.name.localeCompare(b.tech.name, "pt-BR"));
}

function knowledgeArticles(category: string, title: string) {
  const text = normalize(`${category} ${title}`);
  const base = [
    {
      title: "Testes obrigatórios por categoria",
      steps: [
        "Confirmar equipamento, PDV e sintoma informado pela loja.",
        "Registrar teste feito, resultado e evidência antes de mudar etapa.",
        "Se houver troca de peça, preencher a peça exata e anexar foto/RAT.",
      ],
    },
    {
      title: "Procedimento de RAT",
      steps: [
        "Conferir data, loja, técnico, assinatura e descrição do serviço.",
        "Anexar RAT legível como evidência interna do chamado.",
        "Validar se a descrição bate com o resumo técnico enviado ao Jira.",
      ],
    },
    {
      title: "Como preencher campos do Jira",
      steps: [
        "Problema identificado: causa encontrada, não só o sintoma.",
        "Testes feitos: passos objetivos realizados pelo técnico/N1.",
        "Peça a ser trocada: modelo ou 'não se aplica' quando não houver troca.",
      ],
    },
  ];
  if (/cpu|pdv|trav|lent|deslig|performance/.test(text)) {
    return [
      {
        title: "Como resolver CPU travando",
        steps: [
          "Verificar inicialização, uso de CPU/memória e espaço em disco.",
          "Testar reinício controlado, periféricos e comunicação com PDV/self-checkout.",
          "Se persistir, registrar logs/foto e indicar peça ou reinstalação necessária.",
        ],
      },
      ...base,
    ];
  }
  if (/impress|scanner|leitor|pinpad|tef/.test(text)) {
    return [
      {
        title: "Quando trocar determinada peça",
        steps: [
          "Trocar só após teste cruzado com cabo/fonte/porta funcional.",
          "Registrar serial/modelo da peça atual e evidência do defeito.",
          "Preencher peça a ser trocada antes de enviar para validação.",
        ],
      },
      ...base,
    ];
  }
  return base;
}

function matchesSpecialty(category: string, specialties: string) {
  if (!category || !specialties) return false;
  return category
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .some((word) => specialties.includes(word));
}

function matchesTools(category: string, tools: string) {
  if (!category || !tools) return false;
  if (/rede|cabo|switch/.test(category)) return /alicate|rede|testador|crimp/.test(tools);
  if (/cpu|pdv|desktop|hardware/.test(category)) return /chave|multimetro|format|pendrive|ssd|memoria/.test(tools);
  if (/impress|scanner/.test(category)) return /limpeza|chave|multimetro|usb/.test(tools);
  return false;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseAuditDetails(value: string | null) {
  if (!value) return { collaborator: "", origin: "", reason: "", changes: [] as Array<{ field: string; previous: unknown; next: unknown }> };
  try {
    const data = JSON.parse(value) as { collaborator?: string; origin?: string; reason?: string; changes?: Array<{ field: string; previous: unknown; next: unknown }> };
    return { collaborator: data.collaborator ?? "", origin: data.origin ?? "", reason: data.reason ?? "", changes: Array.isArray(data.changes) ? data.changes : [] };
  } catch {
    return { collaborator: "", origin: "", reason: "", changes: [] as Array<{ field: string; previous: unknown; next: unknown }> };
  }
}

function fieldLabel(field: string) {
  return ({
    status: "Etapa",
    technicianId: "Técnico",
    scheduledAt: "Agendamento",
    expectedReturnAt: "Retorno previsto",
    clientValueCents: "Valor recebido",
    payoutCents: "Repasse técnico",
    partsValueCents: "Valor de peças",
    partsSaleCents: "Venda de peças",
    storeCode: "Código da loja",
    storeName: "Nome da loja",
    category: "Categoria",
    description: "Descrição",
  } as Record<string, string>)[field] ?? field;
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "vazio";
  if (typeof value === "number" && /Cents$/.test(String(value))) return String(value);
  return String(value).slice(0, 80);
}
