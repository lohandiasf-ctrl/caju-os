"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TicketStack } from "@/components/ticket-stack";
import { FsaClassificacao } from "@/components/fsa-classificacao";
import { empilhar, type VinculoDeGrupo } from "@/lib/ticket-stacks";
import {
  Activity,
  Building2,
  CalendarClock,
  CalendarDays,
  DatabaseBackup,
  Download,
  ExternalLink,
  Eye,
  Filter,
  List,
  Loader2,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Star,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { AppNavigation } from "@/components/app-navigation";
import { TeamManagementPanel } from "@/components/team-management";
import { TicketUpdateNote } from "@/components/ticket-update-note";
import { AppGreeting } from "@/components/app-greeting";
import { OverviewBento } from "@/components/dashboard/overview-bento";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { canUseDashboardView, canUseWhatsapp, isDashboardView, type DashboardView } from "@/lib/navigation";
import { formatarDataExcelOuIso } from "@/lib/assistant";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ColleaguesPanel,
  ProfileSettings,
} from "@/components/user-menu";
import { CajuLoading } from "@/components/caju-loading";
import { useAuth } from "@/components/auth-provider";
import { OperationWorkflowDialog } from "@/components/operation-workflow-dialog";
import { FeedbackBoard } from "@/components/feedback-board";
import { WhatsappSendDialog, type WhatsappDraft } from "@/components/whatsapp-send-dialog";
import { TicketHistory } from "@/components/ticket-history";
import { WhatsAppInbox } from "@/components/whatsapp-inbox";
import { N1TicketActions } from "@/components/n1-ticket-actions";
import { TicketTeamCard } from "@/components/ticket-team-card";
import { BulkTicketActions } from "@/components/bulk-ticket-actions";
import { AssistantAudit } from "@/components/assistant-audit";
import type { BulkStatus } from "@/lib/bulk-actions";
import { copyToClipboard } from "@/lib/clipboard";
import { openExternalUrl } from "@/lib/open-external";
import { jiraTicketUrl, sharedTicketUrl } from "@/lib/ticket-links";
import { matchesSearch, searchTerms } from "@/lib/search-terms";
import { notifyDesktop } from "@/lib/desktop-notifications";
import {
  JiraTicketDetails,
  type JiraOperationalFields,
} from "@/components/jira-ticket-details";
import {
  dayKey,
  parseTicketDate,
  sameDay,
  ticketActivities,
  type DatedTicketActivity,
} from "@/lib/ticket-activities";
import { validationRequirements as getValidationRequirements } from "@/lib/operational-rules";
import { brazilPhone, googleContactsCsv } from "@/lib/google-contacts";
import { parseTechnicianCsv } from "@/lib/technician-import";
import {
  hasQueueFilters,
  matchesQueueFilters,
  NO_QUEUE_FILTERS,
  parseQueueFilters,
  PRIORITY_LABEL,
  staleLabel,
  writeQueueFilters,
  type QueueFilters,
} from "@/lib/queue-filters";

type Status =
  | "Pendente de agendamento"
  | "Agendado"
  | "Aguardando spare"
  | "Direcionado"
  | "Técnico em campo";
type JiraFilterPreset = "operational" | "assignedPartner" | "spareApproved24h";
const jiraFilterPresets: Array<{
  value: JiraFilterPreset;
  label: string;
  description: string;
}> = [
  {
    value: "operational",
    label: "Fila operacional",
    description: "Chamados ativos acompanhados pelo sistema.",
  },
  {
    value: "assignedPartner",
    label: "Meus chamados no Jira",
    description: "Filtro do Jira por parceiro atribuído ao usuário atual.",
  },
  {
    value: "spareApproved24h",
    label: "Spare aprovado 24h",
    description: "Aguardando spare com aprovação nas últimas 24 horas.",
  },
];
type Ticket = {
  id: string;
  title: string;
  store: string;
  city: string;
  status: Status;
  rawStatus: string;
  priority: "Alta" | "Media" | "Baixa";
  technician?: string;
  schedule?: string;
  partnerTriggeredAt?: string;
  updatedAt?: string;
  scheduledAt?: string;
  partnerTriggeredAtRaw?: string;
};
type TicketActivity = DatedTicketActivity<Ticket>;
type JiraTicket = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  assignee: string | null;
  technicianName: string | null;
  updatedAt: string;
  store: string | null;
  city: string | null;
  scheduledAt: string | null;
  partnerTriggeredAt: string | null;
};
type JiraDetails = JiraTicket & {
  description: string;
  reporter: string | null;
  issueType: string;
  project: string;
  createdAt: string;
  jiraUrl: string;
  operationalFields: JiraOperationalFields;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    createdAt: string;
    author: string | null;
  }>;
  internalComments?: Array<{ id: string; body: string; author: string | null; createdAt: string }>;
};
type LinkedSpare = {
  ticketKey: string;
  status: string;
  city: string;
  equipment: string;
  tracking: string;
  delivery: string;
  technician: string;
  service: string;
  note: string;
  address: string;
  supplier: string;
  updatedAt: string;
  source: 'system' | 'spreadsheet' | 'csv';
};
type N1User = { email: string; role: "n1" };
type FieldTechnician = {
  id: number;
  technicianExternalId: string | null;
  technicianCode: string | null;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  pixKey: string | null;
  age: string | null;
  city: string;
  state: string;
  fullAddress: string | null;
  sourceStatus: string | null;
  status: string;
  approved: boolean;
  onboardingCompleted: string | null;
  hasVehicle: string | null;
  vehicleType: string | null;
  alternativeTransport: string | null;
  servesOtherCities: string | null;
  extraCities: string | null;
  toolsCount: string | null;
  availableTools: string | null;
  specialtiesCount: string | null;
  specialties: string | null;
  distanceKm?: number;
};
type TechnicianReview = {
  id: number;
  technicianId: number;
  authorEmail: string;
  rating: number;
  comment: string;
  createdAt: string;
};
type OperationalAlert = {
  ticketKey: string;
  level: "critical" | "warning";
  message: string;
};
type OperationalDashboard = {
  alerts: OperationalAlert[];
  metrics: {
    active: number;
    overdue: number;
    scheduled: number;
    visits: number;
    revenueCents: number;
    costCents: number;
    marginCents: number;
  };
  n1: { email: string; count: number }[];
  validationQueue: {
    ticketKey: string;
    submittedByEmail: string;
    submittedByName: string;
    submittedAt: string;
  }[];
  collaborators: { email: string; activeSeconds: number; changes: number; tasksDone: number; score: number }[];
  recentAudit: {
    id: number;
    ticketKey: string;
    action: string;
    actorEmail: string;
    createdAt: string;
  }[];
};
const columns: Status[] = [
  "Pendente de agendamento",
  "Agendado",
  "Técnico em campo",
  "Aguardando spare",
  "Direcionado",
];
const dots: Record<Status, string> = {
  "Pendente de agendamento": "bg-violet-400",
  Agendado: "bg-blue-400",
  "Aguardando spare": "bg-amber-400",
  Direcionado: "bg-cyan-400",
  "Técnico em campo": "bg-emerald-400",
};
// No celular o kanban mostra uma coluna por vez, e a aba precisa caber na
// largura da tela.
const shortColumn: Record<Status, string> = {
  "Pendente de agendamento": "Pendente",
  Agendado: "Agendado",
  "Aguardando spare": "Spare",
  Direcionado: "Direcionado",
  "Técnico em campo": "Em campo",
};
const KANBAN_TAB_KEY = "caju-kanban-mobile-column";
const JIRA_CREATE_ISSUE_URL = "https://delfia.atlassian.net/secure/CreateIssue!default.jspa";
const viewCopy: Record<DashboardView, [string, string, string]> = {
  feedback: [
    "Voz da equipe",
    "Feedback e sugestões",
    "Registre o que atrapalha, proponha melhorias e apoie as ideias dos colegas.",
  ],
  overview: [
    "Central de operações",
    "Visão geral dos chamados",
    "Fila, prioridade e execução em uma única visão.",
  ],
  tickets: [
    "Central de atendimento",
    "Chamados operacionais",
    "Consulte, filtre e abra cada chamado sem perder contexto.",
  ],
  history: [
    "Memória operacional",
    "Histórico de chamados",
    "Chamados direcionados, validados ou finalizados continuam disponíveis com os dados salvos pelo sistema.",
  ],
  central: [
    "Atendimento N1",
    "Central N1",
    "Fila real de chamados que exige acompanhamento da equipe N1.",
  ],
  agenda: [
    "Planejamento de campo",
    "Agenda de atendimentos",
    "Agendamentos e itens que ainda precisam de data.",
  ],
  technicians: [
    "Equipe de atendimento",
    "Equipe",
    "N1 e técnicos de campo cadastrados na operação.",
  ],
  projects: [
    "Cobertura operacional",
    "Projetos e lojas",
    "Locais com chamados ativos e volume por unidade.",
  ],
  whatsapp: [
    "WhatsApp Business",
    "Conversas",
    "Mensagens recebidas pelo WhatsApp da operação, vinculáveis a um chamado.",
  ],
  settings: [
    "Administração",
    "Configurações do sistema",
    "Perfil, integrações e estado dos serviços.",
  ],
};

export default function Home() {
  const { role, user } = useAuth();
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [jiraLoading, setJiraLoading] = useState(true);
  const [jiraError, setJiraError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | "Todos">("Todos");
  // Filtros vindos dos sliders das Ações rápidas (via URL); só na fila.
  const [queueFilters, setQueueFilters] = useState<QueueFilters>(NO_QUEUE_FILTERS);
  const [mobileColumn, setMobileColumn] = useState<Status>(columns[0]);
  const [jiraFilterPreset, setJiraFilterPreset] =
    useState<JiraFilterPreset>("operational");
  const [menu, setMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    let last = Date.now();
    const record = async () => {
      if (document.visibilityState !== "visible") { last = Date.now(); return; }
      const now = Date.now();
      const durationSeconds = Math.max(0, Math.round((now - last) / 1000));
      last = now;
      try {
        await fetch("/api/operations/intelligence", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "activity", event: "active_view", context: activeView, durationSeconds }) });
      } catch { /* Telemetria operacional nunca bloqueia o trabalho. */ }
    };
    const timer = window.setInterval(() => void record(), 60_000);
    return () => window.clearInterval(timer);
  }, [activeView, user]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [linkedSpare, setLinkedSpare] = useState<LinkedSpare | null>(null);
  const [ticketToShare, setTicketToShare] = useState<{
    id: string;
    title: string;
    store: string;
    city: string;
  } | null>(null);
  const [details, setDetails] = useState<JiraDetails | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [n1Users, setN1Users] = useState<N1User[]>([]);
  const [n1Loading, setN1Loading] = useState(true);
  const [operationOpen, setOperationOpen] = useState(false);
  const [validationSending, setValidationSending] = useState(false);
  const [validationNotice, setValidationNotice] = useState("");
  const [archivedKeys, setArchivedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [operational, setOperational] = useState<OperationalDashboard | null>(
    null,
  );
  const [ticketDate, setTicketDate] = useState<Date | undefined>();
  const knownTicketIds = useRef<Set<string>>(new Set());
  const openedTicketFromUrl = useRef<string | null>(null);
  const seenOperationalAlerts = useRef<Set<string>>(new Set());
  const [removedTicketAlerts, setRemovedTicketAlerts] = useState<string[]>([]);
  const [newTicketAlerts, setNewTicketAlerts] = useState<string[]>([]);
  const [readAlertKeys, setReadAlertKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try { setReadAlertKeys(new Set(JSON.parse(localStorage.getItem('caju-read-alerts') ?? '[]') as string[])); } catch { /* armazenamento indisponível */ }
  }, []);
  const markAlertRead = (key: string) => {
    setReadAlertKeys((current) => {
      const next = new Set(current);
      next.add(key);
      try { localStorage.setItem('caju-read-alerts', JSON.stringify([...next].slice(-500))); } catch { /* armazenamento indisponível */ }
      return next;
    });
  };
  const visibleOperationalAlerts = operational?.alerts.filter(
    (alert) =>
      !/^SLA excedido/i.test(alert.message) &&
      !readAlertKeys.has(`${alert.ticketKey}|${alert.message}`),
  ) ?? [];
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  // Chamado -> grupo, para o kanban empilhar quem foi agrupado junto.
  const [vinculosDeGrupo, setVinculosDeGrupo] = useState<Map<string, VinculoDeGrupo>>(
    () => new Map(),
  );
  const [pilhasAbertas, setPilhasAbertas] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!user) return;
    let active = true;
    const carregar = async () => {
      try {
        const response = await fetch("/api/fsa-groups/vinculos", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { vinculos?: VinculoDeGrupo[] };
        if (active) setVinculosDeGrupo(new Map((payload.vinculos ?? []).map((v) => [v.ticketKey, v])));
      } catch {
        // Sem os vínculos o kanban só deixa de empilhar: os cards aparecem
        // soltos, como antes. Não é motivo para mostrar erro.
      }
    };
    const primeira = window.setTimeout(() => void carregar(), 0);
    // O grupo pode ser montado por outra pessoa; a cada minuto o kanban alcança.
    const periodico = window.setInterval(() => void carregar(), 60_000);
    // Quem acabou de agrupar vê a pilha na hora, sem esperar o minuto.
    const aoAgrupar = () => void carregar();
    window.addEventListener("caju:grupos-de-repasse", aoAgrupar);
    return () => {
      active = false;
      window.clearTimeout(primeira);
      window.clearInterval(periodico);
      window.removeEventListener("caju:grupos-de-repasse", aoAgrupar);
    };
  }, [user]);

  useEffect(() => {
    const syncView = () => {
      const requested = dashboardViewFromLocation();
      if (!role) {
        if (isDashboardView(requested)) setActiveView(requested);
        return;
      }
      const next = canUseDashboardView(role, requested)
        ? requested
        : defaultDashboardView(role);
      setActiveView(next);
      setQueueFilters(parseQueueFilters(window.location.search));
      if (requested !== next) {
        const params = new URLSearchParams(window.location.search);
        params.set("view", next);
        window.history.replaceState(null, "", `/?${params.toString()}`);
      }
    };
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, [role, user?.email]);
  // Lets globals.css lay out full-screen views (WhatsApp) and hide the
  // floating launchers there.
  useEffect(() => {
    document.documentElement.dataset.view = activeView;
    return () => { delete document.documentElement.dataset.view; };
  }, [activeView]);
  // Referência estável para o bento: ele mede "atualizado há" e grava o
  // retrato diário quando esta lista muda.
  const activeTickets = useMemo(
    () => tickets.filter((ticket) => !archivedKeys.has(ticket.id)),
    [tickets, archivedKeys],
  );
  const filtered = useMemo(() => {
    const terms = searchTerms(query);
    return tickets.filter((ticket) => {
      if (archivedKeys.has(ticket.id)) return false;
      const matchesQuery = matchesSearch(
        [ticket.id, ticket.title, ticket.store, ticket.city, ticket.technician],
        terms,
      );
      const matchesDate =
        activeView !== "tickets" ||
        !ticketDate ||
        ticketActivities(ticket).some((activity) =>
          sameDay(activity.date, ticketDate),
        );
      const matchesQueue =
        activeView !== "tickets" ||
        matchesQueueFilters(ticket, queueFilters, new Date(), parseTicketDate);
      return (
        matchesQuery &&
        matchesDate &&
        matchesQueue &&
        (statusFilter === "Todos" || ticket.status === statusFilter)
      );
    });
  }, [activeView, archivedKeys, query, queueFilters, statusFilter, ticketDate, tickets]);
  function updateQueueFilters(next: QueueFilters) {
    setQueueFilters(next);
    const params = writeQueueFilters(new URLSearchParams(window.location.search), next);
    window.history.replaceState(null, "", `/?${params.toString()}`);
  }
  // Agendamento que o assistente preparou: marca os chamados e abre o
  // diálogo de sempre, onde a pessoa escolhe o técnico e confirma.
  const [scheduleRequest, setScheduleRequest] = useState<{ at: string; id: number } | null>(null);
  // Mensagem escrita pelo assistente, esperando revisão antes de sair.
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsappDraft | null>(null);
  const selectedTickets = useMemo(
    () => tickets.filter((ticket) => selectedKeys.has(ticket.id)),
    [selectedKeys, tickets],
  );

  function toggleSelected(ticketKey: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(ticketKey)) next.delete(ticketKey);
      else next.add(ticketKey);
      return next;
    });
  }

  function toggleSelectedGroup(keys: string[]) {
    setSelectedKeys((current) => {
      const allSelected = keys.length > 0 && keys.every((key) => current.has(key));
      const next = new Set(current);
      keys.forEach((key) => (allSelected ? next.delete(key) : next.add(key)));
      return next;
    });
  }

  function applyBulkResult(status: BulkStatus, keys: string[], scheduledAt?: string) {
    const when = scheduledAt
      ? new Date(scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : undefined;
    setTickets((current) =>
      current.map((ticket): Ticket => {
        if (!keys.includes(ticket.id)) return ticket;
        return status === "scheduled"
          ? { ...ticket, status: "Agendado", rawStatus: "Agendado", scheduledAt, schedule: when }
          : { ...ticket, status: "Técnico em campo", rawStatus: "Técnico em campo" };
      }),
    );
    // O cache de 5 min da fila traria a etapa antiga de volta num recarregamento.
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith("caju-jira-issues-cache:"))
      .forEach((key) => sessionStorage.removeItem(key));
  }
  const visibleKanbanColumns = useMemo(() => {
    if (statusFilter !== "Todos") return [statusFilter];
    if (jiraFilterPreset === "operational") return columns;
    const statusesWithTickets = columns.filter((column) =>
      filtered.some((ticket) => ticket.status === column),
    );
    return statusesWithTickets.length ? statusesWithTickets : columns;
  }, [filtered, jiraFilterPreset, statusFilter]);
  // A coluna aberta no celular tem que existir no filtro atual; se o filtro
  // mudou, cai na primeira disponível.
  const activeMobileColumn = visibleKanbanColumns.includes(mobileColumn)
    ? mobileColumn
    : visibleKanbanColumns[0];
  // Guarda a última coluna aberta para não recomeçar sempre na primeira.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KANBAN_TAB_KEY);
      if (saved && (columns as string[]).includes(saved)) setMobileColumn(saved as Status);
    } catch {
      // Navegador com armazenamento bloqueado: segue no padrão.
    }
  }, []);
  function openMobileColumn(column: Status) {
    setMobileColumn(column);
    try {
      localStorage.setItem(KANBAN_TAB_KEY, column);
    } catch {
      // Sem armazenamento a escolha vale só para esta visita.
    }
  }
  const allTicketActivities = useMemo(
    () =>
      tickets
        .flatMap(ticketActivities)
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [tickets],
  );
  const stores = useMemo(() => {
    const totals = new Map<
      string,
      { store: string; city: string; tickets: number }
    >();
    for (const ticket of tickets) {
      const key = `${ticket.store}|||${ticket.city}`;
      const current = totals.get(key);
      if (current) current.tickets += 1;
      else
        totals.set(key, { store: ticket.store, city: ticket.city, tickets: 1 });
    }
    return Array.from(totals.values()).sort((a, b) => b.tickets - a.tickets);
  }, [tickets]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const cacheKey = `caju-jira-issues-cache:${jiraFilterPreset}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as {
          at: number;
          issues: JiraTicket[];
        };
        if (Date.now() - parsed.at < 5 * 60_000 && parsed.issues.length) {
          setTickets(parsed.issues.map(toTicket));
          setJiraLoading(false);
          return () => {
            active = false;
          };
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }
    setJiraLoading(true);
    setJiraError("");
    void user
      .getIdToken()
      .then(async (token) => {
        const issues: JiraTicket[] = [];
        let cursor: string | null = null;
        let isLast = false;

        while (!isLast) {
          const params = new URLSearchParams({ limit: "100" });
          if (jiraFilterPreset !== "operational")
            params.set("preset", jiraFilterPreset);
          if (cursor) params.set("cursor", cursor);
          const response = await fetch(`/api/jira/issues?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          const payload = (await response.json()) as {
            issues?: JiraTicket[];
            nextPageToken?: string | null;
            isLast?: boolean;
            error?: string;
          };
          if (!response.ok)
            throw new Error(
              payload.error || "Não foi possível consultar o Jira.",
            );
          issues.push(...(payload.issues ?? []));
          cursor = payload.nextPageToken ?? null;
          isLast = payload.isLast ?? !cursor;
          if (!cursor) isLast = true;
        }
        if (active) {
          setTickets(issues.map(toTicket));
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ at: Date.now(), issues }),
          );
        }
      })
      .catch((error: unknown) => {
        if (active)
          setJiraError(
            error instanceof Error
              ? error.message
              : "Falha ao consultar o Jira.",
          );
      })
      .finally(() => {
        if (active) setJiraLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jiraFilterPreset, user]);

  useEffect(() => {
    if (!user) return;
    const ticketKey = new URLSearchParams(window.location.search).get('ticket')?.trim().toUpperCase();
    if (!ticketKey || !/^FSA-\d+$/.test(ticketKey) || openedTicketFromUrl.current === ticketKey) return;
    openedTicketFromUrl.current = ticketKey;
    try {
      const saved = sessionStorage.getItem(`caju-linked-spare:${ticketKey}`);
      if (saved) {
        const parsed = JSON.parse(saved) as LinkedSpare;
        if (parsed.ticketKey === ticketKey) setLinkedSpare(parsed);
      }
    } catch {
      sessionStorage.removeItem(`caju-linked-spare:${ticketKey}`);
    }
    const ticket = tickets.find((item) => item.id === ticketKey) ?? {
      id: ticketKey,
      title: 'Carregando chamado do Jira…',
      store: '',
      city: '',
      status: 'Aguardando spare' as Status,
      rawStatus: 'Consultando Jira',
      priority: 'Media' as const,
    };
    void openTicket(ticket);
  }, [tickets, user]);

  useEffect(() => {
    function onOpenTicketEvent(event: Event) {
      const ticketKey = (event as CustomEvent<string>).detail;
      if (!ticketKey) return;
      const ticket = tickets.find((item) => item.id === ticketKey);
      void openTicket(ticket ?? {
        id: ticketKey,
        title: "Carregando chamado...",
        store: "",
        city: "",
        status: "Direcionado",
        rawStatus: "",
        priority: "Media",
      });
    }

    function onPrepareScheduleEvent(event: Event) {
      const detail = (event as CustomEvent<{ ticketKeys: string[]; at: string }>).detail;
      if (!detail?.ticketKeys?.length) return;
      setSelectedKeys(new Set(detail.ticketKeys));
      setActiveView('tickets');
      setScheduleRequest({ at: detail.at, id: Date.now() });
    }

    function onPrepareWhatsappEvent(event: Event) {
      const detail = (event as CustomEvent<{ contato: string; nome: string; texto: string }>).detail;
      if (!detail) return;
      if (canUseWhatsapp(role)) {
        setWhatsappDraft(detail);
      }
    }

    window.addEventListener('caju:open-ticket', onOpenTicketEvent);
    window.addEventListener('caju:prepare-schedule', onPrepareScheduleEvent);
    window.addEventListener('caju:prepare-whatsapp', onPrepareWhatsappEvent);
    return () => {
      window.removeEventListener('caju:open-ticket', onOpenTicketEvent);
      window.removeEventListener('caju:prepare-schedule', onPrepareScheduleEvent);
      window.removeEventListener('caju:prepare-whatsapp', onPrepareWhatsappEvent);
    };
  }, [tickets, role]);

  useEffect(() => {
    knownTicketIds.current = new Set(tickets.map((ticket) => ticket.id));
  }, [tickets]);

  useEffect(() => {
    // Each Jira preset represents a different queue. Do not compare the new
    // queue with the previous one or generate false added/removed alerts.
    knownTicketIds.current = new Set();
  }, [jiraFilterPreset]);

  useEffect(() => {
    if (!operational || !user) return;
    for (const alert of operational.alerts) {
      if (/^SLA excedido/i.test(alert.message)) continue;
      const key = `${alert.ticketKey}|${alert.message}`;
      if (!seenOperationalAlerts.current.has(key) && seenOperationalAlerts.current.size) {
        const kind = /spare|entrega|rastrei/i.test(alert.message) ? "spare" : /agend/i.test(alert.message) ? "schedule" : /campo/i.test(alert.message) ? "field-check" : "operational";
        void notifyDesktop({ title: `Alerta operacional · ${alert.ticketKey}`, body: alert.message, tag: key, kind });
      }
      seenOperationalAlerts.current.add(key);
    }
  }, [operational, role]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const token = await user.getIdToken();
        const issues: JiraTicket[] = [];
        let cursor: string | null = null;
        do {
          const params = new URLSearchParams({ limit: "100" });
          if (jiraFilterPreset !== "operational")
            params.set("preset", jiraFilterPreset);
          if (cursor) params.set("cursor", cursor);
          const response = await fetch(`/api/jira/issues?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          const payload = await response.json() as { issues?: JiraTicket[]; nextPageToken?: string | null };
          if (!response.ok) return;
          issues.push(...(payload.issues ?? [])); cursor = payload.nextPageToken ?? null;
        } while (cursor && active);
        if (!active) return;
        const nextIds = new Set(issues.map((issue) => issue.key));
        const removed = [...knownTicketIds.current].filter((key) => !nextIds.has(key));
        const added = issues.filter((issue) => !knownTicketIds.current.has(issue.key));
        if (added.length && knownTicketIds.current.size) {
          const messages = added.slice(0, 8).map((issue) => `${issue.key} · ${issue.summary}`);
          setNewTicketAlerts((current) => [...messages, ...current].slice(0, 10));
          for (const issue of added.slice(0, 8)) {
            void notifyDesktop({ title: `Novo chamado · ${issue.key}`, body: issue.summary, tag: `jira-new-${issue.key}`, kind: /spare/i.test(issue.status) ? "spare" : "new-ticket" });
          }
        }
        if (removed.length) {
          setRemovedTicketAlerts((current) => [...removed.map((key) => `${key} foi retirado da fila do Jira.`), ...current].slice(0, 10));
          for (const key of removed.slice(0, 8)) void notifyDesktop({ title: "Chamado retirado da fila", body: `${key} não está mais na fila operacional.`, tag: `jira-removed-${key}`, kind: "removed-ticket" });
        }
        knownTicketIds.current = nextIds; setTickets(issues.map(toTicket));
      } catch { /* A próxima atualização tenta novamente. */ }
    };
    const timer = window.setInterval(() => void refresh(), 45_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [jiraFilterPreset, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/operational-dashboard", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as OperationalDashboard;
        if (active && response.ok) setOperational(payload);
      } catch {
        /* Jira data remains available if operational summary is offline. */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void user
      .getIdToken()
      .then(async (token) => {
        const response = await fetch("/api/operations?archivedKeys=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as { archivedKeys?: string[] };
        if (active && response.ok)
          setArchivedKeys(new Set(payload.archivedKeys ?? []));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setN1Loading(true);
    void user
      .getIdToken()
      .then(async (token) => {
        const response = await fetch("/api/users/n1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          users?: N1User[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            payload.error || "Não foi possível carregar equipe N1.",
          );
        if (active) setN1Users(payload.users ?? []);
      })
      .catch(() => {
        if (active) setN1Users([]);
      })
      .finally(() => {
        if (active) setN1Loading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  async function openTicket(ticket: Ticket) {
    if (!user) return;
    setSelected(ticket);
    setDetails(null);
    setDetailsVisible(false);
    setWhatsappUrl("");
    setDialogError("");
    setValidationNotice("");
    setDialogLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [detailsResponse, linkResponse] = await Promise.all([
        fetch(`/api/jira/issues/${ticket.id}`, { headers, cache: "no-store" }),
        fetch(`/api/jira/issues/${ticket.id}/whatsapp`, {
          headers,
          cache: "no-store",
        }),
      ]);
      const detailsPayload = (await detailsResponse.json()) as JiraDetails & {
        error?: string;
      };
      const linkPayload = (await linkResponse.json()) as {
        whatsappUrl?: string | null;
        error?: string;
      };
      if (!detailsResponse.ok)
        throw new Error(
          detailsPayload.error || "Não foi possível carregar os detalhes.",
        );
      if (!linkResponse.ok)
        throw new Error(
          linkPayload.error || "Não foi possível carregar o grupo.",
        );
      setDetails(detailsPayload);
      setSelected(toTicket(detailsPayload));
      setWhatsappUrl(linkPayload.whatsappUrl ?? "");
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o chamado.",
      );
    } finally {
      setDialogLoading(false);
    }
  }

  function closeTicketDialog() {
    setSelected(null);
    setLinkedSpare(null);
    const params = new URLSearchParams(window.location.search);
    if (!params.has('ticket')) return;
    params.delete('ticket');
    window.history.replaceState(null, '', `/?${params.toString()}`);
  }

  async function refreshTicketDetails(ticketKey: string) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/jira/issues/${ticketKey}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as JiraDetails & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Não foi possível atualizar o chamado.");
      setDetails(payload);
      setSelected((current) =>
        current?.id === payload.key ? toTicket(payload) : current,
      );
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === payload.key ? toTicket(payload) : ticket,
        ),
      );
      sessionStorage.removeItem("caju-jira-issues-cache");
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o chamado.",
      );
    }
  }

  async function saveWhatsappLink() {
    if (!user || !selected) return;
    setLinkSaving(true);
    setDialogError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/jira/issues/${selected.id}/whatsapp`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ whatsappUrl }),
      });
      const payload = (await response.json()) as {
        whatsappUrl?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Não foi possível salvar o link.");
      setWhatsappUrl(payload.whatsappUrl ?? "");
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o link.",
      );
    } finally {
      setLinkSaving(false);
    }
  }

  async function openJira() {
    if (!selected) return;
    const url =
      details?.jiraUrl || jiraTicketUrl(selected.id);
    if ((await openExternalUrl(url)) === "blocked") {
      const copied = await copyToClipboard(url).catch(() => false);
      setJiraError(
        copied
          ? "Não foi possível abrir o Jira aqui. O link foi copiado: cole no navegador."
          : "Não foi possível abrir o Jira aqui. Abra o chamado pelo navegador.",
      );
    }
  }

  const validationRequirements = useMemo(() => {
    const summary = parseDefectSummary(
      details?.operationalFields.defectSummary ?? "",
    );
    return getValidationRequirements({
      status: details?.status ?? selected?.rawStatus ?? "",
      ticketTotal: details?.operationalFields.ticketTotal,
      attachmentCount: details?.attachments?.length ?? 0,
      serviceStartedAt: details?.operationalFields.serviceStartedAt,
      serviceEndedAt: details?.operationalFields.serviceEndedAt,
      ...summary,
    });
  }, [details, selected]);
  const validationReady =
    Boolean(details) && validationRequirements.length === 0;

  async function copyJiraLinkForValidation() {
    if (!selected || !user) return;
    // O grupo SUP valida pelo chamado no Jira, não pela tela do Caju OS.
    const link = details?.jiraUrl || jiraTicketUrl(selected.id);
    setValidationSending(true);
    try {
      // O app desktop precisa do comando do Tauri; no navegador vale o helper
      // que ja existe neste arquivo, com fallback para execCommand.
      const copied = "__TAURI_INTERNALS__" in window
        ? await (await import("@tauri-apps/api/core")).invoke<boolean>("copy_to_clipboard", { text: link })
        : await copyToClipboard(link);
      const response = await fetch(`/api/jira/issues/${selected.id}/validation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar a validação.");
      const now = new Date().toISOString();
      setOperational((current) =>
        current
          ? {
              ...current,
              validationQueue: [
                {
                  ticketKey: selected.id,
                  submittedByEmail: user.email ?? "usuario",
                  submittedByName: user.displayName || user.email?.split("@")[0] || "Você",
                  submittedAt: now,
                },
                ...(current.validationQueue ?? []).filter(
                  (item) => item.ticketKey !== selected.id,
                ),
              ],
            }
          : current,
      );
      setValidationNotice(
        copied
          ? "Link copiado e chamado entrou na fila de validação."
          : "Não foi possível copiar. Copie o link do chamado manualmente.",
      );
    } catch (error) {
      setValidationNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a validação.",
      );
    } finally {
      setValidationSending(false);
    }
  }

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      !href.startsWith("/?view=") ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const requested = dashboardViewFromHref(href);
    if (requested && !canUseDashboardView(role, requested)) {
      event.preventDefault();
      window.history.pushState(null, "", `/?view=${defaultDashboardView(role)}`);
      setActiveView(defaultDashboardView(role));
      setMenu(false);
      setNotificationsOpen(false);
      return;
    }
    window.history.pushState(null, "", href);
    setActiveView(dashboardViewFromLocation());
    setQueueFilters(parseQueueFilters(window.location.search));
    setMenu(false);
    setNotificationsOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: object,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "filter_operational_tickets",
          title: "Filtrar chamados",
          description:
            "Filtra o quadro operacional por chamado, loja, cidade ou tecnico.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Texto para buscar no quadro.",
              },
            },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute(input: unknown) {
            if (
              !input ||
              typeof input !== "object" ||
              typeof (input as { query?: unknown }).query !== "string"
            )
              throw new Error("query deve ser texto");
            const nextQuery = (input as { query: string }).query;
            setQuery(nextQuery);
            return {
              query: nextQuery,
              matchingTickets: tickets.filter((ticket) =>
                [
                  ticket.id,
                  ticket.title,
                  ticket.store,
                  ticket.city,
                  ticket.technician,
                ]
                  .filter(Boolean)
                  .some((value) =>
                    value!.toLowerCase().includes(nextQuery.toLowerCase()),
                  ),
              ).length,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  return (
    <main className="min-h-screen text-foreground">
      <AppNavigation active={activeView} open={menu} onOpenChange={setMenu} onNavigate={navigate} />
      <section className="app-content">
        <header className="sticky top-0 z-(--z-sticky) flex h-[68px] items-center gap-3 border-b px-4 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={menu}
            aria-label="Abrir menu"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </Button>
          <AppGreeting context={viewCopy[activeView][1]} className="hidden shrink md:block md:max-w-[240px] xl:max-w-[320px]" />
          <div className="relative min-w-0 max-w-[380px] flex-1 md:ml-2">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar por FSA, cidade, loja, técnico ou resumo do chamado"
              placeholder="Buscar FSA, cidade, loja ou defeito…"
              title="Busca no número da FSA, cidade, loja, técnico e resumo do chamado (onde fica o defeito). Separe vários termos com vírgula."
              className="h-10 bg-card pl-10 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-sm:size-9"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Estado da integração: discreto quando está tudo bem, com cor
                só quando pede atenção. */}
            <output
              className={`hidden items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium xl:flex ${jiraError ? "bg-warning-soft text-warning" : "text-muted-foreground"}`}
            >
              {jiraLoading ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${jiraError ? "bg-warning" : "bg-success"}`}
                />
              )}
              {jiraLoading
                ? "Sincronizando Jira…"
                : jiraError
                  ? "Jira indisponível"
                  : "Jira conectado"}
            </output>
            <ThemeToggle />
            <NotificationBell
              count={removedTicketAlerts.length + newTicketAlerts.length + visibleOperationalAlerts.length}
              expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((value) => !value)}
            />
          </div>
          {notificationsOpen && (
            <div className="absolute right-4 top-[60px] z-50 max-h-[calc(100dvh-6rem)] w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-popover p-3 shadow-(--shadow-popover) animate-in fade-in-0 slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">Central de alertas</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {removedTicketAlerts.length + newTicketAlerts.length + visibleOperationalAlerts.length} não lidos
                </span>
              </div>
              {/* Críticos primeiro; cada item tem ícone + texto, não só cor. */}
              <ul className="mt-2 space-y-1">
                {visibleOperationalAlerts
                  .slice()
                  .sort((a, b) => Number(b.level === "critical") - Number(a.level === "critical"))
                  .map((alert) => (
                  <li
                    key={`${alert.ticketKey}-${alert.message}`}
                    className={`rounded-lg border-l-2 bg-card-elevated px-3 py-2 text-xs ${alert.level === "critical" ? "border-l-danger" : "border-l-warning"}`}
                  >
                    <p className="flex items-center gap-1.5 font-medium">
                      <span className={alert.level === "critical" ? "text-danger" : "text-warning"}>{alert.level === "critical" ? "Crítico" : "Atenção"}</span>
                      <span className="font-mono text-foreground">{alert.ticketKey}</span>
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{alert.message}</p>
                    <div className="mt-1.5 flex gap-3 font-medium"><button type="button" className="text-primary hover:underline" onClick={() => { const ticket = tickets.find((item) => item.id === alert.ticketKey); if (ticket) void openTicket(ticket); }}>Abrir chamado</button><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => markAlertRead(`${alert.ticketKey}|${alert.message}`)}>Marcar como lido</button></div>
                  </li>
                ))}
                {newTicketAlerts.map((message) => <li key={message} className="rounded-lg border-l-2 border-l-primary bg-card-elevated px-3 py-2 text-xs"><p><span className="font-medium text-primary">Novo chamado</span> · {message}</p><button type="button" className="mt-1.5 font-medium text-muted-foreground hover:text-foreground" onClick={() => setNewTicketAlerts((current) => current.filter((item) => item !== message))}>Marcar como lido</button></li>)}
                {removedTicketAlerts.map((message) => <li key={message} className="rounded-lg border-l-2 border-l-border bg-card-elevated px-3 py-2 text-xs text-muted-foreground"><p className="text-foreground">{message}</p><button type="button" className="mt-1.5 font-medium hover:text-foreground" onClick={() => setRemovedTicketAlerts((current) => current.filter((item) => item !== message))}>Marcar como lido</button></li>)}
              </ul>
              {!visibleOperationalAlerts.length && (
                <p className="px-1 py-3 text-sm text-muted-foreground">
                  Nenhum alerta operacional crítico agora.
                </p>
              )}
              <a
                href="/?view=tickets"
                onClick={(event) => navigate(event, "/?view=tickets")}
                className="mt-2 inline-flex min-h-9 items-center px-1 text-sm font-medium text-primary hover:underline"
              >
                Ver chamados
              </a>
            </div>
          )}
        </header>
        <div id="main-content" tabIndex={-1} className="app-main mx-auto max-w-[1600px] px-4 pt-6 pb-44 sm:px-6 lg:px-8 lg:pt-8 xl:pb-36">
          {/* WhatsApp is full-screen: its title stays only for screen readers. */}
          <div className={activeView === "whatsapp" ? "sr-only" : "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"}>
            <div className="min-w-0">
              <p className="page-eyebrow">
                {viewCopy[activeView][0]}
              </p>
              <h1 className="page-title">
                {viewCopy[activeView][1]}
              </h1>
              <p className="page-subtitle">
                {viewCopy[activeView][2]}
              </p>
            </div>
            {/* Ação principal da página: uma só, na cor primária. */}
            {(activeView === "tickets" || activeView === "overview") && (
              <Button
                className="shrink-0 font-semibold"
                nativeButton={false}
                render={
                  <a
                    href={JIRA_CREATE_ISSUE_URL}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <Plus /> Novo chamado no Jira
                <ExternalLink aria-hidden="true" className="opacity-70" />
              </Button>
            )}
          </div>
          {activeView === "overview" && (
            <OverviewBento
              tickets={activeTickets}
              loading={jiraLoading}
              error={jiraError}
              operational={operational}
              role={role}
              onOpenTicket={(ticket) => void openTicket(ticket)}
              onNavigate={navigate}
            />
          )}
          {jiraError && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm"
            >
              <Activity aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="font-medium text-warning">Não foi possível sincronizar com o Jira</p>
                <p className="mt-0.5 text-muted-foreground">{jiraError}</p>
              </div>
            </div>
          )}
          {activeView === "tickets" && (
            <TicketActivityCalendar
              activities={allTicketActivities}
              selected={ticketDate}
              onSelect={setTicketDate}
              onOpen={openTicket}
            />
          )}
          {(activeView === "overview" ||
            activeView === "tickets" ||
            activeView === "central") && (
            <>
              <div className="mt-8 flex flex-wrap items-center gap-2">
                <div className="mr-auto min-w-0">
                  <h2 className="section-title">Fluxo de chamados</h2>
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {jiraLoading
                      ? "Carregando chamados reais…"
                      : `${filtered.length} ${filtered.length === 1 ? "chamado exibido" : "chamados exibidos"}${query.trim() ? ` para “${query.trim()}”` : ""}${activeView === "tickets" && ticketDate ? ` em ${formatDay(ticketDate)}` : ""}`}
                  </p>
                </div>
                <Button
                  variant={showFilters ? "secondary" : "outline"}
                  className="h-9"
                  onClick={() => setShowFilters((value) => !value)}
                  aria-expanded={showFilters}
                >
                  <Filter /> Filtros
                </Button>
                <div className="flex rounded-lg border border-border bg-card p-1">
                  <Button
                    variant={view === "kanban" ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={view === "kanban"}
                    onClick={() => setView("kanban")}
                  >
                    <Wrench /> Kanban
                  </Button>
                  <Button
                    variant={view === "list" ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List /> Lista
                  </Button>
                </div>
              </div>
              {activeView === "tickets" && hasQueueFilters(queueFilters) && (
                <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros das ações rápidas">
                  {queueFilters.staleDays > 0 && (
                    <button type="button" onClick={() => updateQueueFilters({ ...queueFilters, staleDays: 0 })} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-xs font-semibold text-primary hover:brightness-95 max-sm:min-h-11" aria-label={`Remover filtro: parados há ${staleLabel(queueFilters.staleDays)}`}>
                      Parados: {staleLabel(queueFilters.staleDays)}<X aria-hidden="true" className="size-3.5" />
                    </button>
                  )}
                  {queueFilters.minPriority !== "Baixa" && (
                    <button type="button" onClick={() => updateQueueFilters({ ...queueFilters, minPriority: "Baixa" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary-soft px-3 text-xs font-semibold text-primary hover:brightness-95 max-sm:min-h-11" aria-label={`Remover filtro: prioridade ${PRIORITY_LABEL[queueFilters.minPriority]}`}>
                      Prioridade: {PRIORITY_LABEL[queueFilters.minPriority]}<X aria-hidden="true" className="size-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => updateQueueFilters(NO_QUEUE_FILTERS)} className="min-h-9 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground max-sm:min-h-11">
                    Limpar
                  </button>
                </div>
              )}
              {showFilters && (
                <div
                  className="surface-panel mt-3 space-y-4 rounded-xl p-4"
                  aria-label="Filtros de chamados"
                >
                  <div>
                    <p className="label-caps mb-2">
                      Filtros do Jira
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {jiraFilterPresets.map((preset) => (
                        <Button
                          key={preset.value}
                          size="sm"
                          variant={
                            jiraFilterPreset === preset.value
                              ? "default"
                              : "ghost"
                          }
                          title={preset.description}
                          onClick={() => {
                            setJiraFilterPreset(preset.value);
                            setStatusFilter("Todos");
                            setTicketDate(undefined);
                          }}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="label-caps mb-2">
                      Status
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(["Todos", ...columns] as const).map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={statusFilter === status ? "default" : "ghost"}
                          aria-pressed={statusFilter === status}
                          onClick={() => setStatusFilter(status)}
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {view === "kanban" ? (
                <>
                {/* Celular: uma coluna por vez. Lado a lado não cabe em 375px,
                    e empilhar as cinco dava uma rolagem interminável. */}
                {visibleKanbanColumns.length > 1 && (
                  <div
                    className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:hidden"
                    role="group"
                    aria-label="Coluna do quadro"
                  >
                    {visibleKanbanColumns.map((column) => {
                      const count = filtered.filter((ticket) => ticket.status === column).length;
                      const active = column === activeMobileColumn;
                      return (
                        <button
                          key={column}
                          type="button"
                          onClick={() => openMobileColumn(column)}
                          aria-pressed={active}
                          className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${active ? "border-primary/40 bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground"}`}
                        >
                          <span className={`size-2 rounded-full ${dots[column]}`} aria-hidden="true" />
                          {shortColumn[column]}
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${active ? "bg-primary/15" : "bg-muted"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div
                  className={`mt-4 grid gap-4 ${visibleKanbanColumns.length > 1 ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "grid-cols-1"}`}
                >
                  {visibleKanbanColumns.map(
                    (column) => {
                      const items = filtered.filter(
                        (ticket) => ticket.status === column,
                      );
                      return (
                        <section
                          key={column}
                          aria-label={`${column}: ${items.length} ${items.length === 1 ? "chamado" : "chamados"}`}
                          className={`min-h-[280px] rounded-2xl border border-border bg-(--surface-inset) p-2 ${column === activeMobileColumn ? "" : "hidden sm:block"}`}
                        >
                          <div className="mb-2 flex min-h-9 items-center justify-between px-1.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={`size-2 shrink-0 rounded-full ${dots[column]}`}
                              />
                              <h3 className="truncate text-xs font-semibold" title={column}>
                                {column}
                              </h3>
                            </div>
                            <div className="flex items-center gap-1">
                              {items.length > 0 && (
                                <SelectBox
                                  checked={items.every((ticket) => selectedKeys.has(ticket.id))}
                                  indeterminate={
                                    items.some((ticket) => selectedKeys.has(ticket.id)) &&
                                    !items.every((ticket) => selectedKeys.has(ticket.id))
                                  }
                                  onChange={() => toggleSelectedGroup(items.map((ticket) => ticket.id))}
                                  label={`Selecionar os ${items.length} chamados de ${column}`}
                                  className="-my-3"
                                />
                              )}
                              <span className="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-center text-xs font-medium tabular-nums text-muted-foreground">
                                {items.length}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {empilhar(items, vinculosDeGrupo).map((entrada) => {
                              const cartao = (ticket: Ticket) => (
                                <TicketCard
                                  key={ticket.id}
                                  ticket={ticket}
                                  onOpen={() => void openTicket(ticket)}
                                  selected={selectedKeys.has(ticket.id)}
                                  onToggleSelect={() => toggleSelected(ticket.id)}
                                />
                              );
                              if (entrada.tipo === "chamado") return cartao(entrada.chamado);
                              const chaves = entrada.chamados.map((ticket) => ticket.id);
                              const todas = chaves.every((key) => selectedKeys.has(key));
                              const algumas = !todas && chaves.some((key) => selectedKeys.has(key));
                              return (
                                <TicketStack
                                  key={`pilha-${entrada.grupo.groupId}`}
                                  grupo={entrada.grupo}
                                  chamados={entrada.chamados}
                                  aberta={pilhasAbertas.has(entrada.grupo.groupId)}
                                  onAlternar={() =>
                                    setPilhasAbertas((atual) => {
                                      const proximo = new Set(atual);
                                      if (proximo.has(entrada.grupo.groupId)) proximo.delete(entrada.grupo.groupId);
                                      else proximo.add(entrada.grupo.groupId);
                                      return proximo;
                                    })
                                  }
                                  selecionada={todas}
                                  selecao={
                                    <SelectBox
                                      checked={todas}
                                      indeterminate={algumas}
                                      onChange={() => toggleSelectedGroup(chaves)}
                                      label={`Selecionar as ${chaves.length} FSAs do grupo ${entrada.grupo.nome ?? ""}`.trim()}
                                    />
                                  }
                                  renderChamado={cartao}
                                />
                              );
                            })}
                            {!items.length && (
                              <div className="grid h-28 place-items-center rounded-xl border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
                                {jiraLoading ? "Carregando…" : query.trim() || statusFilter !== "Todos" ? "Nada nesta coluna com os filtros atuais." : "Nenhum chamado nesta etapa."}
                              </div>
                            )}
                          </div>
                        </section>
                      );
                    },
                  )}
                </div>
                </>
              ) : (
                <div className="surface-panel mt-4 overflow-hidden rounded-2xl">
                  {filtered.length > 0 && (
                    <div className="flex min-h-11 items-center gap-1 border-b border-border bg-(--surface-table-head) px-2 text-xs font-medium text-muted-foreground">
                      <SelectBox
                        checked={filtered.every((ticket) => selectedKeys.has(ticket.id))}
                        indeterminate={
                          filtered.some((ticket) => selectedKeys.has(ticket.id)) &&
                          !filtered.every((ticket) => selectedKeys.has(ticket.id))
                        }
                        onChange={() => toggleSelectedGroup(filtered.map((ticket) => ticket.id))}
                        label={`Selecionar os ${filtered.length} chamados exibidos`}
                      />
                      {/* No desktop o cabeçalho vira rótulo das colunas; no
                          celular cada linha já traz os rótulos embutidos. */}
                      <span className="lg:hidden">Selecionar os {filtered.length} exibidos</span>
                      <span aria-hidden="true" className="hidden min-w-0 flex-1 gap-3 px-2 lg:grid lg:grid-cols-[112px_minmax(0,1fr)_160px_minmax(0,180px)]">
                        <span>FSA</span><span>Resumo · loja · cidade</span><span>Status</span><span>Técnico</span>
                      </span>
                    </div>
                  )}
                  {filtered.map((ticket) => (
                    <div
                      key={ticket.id}
                      className={`flex items-center gap-1 border-b border-border px-2 py-1 last:border-0 ${selectedKeys.has(ticket.id) ? "bg-primary-soft" : ""}`}
                    >
                      <SelectBox
                        checked={selectedKeys.has(ticket.id)}
                        onChange={() => toggleSelected(ticket.id)}
                        label={`Selecionar ${ticket.id}`}
                      />
                      <button type="button" onClick={() => void openTicket(ticket)} className="grid min-h-11 min-w-0 flex-1 gap-1.5 rounded-lg p-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:grid-cols-[112px_minmax(0,1fr)_160px_minmax(0,180px)] lg:items-center lg:gap-3">
                        <span className="font-mono text-xs font-semibold text-primary">{ticket.id}</span>
                        <div className="min-w-0"><p className="truncate text-sm font-medium">{ticket.title}</p><p className="truncate text-xs text-muted-foreground">{ticket.store} · {ticket.city}</p></div>
                        <span className="flex min-w-0 items-center gap-1.5 text-xs"><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dots[ticket.status]}`} /><span className="truncate">{ticket.status}</span></span>
                        <span className={`truncate text-xs ${ticket.technician ? "" : "text-muted-foreground"}`}>{ticket.technician || "Não atribuído"}</span>
                      </button>
                    </div>
                  ))}
                  {!filtered.length && (
                    <div className="grid min-h-48 place-items-center p-6 text-center">
                      <div className="max-w-sm">
                        <p className="text-sm font-medium">{jiraLoading ? "Carregando chamados…" : query.trim() ? `Nenhum chamado encontrado para “${query.trim()}”.` : "Nenhum chamado com os filtros atuais."}</p>
                        {!jiraLoading && <p className="mt-1 text-xs text-muted-foreground">A busca olha FSA, cidade, loja, técnico e resumo do chamado.</p>}
                        {!jiraLoading && (query.trim() || statusFilter !== "Todos") && (
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setQuery(""); setStatusFilter("Todos"); }}>Limpar busca e filtros</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {activeView === "agenda" && (
            <AgendaView
              tickets={tickets}
              loading={jiraLoading}
              onOpen={openTicket}
            />
          )}
          {activeView === "technicians" && (
            <TechniciansView
              users={n1Users}
              loading={n1Loading}
              tickets={tickets}
            />
          )}
          {activeView === "projects" && (
            <ProjectsView stores={stores} loading={jiraLoading} />
          )}
          {activeView === "feedback" && <FeedbackBoard user={user} />}
          {activeView === "history" && <TicketHistory user={user} />}
          {activeView === "whatsapp" && (
            <WhatsAppInbox
              user={user}
              tickets={tickets.map((ticket) => ({ id: ticket.id, title: ticket.title, store: ticket.store, city: ticket.city }))}
              onOpenTicket={(ticketId) => {
                const ticket = tickets.find((item) => item.id === ticketId);
                if (ticket) void openTicket(ticket);
              }}
            />
          )}
          {activeView === "settings" && (
            <>
              <SettingsView
                email={user?.email ?? ""}
                role={role}
                jiraError={jiraError}
                user={user}
              />
              {role === "gerencia" && <><EmployeeInvitePanel user={user} /><TeamManagementPanel /></>}
              {/* Auditoria da escrita assistida: coordenação e gerência. */}
              {(role === "gerencia" || role === "coordenador") && <AssistantAudit user={user} />}
            </>
          )}
        </div>
      </section>
      <ColleaguesPanel
        tickets={tickets.map((ticket) => ({
          id: ticket.id,
          title: ticket.title,
          store: ticket.store,
          city: ticket.city,
        }))}
        ticketToShare={ticketToShare}
        onTicketShareConsumed={() => setTicketToShare(null)}
        onOpenTicket={(ticketId) => {
          const ticket = tickets.find((item) => item.id === ticketId);
          if (ticket) void openTicket(ticket);
        }}
      />
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) closeTicketDialog();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-primary">
                {selected?.id}
              </Badge>
              <Badge variant="outline">{selected?.rawStatus}</Badge>
            </div>
            <DialogTitle className="pr-8 text-lg leading-snug">
              {selected?.title}
            </DialogTitle>
            <DialogDescription>
              Escolha para onde deseja seguir.
            </DialogDescription>
          </DialogHeader>
          {dialogLoading ? (
            <div className="grid min-h-40 place-items-center">
              <CajuLoading label="Carregando chamado..." fullscreen={false} compact />
            </div>
          ) : (
            <div className="space-y-4">
              {dialogError && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger/25 bg-danger-soft p-3 text-sm text-danger"
                >
                  {dialogError}
                </div>
              )}
              {detailsVisible && selected && (
                <section className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label="Resumo para atendimento">
                  <p className="label-caps">Resumo para atendimento</p>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <Detail label="Loja" value={`${selected.store || "Loja não informada"}${selected.city ? ` · ${selected.city}` : ""}`} />
                    <Detail label="Técnico" value={details?.technicianName || selected.technician || "Não atribuído"} />
                    <Detail label="Agendamento" value={details?.scheduledAt ? formatDate(details.scheduledAt) : selected.schedule || "Sem agendamento"} />
                    <Detail label="Status" value={details?.status || selected.rawStatus || selected.status} />
                    <Detail label="Contato" value={[details?.operationalFields.contactName, details?.operationalFields.contactPhone].filter(Boolean).join(" · ") || "Não informado"} />
                    <Detail label="Melhor horário" value={details?.operationalFields.preferredServiceTime || "Não informado"} />
                    <Detail className="sm:col-span-2" label="Defeito alegado" value={details?.operationalFields.allegedDefect || "Não informado"} />
                  </div>
                </section>
              )}
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                <Button
                  variant="outline"
                  className="h-auto min-h-14 min-w-0 sm:min-h-16 justify-start gap-3 whitespace-normal p-3 text-left"
                  onClick={() => setDetailsVisible((value) => !value)}
                  disabled={!details}
                >
                  <Eye className="size-5 shrink-0 text-blue-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold">
                      {detailsVisible ? "Mostrar menos" : "Mais informações"}
                    </span>
                    <span className="hidden break-words text-xs font-normal text-muted-foreground sm:block">
                      Equipe, spare, classificação e edição no Jira
                    </span>
                  </span>
                </Button>
                {detailsVisible && role !== "n1" && selected && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-14 min-w-0 sm:min-h-16 justify-start gap-3 whitespace-normal p-3 text-left"
                    onClick={() => void openJira()}
                  >
                    <ExternalLink className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-bold">Abrir no Jira</span>
                      <span className="hidden break-words text-xs font-normal text-muted-foreground sm:block">
                        Chamado original
                      </span>
                    </span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-auto min-h-14 min-w-0 sm:min-h-16 justify-start gap-3 whitespace-normal p-3 text-left"
                  nativeButton={false}
                  render={
                    <a
                      href={whatsappUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!whatsappUrl}
                    />
                  }
                  disabled={!whatsappUrl}
                >
                  <MessageCircle className="size-5 shrink-0 text-emerald-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold">Abrir WhatsApp</span>
                    <span className="hidden break-words text-xs font-normal text-muted-foreground sm:block">
                      {whatsappUrl ? "Ir para o grupo" : "Link não cadastrado"}
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-14 min-w-0 sm:min-h-16 justify-start gap-3 whitespace-normal border-emerald-400/25 p-3 text-left enabled:hover:border-emerald-400/50"
                  onClick={() => void copyJiraLinkForValidation()}
                  disabled={!validationReady || validationSending}
                  aria-describedby="validation-requirements"
                >
                  <ShieldCheck className="size-5 shrink-0 text-success" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold">Validar</span>
                    <span className="hidden break-words text-xs font-normal text-muted-foreground sm:block">
                      {validationReady
                        ? "Copiar link do Jira para enviar no grupo SUP"
                        : `Falta: ${validationRequirements.join(", ")}`}
                    </span>
                  </span>
                </Button>
                {detailsVisible && <Button
                  variant="outline"
                  className="h-auto min-h-14 min-w-0 sm:min-h-16 justify-start gap-3 whitespace-normal p-3 text-left"
                  onClick={() =>
                    selected &&
                    setTicketToShare({
                      id: selected.id,
                      title: selected.title,
                      store: selected.store,
                      city: selected.city,
                    })
                  }
                  disabled={!selected}
                >
                  <Users className="size-5 shrink-0 text-violet-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold">Enviar por chat</span>
                    <span className="hidden break-words text-xs font-normal text-muted-foreground sm:block">
                      Compartilhar com colega
                    </span>
                  </span>
                </Button>}
                {role !== "n1" && (
                  <Button
                    variant="outline"
                    className="h-auto min-h-14 min-w-0 sm:min-h-16 justify-start gap-3 whitespace-normal p-3 text-left"
                    onClick={() => setOperationOpen(true)}
                    disabled={!selected}
                  >
                    <Wrench className="size-5 shrink-0 text-amber-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-bold">Gerir operação</span>
                      <span className="hidden break-words text-xs font-normal text-muted-foreground sm:block">
                        Agenda, spare e pagamento
                      </span>
                    </span>
                  </Button>
                )}
              </div>
              <p
                id="validation-requirements"
                className={`text-xs ${validationReady ? "text-success" : "text-muted-foreground"}`}
                role="status"
              >
                {validationNotice ||
                  (validationReady
                    ? "Pronto para solicitar a validação da equipe."
                    : "O envio é liberado somente após concluir os requisitos informados no botão.")}
              </p>
              {/* Nota rápida sobre o atendimento (ex.: técnico adoeceu) → comentário
                  interno do Jira, assinado com nome e sobrenome. */}
              {selected && <TicketUpdateNote key={`update-${selected.id}`} ticketKey={selected.id} user={user} />}
              {/* O tipo da FSA fica à vista, logo abaixo das ações, e não dentro dos
                  detalhes do Jira: quem atende precisa achar sem rolar a tela. */}
              {detailsVisible && selected && (
                <FsaClassificacao
                  key={selected.id}
                  ticketKey={selected.id}
                  user={user}
                  chamado={{ title: selected.title, store: selected.store, city: selected.city, technician: selected.technician }}
                />
              )}
              {role === "n1" && selected && (
                <N1TicketActions ticketKey={selected.id} user={user} />
              )}
              {detailsVisible && linkedSpare && (
                <section className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label="Dados do spare vinculados à planilha">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="label-caps">Spare vinculado à planilha</p>
                      <h3 className="mt-1 text-sm font-bold">{linkedSpare.equipment || 'Peça não informada'}</h3>
                    </div>
                    <Badge variant="outline">{linkedSpare.status || 'Sem status'}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <Detail label="Fornecedor" value={linkedSpare.supplier || 'Não informado'} />
                    <Detail label="Técnico" value={linkedSpare.technician || 'Não informado'} />
                    <Detail label="Cidade" value={linkedSpare.city || 'Não informada'} />
                    <Detail label="Rastreio" value={linkedSpare.tracking || 'Não informado'} />
                    <Detail
                      label="Previsão de entrega"
                      value={
                        formatarDataExcelOuIso(linkedSpare.delivery) ||
                        'Sem previsão'
                      }
                    />
                    <Detail
                      label="Previsão de atendimento"
                      value={
                        formatarDataExcelOuIso(linkedSpare.service) ||
                        'Sem agendamento'
                      }
                    />
                    {linkedSpare.address && <Detail className="sm:col-span-2" label="Endereço de entrega" value={linkedSpare.address} />}
                    {linkedSpare.note && <Detail className="sm:col-span-2" label="Observação da planilha" value={linkedSpare.note} />}
                  </div>
                </section>
              )}
              {detailsVisible && details && (
                  <section className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <Detail label="Status" value={details.status} />
                      <Detail label="Prioridade" value={details.priority} />
                      <Detail
                        label="Responsável"
                        value={details.assignee || "Não atribuído"}
                      />
                      <Detail
                        label="Solicitante"
                        value={details.reporter || "Não informado"}
                      />
                      <Detail
                        label="Tipo"
                        value={details.issueType || "Não informado"}
                      />
                      <Detail
                        label="Criado em"
                        value={formatDate(details.createdAt)}
                      />
                      <Detail
                        className="sm:col-span-2"
                        label="Defeito alegado"
                        value={details.operationalFields.allegedDefect || "Não informado"}
                      />
                    </div>
                  </section>
              )}
              {details && (
                <JiraTicketDetails
                  key={details.key}
                  details={details}
                  user={user}
                  expanded={detailsVisible}
                  onUpdated={(updated) => {
                    const next = updated as JiraDetails;
                    setDetails(next);
                    setTickets((current) =>
                      current.map((ticket) =>
                        ticket.id === next.key ? toTicket(next) : ticket,
                      ),
                    );
                  }}
                />
              )}
              {detailsVisible && (role === "analista" || role === "gerencia") && (
                <section className="rounded-xl border border-success/25 bg-success-soft p-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="size-5 shrink-0 text-emerald-400" />
                    <div>
                      <h3 className="text-sm font-bold">Grupo do WhatsApp</h3>
                      <p className="text-xs text-muted-foreground">
                        Cole o link de convite deste chamado.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="url"
                      value={whatsappUrl}
                      onChange={(event) => setWhatsappUrl(event.target.value)}
                      placeholder="https://chat.whatsapp.com/..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => void saveWhatsappLink()}
                      disabled={linkSaving || !whatsappUrl.trim()}
                    >
                      {linkSaving ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Save />
                      )}{" "}
                      Salvar link
                    </Button>
                  </div>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {selected && (
        <OperationWorkflowDialog
          open={operationOpen}
          ticket={selected}
          role={role}
          user={user}
          onOpenChange={setOperationOpen}
          onArchived={(ticketKey) => {
            setArchivedKeys((current) => new Set([...current, ticketKey]));
            setOperationOpen(false);
            setSelected(null);
          }}
          onSaved={(ticketKey) => void refreshTicketDetails(ticketKey)}
        />
      )}
      {(activeView === "overview" ||
        activeView === "tickets" ||
        activeView === "central") && (
        <BulkTicketActions
          tickets={selectedTickets}
          role={role}
          user={user}
          onClear={() => setSelectedKeys(new Set())}
          onApplied={applyBulkResult}
          scheduleRequest={scheduleRequest}
        />
      )}
      {canUseWhatsapp(role) && (
        <WhatsappSendDialog
          draft={whatsappDraft}
          user={user}
          onClose={() => setWhatsappDraft(null)}
        />
      )}
    </main>
  );
}

function SelectBox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg transition hover:bg-violet-400/10 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="size-4 cursor-pointer accent-violet-400"
      />
    </label>
  );
}

function TicketCard({
  ticket,
  onOpen,
  selected = false,
  onToggleSelect,
}: {
  ticket: Ticket;
  onOpen: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  return (
    <article className={`relative rounded-xl border bg-card transition-colors ${selected ? "border-primary/60 bg-primary-soft ring-1 ring-primary/30" : "border-border hover:border-primary/40"}`}>
      {onToggleSelect && (
        <SelectBox
          checked={selected}
          onChange={onToggleSelect}
          label={`Selecionar ${ticket.id}`}
          className="absolute left-1 top-1 z-10"
        />
      )}
      <button type="button" onClick={onOpen} className="w-full rounded-xl p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <div className="flex items-center justify-between gap-3">
        <span className={`min-w-0 truncate whitespace-nowrap font-mono text-xs font-semibold text-primary ${onToggleSelect ? "pl-8" : ""}`}>
          {ticket.id}
        </span>
        {/* Só a prioridade alta ganha cor: é a que pede atenção. */}
        <span
          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
            ticket.priority === "Alta"
              ? "bg-danger-soft text-danger"
              : "text-muted-foreground"
          }`}
        >
          <span className="sr-only">Prioridade </span>{ticket.priority}
        </span>
      </div>
      <h4 className="mt-1.5 text-sm font-medium leading-snug">
        {ticket.title}
      </h4>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="flex min-w-0 items-center gap-1.5">
          <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{ticket.store}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{ticket.city}</span>
        </p>
        {ticket.schedule && (
          <p className="flex items-center gap-1.5 text-foreground">
            <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            Agendado: {ticket.schedule}
          </p>
        )}
        {ticket.partnerTriggeredAt && (
          <p className="flex items-center gap-1.5 text-foreground">
            <CalendarClock aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
            Acionado: {ticket.partnerTriggeredAt}
          </p>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="truncate text-[11px] text-muted-foreground">
          {ticket.rawStatus}
        </span>
        <span className={`truncate text-xs ${ticket.technician ? "font-medium" : "text-muted-foreground"}`}>{ticket.technician || "Sem técnico"}</span>
      </div>
      </button>
    </article>
  );
}

function TicketActivityCalendar({
  activities,
  selected,
  onSelect,
  onOpen,
}: {
  activities: TicketActivity[];
  selected?: Date;
  onSelect: (date?: Date) => void;
  onOpen: (ticket: Ticket) => void;
}) {
  const [open, setOpen] = useState(false);
  const dates = useMemo(
    () =>
      Array.from(
        new Map(
          activities.map((activity) => [dayKey(activity.date), activity.date]),
        ).values(),
      ),
    [activities],
  );
  const selectedActivities = selected
    ? activities.filter((activity) => sameDay(activity.date, selected))
    : [];
  const tones = {
    blue: "bg-blue-400",
    amber: "bg-amber-400",
    slate: "bg-slate-400",
  } as const;
  return (
    <section
      className="surface-panel mt-6 overflow-hidden rounded-2xl"
      aria-labelledby="ticket-calendar-title"
    >
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2
            id="ticket-calendar-title"
            className="flex items-center gap-2 font-semibold"
          >
            <CalendarDays className="size-5 text-primary" aria-hidden="true" />
            Calendário de atividades
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha uma data para ver atualizações, agendamentos e acionamentos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Escolher data no calendário"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              {selected ? formatDay(selected) : "Escolher data"}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-auto rounded-2xl border-border bg-popover p-2"
            >
              <Calendar
                mode="single"
                selected={selected}
                onSelect={(date) => {
                  onSelect(date);
                  if (date) setOpen(false);
                }}
                locale={ptBR}
                modifiers={{ hasActivity: dates }}
                modifiersClassNames={{
                  hasActivity:
                    "[&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:size-1 [&>button]:after:rounded-full [&>button]:after:bg-primary",
                }}
              />
            </PopoverContent>
          </Popover>
          {selected && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => onSelect(undefined)}
              aria-label="Limpar data selecionada"
            >
              <X aria-hidden="true" />
              Limpar
            </Button>
          )}
        </div>
      </div>
      {selected ? (
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{formatDayLong(selected)}</p>
            <Badge variant="outline">
              {selectedActivities.length} atividade
              {selectedActivities.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {selectedActivities.length ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {selectedActivities.map((activity, index) => (
                <button
                  type="button"
                  key={`${activity.ticket.id}-${activity.label}-${index}`}
                  onClick={() => onOpen(activity.ticket)}
                  className="flex min-h-16 w-full items-start gap-3 rounded-xl border border-border bg-card-elevated p-3 text-left transition hover:border-primary/35 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tones[activity.tone]}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">{activity.label}</strong>
                      <time className="text-xs tabular-nums text-muted-foreground">
                        {formatTime(activity.date)}
                      </time>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      <b className="font-mono text-primary">
                        {activity.ticket.id}
                      </b>{" "}
                      · {activity.ticket.store} · {activity.detail}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma atividade encontrada nessa data.
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 text-sm text-muted-foreground">
          As datas com ponto azul possuem alguma atividade registrada.
        </div>
      )}
    </section>
  );
}

function AgendaView({
  tickets,
  loading,
  onOpen,
}: {
  tickets: Ticket[];
  loading: boolean;
  onOpen: (ticket: Ticket) => void;
}) {
  const scheduled = tickets.filter(
    (ticket) =>
      ticket.schedule ||
      ticket.status === "Pendente de agendamento" ||
      ticket.status === "Agendado",
  );
  if (loading) return <LoadingPanel label="Carregando agenda..." />;
  if (!scheduled.length)
    return <EmptyState label="Nenhum atendimento aguardando agenda." hint="Chamados pendentes de agendamento ou já agendados aparecem aqui." />;
  return (
    <div className="surface-panel mt-6 overflow-hidden rounded-2xl">
      <div className="hidden border-b border-border bg-(--surface-table-head) px-4 py-2.5 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[130px_minmax(0,1fr)_160px_180px]">
        <span>Data</span>
        <span>Chamado</span>
        <span>Responsável</span>
        <span>Status</span>
      </div>
      {scheduled.map((ticket) => (
        <button
          type="button"
          key={ticket.id}
          onClick={() => onOpen(ticket)}
          className="grid w-full gap-2 border-b border-border px-4 py-4 text-left transition hover:bg-muted/60 last:border-0 lg:grid-cols-[130px_minmax(0,1fr)_160px_180px] lg:items-center"
        >
          <span className={`text-sm tabular-nums ${ticket.schedule ? "font-medium" : "text-warning"}`}>
            {ticket.schedule || "A definir"}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm font-medium">
              <span className="font-mono text-primary">{ticket.id}</span> · {ticket.store}
            </strong>
            <small className="block truncate text-muted-foreground">{ticket.title}</small>
          </span>
          <span className={`truncate text-sm ${ticket.technician ? "" : "text-muted-foreground"}`}>
            {ticket.technician || "Não atribuído"}
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dots[ticket.status]}`} />
            {ticket.status}
          </span>
        </button>
      ))}
    </div>
  );
}

function TechniciansView({
  users,
  loading,
  tickets,
}: {
  users: N1User[];
  loading: boolean;
  tickets: Ticket[];
}) {
  const { user, role } = useAuth();
  const requestedTech = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tech')?.trim() : null;
  const [tab, setTab] = useState<"n1" | "field">(requestedTech ? "field" : "n1");
  const [fieldTechnicians, setFieldTechnicians] = useState<FieldTechnician[]>(
    [],
  );
  const [fieldLoading, setFieldLoading] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [query, setQuery] = useState("");
  const [cityOnly, setCityOnly] = useState("");
  const [selected, setSelected] = useState<FieldTechnician | null>(null);
  const [nearCity, setNearCity] = useState("");
  const [nearLimit, setNearLimit] = useState(5);
  const [nearby, setNearby] = useState<FieldTechnician[] | null>(null);
  const [nearLabel, setNearLabel] = useState("");
  const [nearLoading, setNearLoading] = useState(false);
  const [nearError, setNearError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [lastTcpNumber, setLastTcpNumber] = useState("");
  const [exportFile, setExportFile] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => () => { if (exportFile) URL.revokeObjectURL(exportFile.url); }, [exportFile]);

  useEffect(() => {
    if (requestedTech) setTab("field");
  }, [requestedTech]);

  useEffect(() => {
    if (!requestedTech || !fieldTechnicians.length) return;
    const found = fieldTechnicians.find(
      (t) =>
        String(t.id) === requestedTech ||
        t.name.toLowerCase() === requestedTech.toLowerCase() ||
        ('technicianCode' in t && (t as unknown as { technicianCode?: string }).technicianCode === requestedTech)
    );
    if (found) {
      setSelected(found);
      setTab("field");
    }
  }, [requestedTech, fieldTechnicians]);

  useEffect(() => {
    if (tab !== "field" || !user || fieldTechnicians.length) return;
    let active = true;
    setFieldLoading(true);
    setFieldError("");
    void user
      .getIdToken()
      .then((token) =>
        fetch("/api/technicians", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      )
      .then(async (response) => {
        const payload = (await response.json()) as {
          technicians?: FieldTechnician[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            payload.error || "Não foi possível carregar os técnicos.",
          );
        if (active) {
          const list = payload.technicians ?? [];
          setFieldTechnicians(list);
          if (requestedTech) {
            const found = list.find((t) => String(t.id) === requestedTech || t.name.toLowerCase() === requestedTech.toLowerCase() || ('technicianCode' in t && (t as unknown as { technicianCode?: string }).technicianCode === requestedTech));
            if (found) setSelected(found);
          }
        }
      })
      .catch((error) => {
        if (active)
          setFieldError(
            error instanceof Error
              ? error.message
              : "Falha ao carregar técnicos.",
          );
      })
      .finally(() => {
        if (active) setFieldLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, user, fieldTechnicians.length]);
  const cities = Array.from(
    new Set(fieldTechnicians.map((tech) => tech.city).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtered = fieldTechnicians.filter(
    (tech) =>
      normalizeText(`${tech.name} ${tech.city} ${tech.state}`).includes(
        normalizeText(query),
      ) &&
      (!cityOnly || normalizeText(tech.city) === normalizeText(cityOnly)),
  );
  async function searchNearby(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || nearCity.trim().length < 2) return;
    setNearLoading(true);
    setNearError("");
    setNearby(null);
    try {
      const params = new URLSearchParams({ near: nearCity.trim(), limit: String(nearLimit) });
      const response = await fetch(`/api/technicians?${params}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store",
      });
      const payload = await response.json() as { city?: string; technicians?: FieldTechnician[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível buscar técnicos próximos.");
      setNearby(payload.technicians ?? []);
      setNearLabel(payload.city ?? nearCity.trim());
    } catch (reason) {
      setNearError(reason instanceof Error ? reason.message : "Não foi possível buscar técnicos próximos.");
    } finally {
      setNearLoading(false);
    }
  }
  function exportContacts() {
    const last = Number(lastTcpNumber);
    if (!/^\d+$/.test(lastTcpNumber.trim()) || !Number.isSafeInteger(last)) return;
    const csv = googleContactsCsv(fieldTechnicians, last);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const name = `tecnicos-google-contatos-tcp-${String(last + 1).padStart(4, "0")}.csv`;
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setExportFile({ url, name });
    setExportOpen(false);
  }
  return (
    <div className="mt-6 space-y-5">
      <div
        role="tablist"
        aria-label="Equipe"
        className="inline-flex rounded-lg bg-muted p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "n1"}
          onClick={() => setTab("n1")}
          className={`min-h-9 rounded-md px-4 text-sm font-medium transition-colors ${tab === "n1" ? "bg-card-elevated text-foreground shadow-(--shadow-xs)" : "text-muted-foreground hover:text-foreground"}`}
        >
          Equipe interna
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "field"}
          onClick={() => setTab("field")}
          className={`min-h-9 rounded-md px-4 text-sm font-medium transition-colors ${tab === "field" ? "bg-card-elevated text-foreground shadow-(--shadow-xs)" : "text-muted-foreground hover:text-foreground"}`}
        >
          Técnicos de campo
        </button>
      </div>
      {tab === "n1" ? (
        loading ? (
          <LoadingPanel label="Carregando equipe..." />
        ) : users.length ? (
          // Uma lista num painel só, em vez de um card por pessoa.
          <ul className="surface-panel max-w-4xl divide-y divide-border overflow-hidden rounded-2xl" aria-label={`${users.length} ${users.length === 1 ? "conta N1 ativa" : "contas N1 ativas"}`}>
            {users.map((member) => (
              <li key={member.email} className="flex items-center gap-3 px-4 py-3">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                  {member.email.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{member.email}</span>
                  <span className="block text-xs text-muted-foreground">Analista N1</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-success">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />Conta ativa
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState label="Nenhuma conta N1 ativa." />
        )
      ) : null}
      {tab === "n1" && role === "gerencia" && <><EmployeeInvitePanel user={user} /><TeamManagementPanel /></>}
      {tab === "field" && (
        <>
          <section className="surface-panel max-w-4xl rounded-2xl p-4 sm:p-5" aria-labelledby="nearby-technicians-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 id="nearby-technicians-title" className="font-semibold">Buscar técnicos próximos</h2><p className="mt-1 text-sm text-muted-foreground">Distância aproximada em linha reta entre os centros das cidades.</p></div>
              <Button type="button" variant="outline" onClick={() => setExportOpen(true)} disabled={!fieldTechnicians.some((tech) => brazilPhone(tech.phone))}><Download aria-hidden="true" /> Exportar Google Contatos</Button>
            </div>
            {exportFile && <p role="status" className="mt-3 text-sm text-success">CSV gerado. Se o download não iniciou, <a className="underline" href={exportFile.url} download={exportFile.name}>toque aqui para salvar {exportFile.name}</a>.</p>}
            <form onSubmit={(event) => void searchNearby(event)} className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1"><label htmlFor="near-city" className="mb-1 block text-sm font-medium">Cidade e UF</label><Input id="near-city" value={nearCity} onChange={(event) => setNearCity(event.target.value)} placeholder="Ex.: Salvador/BA" /></div>
              <div><label htmlFor="near-limit" className="mb-1 block text-sm font-medium">Mostrar</label><select id="near-limit" value={nearLimit} onChange={(event) => setNearLimit(Number(event.target.value))} className="h-11 rounded-md border border-input bg-background px-3 text-sm">{[2, 5, 10, 20].map((limit) => <option key={limit} value={limit}>{limit} técnicos</option>)}</select></div>
              <Button type="submit" disabled={nearLoading || nearCity.trim().length < 2}>{nearLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}Buscar</Button>
            </form>
            {nearError && <p role="alert" className="mt-3 text-sm text-danger">{nearError}</p>}
            {nearby && <div className="mt-4"><p className="mb-2 text-sm text-muted-foreground">{nearby.length ? `${nearby.length} técnico(s) mais próximo(s) de ${nearLabel}` : `Nenhum técnico com cidade mapeada perto de ${nearLabel}. Tente outra cidade/UF.`}</p><ol className="space-y-2">{nearby.map((tech) => <li key={tech.id}><button type="button" onClick={() => setSelected(tech)} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-left transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span><b className="block text-sm">{tech.name}</b><span className="text-xs text-muted-foreground">{tech.phone || "Sem telefone"} · {tech.city}/{tech.state}</span></span><span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-bold tabular-nums text-primary">{tech.distanceKm} km</span></button></li>)}</ol></div>}
          </section>
          <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="field-tech-search" className="sr-only">
                Buscar técnico de campo
              </label>
              <Input
                id="field-tech-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome, cidade ou UF..."
              />
            </div>
            <select
              aria-label="Filtrar técnicos por cidade"
              value={cityOnly}
              onChange={(event) => setCityOnly(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todas cidades</option>
              {cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </div>
          {fieldError && (
            <div
              role="alert"
              className="rounded-xl border border-danger/25 bg-danger-soft p-3 text-sm text-danger"
            >
              {fieldError}
            </div>
          )}
          {fieldLoading ? (
            <LoadingPanel label="Carregando técnicos de campo..." />
          ) : filtered.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((tech) => (
                <button
                  type="button"
                  key={tech.id}
                  onClick={() => setSelected(tech)}
                  className="surface-panel rounded-2xl p-5 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 font-bold text-primary">
                      {initials(tech.name)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{tech.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {tech.city} · {tech.state}
                      </p>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {tech.email || tech.phone || "Contato não informado"}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-auto shrink-0">
                      {tech.status || (tech.approved ? "Ativo" : "Pendente")}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              label={
                fieldTechnicians.length
                  ? "Nenhum técnico encontrado para essa busca."
                  : "Nenhum técnico cadastrado na planilha."
              }
            />
          )}
          <TechnicianDetailsDialog
            technician={selected}
            tickets={tickets}
            user={user}
            onClose={() => setSelected(null)}
          />
          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Exportar contatos TCP</DialogTitle><DialogDescription>Informe o número do último técnico salvo no Google Contatos. A exportação começa no número seguinte.</DialogDescription></DialogHeader><label htmlFor="last-tcp-number" className="text-sm font-medium">Último número TCP salvo</label><Input id="last-tcp-number" type="number" min="0" step="1" value={lastTcpNumber} onChange={(event) => setLastTcpNumber(event.target.value)} placeholder="Ex.: 125" /><p className="text-xs text-muted-foreground">Serão exportados {fieldTechnicians.filter((tech) => brazilPhone(tech.phone)).length} contatos com telefone válido. Confira o CSV antes de importar para evitar duplicatas.</p><Button onClick={exportContacts} disabled={!/^\d+$/.test(lastTcpNumber.trim())}><Download aria-hidden="true" /> Baixar CSV</Button></DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function TechnicianDetailsDialog({
  technician,
  tickets,
  user,
  onClose,
}: {
  technician: FieldTechnician | null;
  tickets: Ticket[];
  user: { getIdToken: () => Promise<string>; email?: string | null } | null;
  onClose: () => void;
}) {
  const [reviews, setReviews] = useState<TechnicianReview[]>([]);
  const [assignedTickets, setAssignedTickets] = useState<Array<{ ticketKey: string; status: string; scheduledAt: string | null; storeName: string | null; city: string | null }>>([]);
  const [assignedForId, setAssignedForId] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!technician || !user) return;
    let active = true;
    setLoading(true);
    setMessage("");
    void user
      .getIdToken()
      .then((token) =>
        fetch(`/api/technicians/${technician.id}/reviews`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      )
      .then(async (response) => {
        const payload = (await response.json()) as {
          reviews?: TechnicianReview[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || "Falha ao carregar avaliações.");
        if (active) setReviews(payload.reviews ?? []);
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "Falha ao carregar avaliações.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [technician, user]);
  useEffect(() => {
    if (!technician || !user) return;
    let active = true;
    void user.getIdToken().then((token) => fetch(`/api/technicians/${technician.id}/tickets`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    })).then(async (response) => {
      const payload = await response.json() as { tickets?: typeof assignedTickets; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao carregar fila do técnico.");
      if (active) { setAssignedTickets(payload.tickets ?? []); setAssignedForId(technician.id); }
    }).catch((reason) => { if (active) setMessage(reason instanceof Error ? reason.message : "Falha ao carregar fila do técnico."); });
    return () => { active = false; };
  }, [technician, user]);
  const visibleAssignedTickets = technician?.id === assignedForId ? assignedTickets : [];
  const attendance = technician
    ? tickets.filter((ticket) => {
        const candidate = normalizePerson(ticket.technician ?? "");
        const target = normalizePerson(technician.name);
        return (
          Boolean(candidate) &&
          (candidate === target ||
            candidate.includes(target) ||
            target.includes(candidate))
        );
      })
    : [];
  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!technician || !user || !comment.trim()) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/technicians/${technician.id}/reviews`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rating, comment: comment.trim() }),
        },
      );
      const payload = (await response.json()) as {
        review?: TechnicianReview;
        error?: string;
      };
      if (!response.ok || !payload.review)
        throw new Error(
          payload.error || "Não foi possível salvar a avaliação.",
        );
      setReviews((current) => [payload.review!, ...current]);
      setComment("");
      setRating(0);
      setMessage("Avaliação salva e visível para toda a equipe.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao salvar avaliação.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
  const whatsappUrl = technician ? whatsappLink(technician.phone) : null;
  const fields: Array<[string, string | null]> = technician
    ? [
        ["ID Técnico", technician.technicianExternalId],
        ["Código TEC", technician.technicianCode],
        ["Nome completo", technician.name],
        ["CPF", technician.cpf],
        ["WhatsApp / Telefone", technician.phone],
        ["E-mail", technician.email],
        ["Chave PIX", technician.pixKey],
        ["Idade", technician.age],
        ["Cidade", technician.city],
        ["UF", technician.state],
        ["Endereço completo", technician.fullAddress],
        ["Status", technician.sourceStatus || technician.status],
        [
          "Onboarding concluído?",
          technician.onboardingCompleted ||
            (technician.approved ? "Sim" : null),
        ],
        ["Possui veículo?", technician.hasVehicle],
        ["Tipo de veículo", technician.vehicleType],
        ["Transporte alternativo", technician.alternativeTransport],
        ["Atende outras cidades?", technician.servesOtherCities],
        ["Cidades atendidas extras", technician.extraCities],
        ["Qtd. ferramentas", technician.toolsCount],
        ["Ferramentas disponíveis", technician.availableTools],
        ["Qtd. especialidades", technician.specialtiesCount],
        ["Especialidades / áreas de domínio", technician.specialties],
      ]
    : [];
  return (
    <Dialog
      open={Boolean(technician)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {technician && (
          <>
            <DialogHeader>
              <DialogTitle>{technician.name}</DialogTitle>
              <DialogDescription>
                {technician.city} · {technician.state}
                {technician.email ? ` · ${technician.email}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <section className="rounded-xl border border-border bg-card/50 p-4">
                <h3 className="text-sm font-semibold">Cadastro do técnico</h3>
                <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  {fields.map(([label, value]) => (
                    <div
                      key={label}
                      className={
                        label === "Endereço completo" ||
                        label === "Transporte alternativo" ||
                        label === "Cidades atendidas extras" ||
                        label === "Ferramentas disponíveis" ||
                        label === "Especialidades / áreas de domínio"
                          ? "sm:col-span-2"
                          : ""
                      }
                    >
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {label === "WhatsApp / Telefone" &&
                      whatsappUrl &&
                      value ? (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex font-medium text-primary hover:underline"
                        >
                          {value}
                        </a>
                      ) : (
                        <p className="mt-1 break-words font-medium">
                          {value || "Não informado"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                <h3 className="text-sm font-semibold">Fila vinculada ao técnico ({visibleAssignedTickets.length})</h3>
                <p className="mt-1 text-xs text-muted-foreground">Vínculos pelo cadastro do técnico, sem comparação aproximada de nomes.</p>
                <div className="mt-3 space-y-2">
                  {visibleAssignedTickets.length ? visibleAssignedTickets.map((item) => <a key={item.ticketKey} href={`/?ticket=${encodeURIComponent(item.ticketKey)}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm hover:border-primary/50"><span><b className="font-mono text-primary">{item.ticketKey}</b><span className="ml-2 text-xs text-muted-foreground">{item.storeName || item.city || 'Sem loja'}</span></span><Badge variant="outline">{item.status}</Badge></a>) : <p className="text-sm text-muted-foreground">Nenhuma FSA vinculada pela gestão operacional.</p>}
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold">
                  Atendimentos realizados ({attendance.length})
                </h3>
                <div className="mt-3 space-y-2">
                  {attendance.length ? (
                    attendance.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="rounded-xl border border-border bg-card/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-xs font-bold text-primary">
                              {ticket.id}
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {ticket.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {ticket.store} · {ticket.city}
                            </p>
                          </div>
                          <Badge variant="outline">{ticket.status}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Nenhum atendimento encontrado nos chamados carregados.
                    </p>
                  )}
                </div>
              </section>
              <section className="border-t border-border pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Avaliações da equipe
                  </h3>
                  <span className="flex items-center gap-1 text-sm text-amber-300">
                    <Star className="size-4 fill-current" />{" "}
                    {average.toFixed(1)} ({reviews.length})
                  </span>
                </div>
                {loading ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Carregando avaliações...
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {reviews.map((review) => (
                      <article
                        key={review.id}
                        className="rounded-xl border border-border bg-card/50 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className="flex items-center gap-0.5 text-amber-300"
                            aria-label={`${review.rating} estrelas`}
                          >
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`size-3.5 ${star <= review.rating ? "fill-current" : ""}`}
                              />
                            ))}
                          </span>
                          <time className="text-xs text-muted-foreground">
                            {formatDate(review.createdAt)}
                          </time>
                        </div>
                        <p className="mt-2 text-sm">{review.comment}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {review.authorEmail}
                        </p>
                      </article>
                    ))}
                    {!reviews.length && (
                      <p className="text-sm text-muted-foreground">
                        Ainda não há avaliações.
                      </p>
                    )}
                  </div>
                )}
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => void submitReview(event)}
                >
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Sua nota
                    </p>
                    <div className="mt-2 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          type="button"
                          key={value}
                          aria-label={`Avaliar com ${value} estrelas`}
                          aria-pressed={rating === value}
                          onClick={() => setRating(value)}
                          className="rounded-md p-1 text-amber-300 transition hover:bg-amber-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Star
                            className={`size-5 ${value <= rating ? "fill-current" : ""}`}
                          />
                        </button>
                      ))}
                      <button
                        type="button"
                        className="ml-2 text-xs text-muted-foreground underline"
                        onClick={() => setRating(0)}
                      >
                        Sem nota
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="technician-review"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      Comentário visível para todos
                    </label>
                    <textarea
                      id="technician-review"
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      maxLength={1000}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      placeholder="Compartilhe um feedback sobre este técnico..."
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting || !comment.trim()}
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Save />
                    )}{" "}
                    Salvar comentário
                  </Button>
                  {message && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {message}
                    </p>
                  )}
                </form>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectsView({
  stores,
  loading,
}: {
  stores: { store: string; city: string; tickets: number }[];
  loading: boolean;
}) {
  if (loading) return <LoadingPanel label="Carregando lojas..." />;
  if (!stores.length)
    return <EmptyState label="Nenhuma loja encontrada nos chamados atuais." />;
  return (
    <div className="surface-panel mt-6 overflow-hidden rounded-2xl">
      <div className="hidden border-b border-border bg-(--surface-table-head) px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_220px_120px] sm:gap-3">
        <span>Loja</span>
        <span>Cidade</span>
        <span className="text-right">Chamados</span>
      </div>
      {stores.map((store) => (
        <div
          key={`${store.store}-${store.city}`}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_220px_120px] sm:items-center"
        >
          <strong className="truncate text-sm font-medium">{store.store}</strong>
          <span className="col-start-1 row-start-2 truncate text-sm text-muted-foreground sm:col-start-auto sm:row-start-auto">{store.city}</span>
          <span className="row-span-2 self-center text-right text-sm font-medium tabular-nums sm:row-span-1">
            {store.tickets}<span className="text-muted-foreground sm:sr-only"> {store.tickets === 1 ? "chamado" : "chamados"}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function EmployeeInvitePanel({
  user,
}: {
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<
    "gerencia" | "coordenador" | "n1" | "analista" | "tecnico"
  >("n1");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    setPhoto(localStorage.getItem("caju-os-profile-photo"));
  }, []);
  function choosePhoto(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      setPhoto(value);
      localStorage.setItem("caju-os-profile-photo", value);
    };
    reader.readAsDataURL(file);
  }
  async function submit() {
    if (!user || !email) return;
    setBusy(true);
    setMessage("Enviando convite...");
    try {
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role }),
      });
      const data = (await response.json()) as { error?: string; readmitted?: boolean };
      if (!response.ok) throw new Error(data.error);
      setMessage(
        data.readmitted
          ? "Pessoa readmitida: o acesso voltou com a hierarquia escolhida."
          : "Convite enviado. O funcionário receberá o link para criar a senha.",
      );
      setEmail("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao enviar convite.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="surface-panel mt-4 rounded-2xl p-5">
      <h2 className="font-semibold">Adicionar funcionário</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Informe e-mail e hierarquia. A pessoa recebe e-mail para criar senha.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="funcionario@empresa.com"
          type="email"
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
        >
          <option value="n1">N1</option>
          <option value="tecnico">Técnico de campo</option>
          <option value="analista">Analista</option>
          <option value="coordenador">Coordenador</option>
          <option value="gerencia">Gerência</option>
        </select>
        <Button disabled={busy || !email} onClick={() => void submit()}>
          Enviar convite
        </Button>
      </div>
      {message && (
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      )}
      <div className="mt-5 flex items-center gap-4 border-t border-border pt-4">
        <div className="grid size-14 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-primary">
          {photo ? (
            <img
              src={photo}
              alt="Foto do perfil"
              className="size-full object-cover"
            />
          ) : (
            "LO"
          )}
        </div>
        <label className="cursor-pointer text-sm font-semibold text-primary hover:underline">
          Adicionar foto de perfil
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => choosePhoto(event.target.files?.[0])}
          />
        </label>
      </div>
    </section>
  );
}

function SettingsView({
  email,
  role,
  jiraError,
  user,
}: {
  email: string;
  role: string | null;
  jiraError: string;
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  async function importFile(file: File) {
    if (!user) return;
    setImporting(true);
    setImportMessage("");
    try {
      const text = await readCsvText(file);
      const rows = parseTechnicianCsv(text);
      const response = await fetch("/api/technicians/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows }),
      });
      const payload = (await response.json()) as {
        imported?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setImportMessage(
        `${payload.imported ?? 0} técnicos importados com sucesso. O mapa e a lista usarão o banco atualizado.`,
      );
      window.dispatchEvent(new Event("technicians-imported"));
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : "Falha ao importar planilha.",
      );
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <ProfileSettings />
      {role === "gerencia" && (
        <>
          <section className="surface-panel rounded-2xl p-5">
            <h2 className="font-semibold">Conta e acesso</h2>
            <div className="mt-4 space-y-3">
              <Detail label="E-mail" value={email} />
              <Detail label="Perfil" value="Gerência" />
            </div>
          </section>
          <IntegrationHealthPanel user={user} jiraError={jiraError} />
          <section className="surface-panel rounded-2xl p-5 lg:col-span-2">
            <h2 className="font-semibold">Alimentar banco de técnicos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Importa todos os campos da planilha: cadastro, contato, endereço,
              veículo, cidades, ferramentas e especialidades. CSV UTF-8 e
              Windows-1252 suportados; reenvie a planilha para corrigir nomes já
              importados.
            </p>
            <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm font-semibold hover:bg-primary/10">
              Selecionar planilha: {importing ? "Importando..." : "CSV"}
              <input
                className="sr-only"
                type="file"
                accept=".csv,text/csv"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {importMessage && (
              <p className="mt-3 text-sm text-muted-foreground">
                {importMessage}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function IntegrationHealthPanel({
  user,
  jiraError,
}: {
  user: { getIdToken: () => Promise<string> } | null;
  jiraError: string;
}) {
  type Health = {
    configured: boolean;
    pending: number;
    failed: number;
    succeeded: number;
    lastSuccessAt: string | null;
    processed?: number;
    error?: string;
  };
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [installedVersion, setInstalledVersion] = useState("Web");
  const [latestVersion, setLatestVersion] = useState("0.1.13");
  async function load() {
    if (!user) return;
    try {
      const response = await fetch("/api/admin/jira-sync", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = (await response.json()) as Health;
      if (!response.ok) throw new Error(payload.error);
      setHealth(payload);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Falha ao consultar integração.",
      );
    }
  }
  async function retry() {
    if (!user) return;
    setBusy(true);
    setNotice("Repetindo sincronizações pendentes…");
    try {
      const response = await fetch("/api/admin/jira-sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = (await response.json()) as Health;
      if (!response.ok) throw new Error(payload.error);
      setHealth(payload);
      setNotice(`${payload.processed ?? 0} sincronização(ões) processada(s).`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Falha ao repetir sincronizações.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    if (!user) return;
    const response = await fetch("/api/admin/export", {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (!response.ok) {
      setNotice("Não foi possível gerar o backup.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `caju-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    void load();
    void fetch("/api/app-version")
      .then((response) => response.json() as Promise<{ version?: string }>)
      .then((data) => setLatestVersion(data.version ?? "0.1.13"))
      .catch(() => undefined);
    if ("__TAURI_INTERNALS__" in window)
      void import("@tauri-apps/api/app")
        .then(({ getVersion }) => getVersion())
        .then(setInstalledVersion)
        .catch(() => setInstalledVersion("Desktop"));
  }, [user]);
  const healthy = !jiraError && health?.configured && !health.failed;
  return (
    <section
      className="surface-panel rounded-2xl p-5 lg:col-span-2"
      aria-labelledby="integration-health-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="integration-health-title"
            className="flex items-center gap-2 font-semibold"
          >
            <Activity className="size-5 text-primary" aria-hidden="true" />
            Saúde e continuidade
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fila segura do Jira, recuperação e versão do aplicativo.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            healthy
              ? "border-emerald-400/30 text-success"
              : "border-amber-400/30 text-warning"
          }
        >
          {healthy ? "Operação saudável" : "Requer atenção"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Pendentes" value={health?.pending ?? 0} />
        <Metric label="Falhas para repetir" value={health?.failed ?? 0} />
        <Metric label="Sincronizadas" value={health?.succeeded ?? 0} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void retry()}
          disabled={busy || !health?.pending}
        >
          {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}Repetir
          pendências
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void backup()}
        >
          <DatabaseBackup />
          Baixar backup
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          nativeButton={false}
          render={<a href="/downloads/Caju-OS-0.1.14-x64-setup.exe" download />}
        >
          <Download />
          Baixar versão {latestVersion}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {notice ||
          `Instalado: ${installedVersion} · Disponível: ${latestVersion}${health?.lastSuccessAt ? ` · Última sincronização: ${formatDate(health.lastSuccessAt)}` : ""}`}
      </p>
    </section>
  );
}

async function readCsvText(file: File) {
  const data = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(data)
      .replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(data).replace(/^\uFEFF/, "");
  }
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="cockpit-inset rounded-xl p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function OperationalSummary({
  data,
  tickets,
  onOpenTicket,
}: {
  data: OperationalDashboard | null;
  tickets: Ticket[];
  onOpenTicket: (ticket: Ticket) => void;
}) {
  if (!data)
    return (
      <LoadingPanel label="Carregando indicadores operacionais…" />
    );
  const ticketByKey = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const validationQueue = (data.validationQueue ?? []).flatMap((item) => {
    const ticket = ticketByKey.get(item.ticketKey);
    return ticket ? [{ ...item, ticket }] : [];
  });
  const currency = (cents: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  return (
    <section className="surface-panel mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Inteligência operacional</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            SLA, produtividade, custos e histórico local. Atualiza a cada 30
            segundos.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            data.metrics.overdue
              ? "border-danger/30 bg-danger-soft text-danger"
              : "border-success/30 bg-success-soft text-success"
          }
        >
          {data.metrics.overdue
            ? `${data.metrics.overdue} SLA atrasado(s)`
            : "SLA em dia"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Fluxos ativos" value={data.metrics.active} />
        <Metric label="Visitas registradas" value={data.metrics.visits} />
        <div className="cockpit-inset rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Receita registrada</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {currency(data.metrics.revenueCents)}
          </p>
        </div>
        <div className="cockpit-inset rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Margem estimada</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {currency(data.metrics.marginCents)}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="label-caps">
            Chamados em validação
          </h3>
          <div className="mt-2 space-y-2">
            {validationQueue.slice(0, 6).map((item) => (
              <button
                key={`${item.ticketKey}-${item.submittedAt}`}
                type="button"
                onClick={() => onOpenTicket(item.ticket)}
                className="w-full rounded-lg border border-border bg-card-elevated px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <b className="font-mono text-primary">{item.ticketKey}</b>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                    {relativeAge(item.submittedAt)}
                  </span>
                </span>
                <span className="mt-1 block text-foreground">
                  {item.ticket.title}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Enviado por {item.submittedByName}
                </span>
              </button>
            ))}
            {!validationQueue.length && (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Nenhum chamado aguardando validação.
              </p>
            )}
            {!!data.validationQueue?.length && !validationQueue.length && (
              <p className="rounded-lg border border-border bg-card-elevated p-3 text-xs text-muted-foreground">
                Os chamados enviados já saíram da fila atual do Jira.
              </p>
            )}
          </div>
        </div>
        <div>
          <h3 className="label-caps">
            Histórico recente
          </h3>
          <div className="mt-2 space-y-2">
            {data.recentAudit.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-card-elevated px-3 py-2 text-xs"
              >
                <b className="text-primary">{item.ticketKey}</b> · {item.action}
                <span className="mt-1 block text-muted-foreground">
                  {item.actorEmail} · {formatDate(item.createdAt)}
                </span>
              </div>
            ))}
            {!data.recentAudit.length && (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Sem ações registradas.
              </p>
            )}
          </div>
        </div>
      </div>
      {!!data.collaborators?.length && <div className="mt-5"><h3 className="label-caps">Desempenho dos colaboradores</h3><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.collaborators.slice(0, 6).map((item) => <div key={item.email} className="rounded-lg border border-border bg-card-elevated px-3 py-2 text-xs"><div className="flex items-center justify-between gap-2"><b className="truncate">{item.email}</b><span className="font-bold text-primary">{item.score}/100</span></div><p className="mt-1 text-muted-foreground">{item.changes} alterações · {item.tasksDone} tarefas · {Math.round(item.activeSeconds / 60)} min ativos</p></div>)}</div></div>}
    </section>
  );
}

function EmptyState({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mt-6 grid min-h-48 place-items-center rounded-2xl border border-dashed border-border p-6 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
// Esqueleto no formato de uma lista: a seção aparece no lugar certo enquanto
// carrega, sem travar o resto da tela.
function LoadingPanel({ label }: { label: string }) {
  return (
    <output className="surface-panel mt-6 block space-y-3 rounded-2xl p-4" aria-label={label}>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <span aria-hidden="true" className="skeleton size-9 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span aria-hidden="true" className="skeleton block h-3 w-2/5 rounded" />
            <span aria-hidden="true" className="skeleton block h-2.5 w-3/5 rounded" />
          </span>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </output>
  );
}
function initials(value: string) {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function whatsappLink(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`}`;
}

function Detail({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap font-medium [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "Não informado";
}

function relativeAge(value: string) {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return "sem data";
  const minutes = Math.max(0, Math.floor((Date.now() - date) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}


function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toTicket(issue: JiraTicket): Ticket {
  const statusText = normalizeText(issue.status);
  const status: Status =
    statusText === "agendado"
      ? "Agendado"
      : statusText.includes("agendamento")
        ? "Pendente de agendamento"
        : statusText.includes("spare")
          ? "Aguardando spare"
          : statusText === "direcionado"
            ? "Direcionado"
            : "Técnico em campo";
  const priorityText = issue.priority.toLowerCase();
  const priority: Ticket["priority"] =
    priorityText.includes("highest") ||
    priorityText.includes("high") ||
    priorityText.includes("alta")
      ? "Alta"
      : priorityText.includes("low") || priorityText.includes("baixa")
        ? "Baixa"
        : "Media";
  const updated = issue.updatedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(issue.updatedAt))
    : "sem data";
  const storeFromTitle = issue.summary.match(/^Loja\s+([^|]+)/i)?.[0]?.trim();
  const store = issue.store || storeFromTitle || "";
  const storeLabel = /^[A-Z]?\d+$/i.test(store.replace(/^Loja\s+/i, "").trim())
    ? `Código da loja: ${store.replace(/^Loja\s+/i, "").trim()}`
    : store || "Loja não informada";
  const title = issue.summary.replace(
    /^Loja\s+([A-Z]?\d+)\s*\|/i,
    "Código da loja $1 |",
  );
  return {
    id: issue.key,
    title,
    store: storeLabel,
    city: issue.city || `Atualizado em ${updated}`,
    status,
    rawStatus: issue.status,
    priority,
    technician: issue.technicianName ?? undefined,
    schedule: formatJiraDate(issue.scheduledAt),
    partnerTriggeredAt: formatJiraDate(issue.partnerTriggeredAt),
    updatedAt: issue.updatedAt,
    scheduledAt: issue.scheduledAt ?? undefined,
    partnerTriggeredAtRaw: issue.partnerTriggeredAt ?? undefined,
  };
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}
function formatDayLong(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}
function formatTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDefectSummary(value: string) {
  const take = (start: string, end?: string) =>
    value
      .match(
        new RegExp(
          `${start}:?\\s*([\\s\\S]*?)${end ? `(?=${end}:?)` : "$"}`,
          "i",
        ),
      )?.[1]
      ?.trim() ?? "";
  return {
    identifiedProblem: take("PROBLEMA IDENTIFICADO", "TESTES FEITOS"),
    testsPerformed: take("TESTES FEITOS", "PEÇA A SER TROCADA"),
    partToReplace: take("PEÇA A SER TROCADA"),
  };
}

function isInServiceStatus(value: string) {
  const normalized = normalizeText(value);
  return (
    normalized.includes("tec-campo") ||
    normalized.includes("tecnico em campo") ||
    normalized.includes("em atendimento")
  );
}

function normalizePerson(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function formatJiraDate(value: string | null) {
  if (!value) return undefined;
  const brazilian = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  const date = brazilian
    ? new Date(
        Number(brazilian[3]),
        Number(brazilian[2]) - 1,
        Number(brazilian[1]),
        Number(brazilian[4]),
        Number(brazilian[5]),
        Number(brazilian[6] ?? 0),
      )
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function dashboardViewFromLocation(): DashboardView {
  const requestedView = new URLSearchParams(window.location.search).get("view");
  return isDashboardView(requestedView) ? requestedView : "overview";
}

function dashboardViewFromHref(href: string) {
  if (!href.startsWith("/?view=")) return null;
  const value = new URLSearchParams(href.slice(2)).get("view");
  return isDashboardView(value) ? value : null;
}

function defaultDashboardView(role: string | null): DashboardView {
  return canUseDashboardView(role, "overview") ? "overview" : "tickets";
}
