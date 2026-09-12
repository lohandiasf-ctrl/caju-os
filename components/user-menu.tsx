"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  File,
  FileAudio,
  History,
  Loader2,
  LogOut,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Paperclip,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Search,
  Send,
  Signal,
  Square,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/components/auth-provider";
import { roleLabels } from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  directVoiceRoom,
  type VoiceInvitation,
  VoiceCallReceiver,
  VoiceChatClient,
} from "@/lib/voice-chat";

export const statuses = [
  "Online",
  "Ocupado",
  "Ausente",
  "Não perturbe",
  "Almoçando",
  "Pausa de 15 minutos",
  "Offline",
] as const;
export type Status = (typeof statuses)[number];
type Colleague = {
  email: string;
  role: "gerencia" | "coordenador" | "n1" | "analista" | "tecnico";
  displayName: string | null;
  phone: string | null;
  photoUrl: string | null;
  status: Status;
  manualStatus?: boolean;
  lastSeenAt?: string | null;
  updatedAt: string | null;
};
type Message = {
  id: number;
  senderEmail: string;
  recipientEmail: string;
  body: string;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentData?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  readAt: string | null;
};
type ChatTicket = { id: string; title: string; store: string; city: string };
type NewMessageNotice = { message: Message; count: number };
type Group = {
  id: number;
  name: string;
  createdBy: string;
  updatedAt: string;
  unread: number;
  members: { email: string; memberRole: "owner" | "member" }[];
  lastMessage?: { body: string; createdAt: string } | null;
};
type GroupMessage = {
  id: number;
  groupId: number;
  senderEmail: string;
  body: string;
  ticketId?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentData?: string | null;
  createdAt: string;
};
type CallLog = {
  id: number;
  sessionId: string;
  direction: "incoming" | "outgoing";
  kind: "direct" | "group";
  peerNames: string;
  status: "missed" | "declined" | "completed" | "failed";
  startedAt: string;
  endedAt?: string | null;
  durationSeconds: number;
};
type CommunicationPreferences = {
  desktopMessages: boolean;
  desktopCalls: boolean;
  soundMessages: boolean;
  soundCalls: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};
const defaultPreferences: CommunicationPreferences = {
  desktopMessages: true,
  desktopCalls: true,
  soundMessages: true,
  soundCalls: true,
  quietHoursEnabled: false,
  quietHoursStart: "20:00",
  quietHoursEnd: "07:00",
};
let desktopPermissionRequested = false;

function appIsInBackground() {
  return document.hidden || !document.hasFocus();
}

async function showDesktopMessageNotification(
  senderName: string,
  message: Message,
  preferences: CommunicationPreferences,
) {
  if (
    !preferences.desktopMessages ||
    inQuietHours(preferences) ||
    localStorage.getItem("caju-status") === "Não perturbe" ||
    !appIsInBackground()
  )
    return;
  const body = message.body || message.attachmentName || "Novo anexo";
  const title = `Nova mensagem de ${senderName}`;
  try {
    // Tauri uses Windows native toast notifications. The dynamic import keeps
    // the web edition free of desktop-only code.
    if ("__TAURI_INTERNALS__" in window) {
      const notification = await import("@tauri-apps/plugin-notification");
      let allowed = await notification.isPermissionGranted();
      if (!allowed && !desktopPermissionRequested) {
        desktopPermissionRequested = true;
        allowed = (await notification.requestPermission()) === "granted";
      }
      if (allowed)
        notification.sendNotification({
          title,
          body,
          group: "caju-messages",
          autoCancel: true,
        });
      return;
    }
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(title, { body, tag: `caju-message-${message.id}` });
  } catch {
    /* Desktop notifications are optional; in-app feedback remains available. */
  }
}

async function showDesktopCallNotification(
  callerName: string,
  invitation: VoiceInvitation,
  preferences: CommunicationPreferences,
) {
  if (
    !preferences.desktopCalls ||
    inQuietHours(preferences) ||
    localStorage.getItem("caju-status") === "Não perturbe"
  )
    return;
  const background = appIsInBackground();
  const group = invitation.kind === "group";
  const title = group
    ? "Convite para reunião de voz"
    : "Chamada de voz recebida";
  const body = `${callerName} está chamando você. Abra o Caju OS para atender ou recusar.`;
  try {
    if ("__TAURI_INTERNALS__" in window) {
      const notification = await import("@tauri-apps/plugin-notification");
      const { invoke } = await import("@tauri-apps/api/core");
      let allowed = await notification.isPermissionGranted();
      if (!allowed && !desktopPermissionRequested) {
        desktopPermissionRequested = true;
        allowed = (await notification.requestPermission()) === "granted";
      }
      if (allowed)
        notification.sendNotification({
          title,
          body,
          group: `caju-voice-${invitation.roomId}`,
          autoCancel: true,
        });
      if (!background) return;
      await invoke("show_voice_call_window", { url: window.location.href });
      return;
    }
    if (!background) return;
    if ("Notification" in window && Notification.permission === "granted") {
      const desktopNotification = new Notification(title, {
        body,
        tag: "caju-voice-call",
        requireInteraction: true,
      });
      desktopNotification.onclick = () => {
        window.focus();
        window.dispatchEvent(new CustomEvent("caju-voice-answer-request"));
      };
    }
  } catch {
    /* O convite também fica visível dentro do Caju OS. */
  }
}

const statusColors: Record<Status, string> = {
  Online: "bg-emerald-400",
  Ocupado: "bg-rose-400",
  Ausente: "bg-yellow-400",
  "Não perturbe": "bg-fuchsia-400",
  Almoçando: "bg-amber-400",
  "Pausa de 15 minutos": "bg-sky-400",
  Offline: "bg-slate-500",
};
const statusTextColors: Record<Status, string> = {
  Online: "text-emerald-300",
  Ocupado: "text-rose-300",
  Ausente: "text-yellow-300",
  "Não perturbe": "text-fuchsia-300",
  Almoçando: "text-amber-300",
  "Pausa de 15 minutos": "text-sky-300",
  Offline: "text-slate-400",
};

function inQuietHours(preferences: CommunicationPreferences) {
  if (!preferences.quietHoursEnabled) return false;
  const value = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return preferences.quietHoursStart <= preferences.quietHoursEnd
    ? value >= preferences.quietHoursStart && value < preferences.quietHoursEnd
    : value >= preferences.quietHoursStart || value < preferences.quietHoursEnd;
}

async function recordCall(
  user: { getIdToken(): Promise<string> } | null | undefined,
  payload: Omit<CallLog, "id">,
) {
  if (!user) return;
  try {
    await fetch("/api/calls/history", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    /* Histórico não interrompe a chamada. */
  }
}

export function ColleaguesPanel({
  tickets = [],
  ticketToShare = null,
  onTicketShareConsumed,
  onOpenTicket,
}: {
  tickets?: ChatTicket[];
  ticketToShare?: ChatTicket | null;
  onTicketShareConsumed?: () => void;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const { user } = useAuth();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [chatTicket, setChatTicket] = useState<ChatTicket | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRecipients, setShareRecipients] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [colleaguesOpen, setColleaguesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NewMessageNotice | null>(null);
  const [messageDot, setMessageDot] = useState(false);
  const [incomingVoice, setIncomingVoice] = useState<VoiceInvitation | null>(
    null,
  );
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [section, setSection] = useState<"people" | "groups" | "history">(
    "people",
  );
  const [query, setQuery] = useState("");
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [preferences, setPreferences] =
    useState<CommunicationPreferences>(defaultPreferences);
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const latestIncomingId = useRef<number | null>(null);
  const colleaguesRef = useRef<Colleague[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sentDotTimerRef = useRef<number | null>(null);
  const callToneTimerRef = useRef<number | null>(null);
  const voiceReceiverRef = useRef<VoiceCallReceiver | null>(null);
  const prepareNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current)
        audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === "suspended")
        void audioContextRef.current.resume();
    } catch {
      /* O indicador visual continua disponível quando o áudio não for suportado. */
    }
  }, []);
  const playNotificationSound = useCallback((received: boolean) => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      received ? 740 : 560,
      context.currentTime,
    );
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + (received ? 0.18 : 0.11),
    );
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + (received ? 0.2 : 0.13));
  }, []);
  const stopCallTone = useCallback(() => {
    if (callToneTimerRef.current !== null)
      window.clearInterval(callToneTimerRef.current);
    callToneTimerRef.current = null;
  }, []);
  const startCallTone = useCallback(() => {
    stopCallTone();
    prepareNotificationSound();
    const ring = () => {
      const context = audioContextRef.current;
      if (!context || context.state !== "running") return;
      [0, 0.2].forEach((offset) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(460, context.currentTime + offset);
        gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(
          0.07,
          context.currentTime + offset + 0.02,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + offset + 0.16,
        );
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + 0.18);
      });
    };
    ring();
    callToneTimerRef.current = window.setInterval(ring, 1_600);
  }, [prepareNotificationSound, stopCallTone]);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/colleagues", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as { colleagues?: Colleague[] };
      if (response.ok)
        setColleagues((current) =>
          stableArray(
            current,
            (payload.colleagues ?? []).filter(
              (item) => item.email.toLowerCase() !== user.email?.toLowerCase(),
            ),
          ),
        );
    } finally {
      setLoading(false);
    }
  }, [user]);
  const loadCollaboration = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const [groupsResponse, historyResponse, preferencesResponse] =
        await Promise.all([
          fetch("/api/chat-groups", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch("/api/calls/history", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch("/api/communication-preferences", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ]);
      if (groupsResponse.ok) {
        const payload = (await groupsResponse.json()) as { groups?: Group[] };
        setGroups((current) => stableArray(current, payload.groups ?? []));
      }
      if (historyResponse.ok) {
        const payload = (await historyResponse.json()) as { calls?: CallLog[] };
        setCallHistory((current) => stableArray(current, payload.calls ?? []));
      }
      if (preferencesResponse.ok)
        setPreferences(
          (
            (await preferencesResponse.json()) as {
              preferences?: CommunicationPreferences;
            }
          ).preferences ?? defaultPreferences,
        );
    } catch {
      /* Cada painel mantém seu estado anterior e tenta novamente. */
    }
  }, [user]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 7_500);
    const refresh = () => void load();
    window.addEventListener("caju-presence-updated", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("caju-presence-updated", refresh);
    };
  }, [load]);
  useEffect(() => {
    void loadCollaboration();
    const timer = window.setInterval(() => void loadCollaboration(), 10_000);
    const refresh = () => void loadCollaboration();
    window.addEventListener("caju-collaboration-updated", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("caju-collaboration-updated", refresh);
    };
  }, [loadCollaboration]);
  useEffect(() => {
    if (!user || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/messages?q=${encodeURIComponent(query.trim())}`,
            {
              headers: { Authorization: `Bearer ${await user.getIdToken()}` },
              cache: "no-store",
            },
          );
          const payload = (await response.json()) as { messages?: Message[] };
          setSearchResults(payload.messages ?? []);
        } catch {
          setSearchResults([]);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, user]);
  useEffect(() => {
    colleaguesRef.current = colleagues;
  }, [colleagues]);
  useEffect(() => {
    const unlock = () => prepareNotificationSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [prepareNotificationSound]);
  useEffect(() => {
    if (!user?.email) return;
    const receiver = new VoiceCallReceiver(user.email, (invitation) => {
      setIncomingVoice(invitation);
      if (
        preferences.soundCalls &&
        !inQuietHours(preferences) &&
        localStorage.getItem("caju-status") !== "Não perturbe"
      )
        startCallTone();
      void showDesktopCallNotification(
        invitation.callerName,
        invitation,
        preferences,
      );
    });
    voiceReceiverRef.current = receiver;
    receiver.connect();
    return () => {
      receiver.dispose();
      if (voiceReceiverRef.current === receiver)
        voiceReceiverRef.current = null;
      stopCallTone();
    };
  }, [preferences, startCallTone, stopCallTone, user?.email]);
  useEffect(() => {
    const handleExternalAnswer = (event: StorageEvent) => {
      if (
        event.key !== "caju-voice-popup-answer" ||
        !event.newValue ||
        !incomingVoice
      )
        return;
      try {
        if (
          (JSON.parse(event.newValue) as { roomId?: string }).roomId ===
          incomingVoice.roomId
        ) {
          stopCallTone();
          setIncomingVoice(null);
        }
      } catch {
        /* Ignore malformed storage events. */
      }
    };
    window.addEventListener("storage", handleExternalAnswer);
    return () => window.removeEventListener("storage", handleExternalAnswer);
  }, [incomingVoice, stopCallTone]);
  useEffect(() => {
    const answerFromBrowserNotification = () =>
      window.dispatchEvent(
        new CustomEvent("caju-voice-answer-request-in-dialog"),
      );
    window.addEventListener(
      "caju-voice-answer-request",
      answerFromBrowserNotification,
    );
    return () =>
      window.removeEventListener(
        "caju-voice-answer-request",
        answerFromBrowserNotification,
      );
  }, []);
  useEffect(() => {
    if (!user) return;
    latestIncomingId.current = null;
    let active = true;
    let dismissTimer: number | undefined;
    const poll = async () => {
      try {
        const token = await user.getIdToken();
        if (latestIncomingId.current === null) {
          const baselineResponse = await fetch(
            "/api/messages?latestIncoming=1",
            {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            },
          );
          const baseline = (await baselineResponse.json()) as {
            latestMessageId?: number;
          };
          if (active && baselineResponse.ok)
            latestIncomingId.current = baseline.latestMessageId ?? 0;
          return;
        }
        const response = await fetch(
          `/api/messages?incomingAfter=${latestIncomingId.current}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
        );
        const payload = (await response.json()) as {
          messages?: Message[];
          latestMessageId?: number;
        };
        if (!active || !response.ok) return;
        latestIncomingId.current =
          payload.latestMessageId ?? latestIncomingId.current;
        const incoming = payload.messages ?? [];
        if (!incoming.length) return;
        const newest = incoming[incoming.length - 1];
        setNotice({ message: newest, count: incoming.length });
        setMessageDot(true);
        if (preferences.soundMessages && !inQuietHours(preferences))
          playNotificationSound(true);
        if (dismissTimer) window.clearTimeout(dismissTimer);
        dismissTimer = window.setTimeout(() => setNotice(null), 6_000);
        const sender = colleaguesRef.current.find(
          (item) =>
            item.email.toLowerCase() === newest.senderEmail.toLowerCase(),
        );
        void showDesktopMessageNotification(
          sender?.displayName || newest.senderEmail.split("@")[0],
          newest,
          preferences,
        );
      } catch {
        /* A próxima atualização tenta novamente sem interromper o painel. */
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (dismissTimer) window.clearTimeout(dismissTimer);
    };
  }, [playNotificationSound, preferences, user]);
  useEffect(() => {
    if (ticketToShare) setShareOpen(true);
  }, [ticketToShare]);
  const openChat = (colleague: Colleague) => {
    setChatTicket(null);
    setSelected(colleague);
    setMobileOpen(false);
    setColleaguesOpen(false);
  };
  async function shareTicketWithMany() {
    if (!user || !ticketToShare || !shareRecipients.length) return;
    setSharing(true);
    try {
      const token = await user.getIdToken();
      const body = `Chamado ${ticketToShare.id}: ${ticketToShare.title} (${ticketToShare.store} · ${ticketToShare.city})`;
      const responses = await Promise.all(shareRecipients.map((to) => fetch('/api/messages', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to, body }) })));
      if (responses.some((response) => !response.ok)) throw new Error('Alguns destinatários não receberam o chamado.');
      setShareRecipients([]); setShareOpen(false); onTicketShareConsumed?.(); indicateSentMessage();
    } catch (error) { setShareError(error instanceof Error ? error.message : 'Falha ao compartilhar chamado.'); }
    finally { setSharing(false); }
  }
  const filteredColleagues = colleagues.filter((item) =>
    `${item.displayName || ""} ${item.email} ${roleLabels[item.role]}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const filteredGroups = groups.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase()),
  );
  const list = (
    <ColleagueList
      colleagues={filteredColleagues}
      loading={loading}
      onSelect={openChat}
    />
  );
  const noticeSender = notice
    ? colleagues.find(
        (item) =>
          item.email.toLowerCase() === notice.message.senderEmail.toLowerCase(),
      )
    : null;
  function indicateSentMessage() {
    prepareNotificationSound();
    playNotificationSound(false);
    setMessageDot(true);
    if (sentDotTimerRef.current !== null)
      window.clearTimeout(sentDotTimerRef.current);
    sentDotTimerRef.current = window.setTimeout(
      () => setMessageDot(false),
      3_500,
    );
  }
  function toggleColleagues() {
    setColleaguesOpen((open) => {
      const next = !open;
      if (next) setMessageDot(false);
      return next;
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={toggleColleagues}
        aria-label={
          colleaguesOpen
            ? "Fechar colegas"
            : messageDot
              ? "Abrir colegas, nova atividade no chat"
              : "Abrir colegas"
        }
        aria-expanded={colleaguesOpen}
        className="fixed bottom-5 right-5 z-(--z-sidebar) hidden size-11 place-items-center rounded-xl border border-primary/30 bg-sidebar text-primary shadow-xl transition hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary xl:grid"
      >
        <Users className="size-5" aria-hidden="true" />
        {messageDot && (
          <span className="absolute right-1.5 top-1.5 size-2.5 animate-pulse rounded-full border-2 border-sidebar bg-emerald-400" />
        )}
      </button>
      <TeamVoiceControl
        colleagues={colleagues}
        onHistoryChanged={loadCollaboration}
      />
      <aside
        inert={!colleaguesOpen}
        className={`colleagues-sidebar fixed inset-y-0 right-0 z-(--z-float) hidden w-[228px] flex-col border-l border-sidebar-border bg-sidebar/95 px-3 py-4 shadow-[-18px_0_50px_rgba(0,0,0,.18)] backdrop-blur-xl transition-transform duration-200 motion-reduce:transition-none xl:flex ${colleaguesOpen ? "translate-x-0" : "pointer-events-none translate-x-[calc(100%+1.5rem)]"}`}
        aria-label="Colegas"
        aria-hidden={!colleaguesOpen}
      >
        <div className="flex h-10 items-center justify-between px-1">
          <div>
            <p className="text-sm font-bold">Comunicação</p>
            <p className="text-[11px] text-muted-foreground">
              Equipe, grupos e chamadas
            </p>
          </div>
          <button
            type="button"
            onClick={toggleColleagues}
            className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary transition hover:bg-primary/20"
            aria-label="Fechar comunicação"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex rounded-xl border border-border bg-background/50 p-1">
          {(
            [
              ["people", "Pessoas"],
              ["groups", "Grupos"],
              ["history", "Chamadas"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              className={`min-h-9 flex-1 rounded-lg px-1 text-[11px] font-semibold transition ${section === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {label}
              {value === "groups" && groups.some((group) => group.unread)
                ? ` (${groups.reduce((sum, group) => sum + group.unread, 0)})`
                : ""}
            </button>
          ))}
        </div>
        {section !== "history" && (
          <label className="relative mt-2 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Buscar conversas</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar..."
              className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-xs"
            />
          </label>
        )}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          {section === "people" ? (
            <>
              {list}
              {query.trim().length >= 2 && (
                <MessageSearchResults
                  messages={searchResults}
                  currentEmail={user?.email || ""}
                  colleagues={colleagues}
                  onSelect={openChat}
                />
              )}
            </>
          ) : section === "groups" ? (
            <GroupList
              groups={filteredGroups}
              onSelect={setSelectedGroup}
              onCreate={() => setCreateGroupOpen(true)}
            />
          ) : (
            <CallHistoryList calls={callHistory} />
          )}
        </div>
      </aside>
      <button
        type="button"
        onClick={() => {
          setMobileOpen(true);
          setMessageDot(false);
        }}
        className="fixed bottom-4 right-4 z-(--z-float) grid size-12 place-items-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-2xl xl:hidden"
        aria-label={
          messageDot ? "Abrir colegas, nova atividade no chat" : "Abrir colegas"
        }
      >
        <Users className="size-5" />
        {messageDot && (
          <span className="absolute right-0.5 top-0.5 size-3 animate-pulse rounded-full border-2 border-background bg-emerald-400" />
        )}
      </button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comunicação</DialogTitle>
            <DialogDescription>
              Status, mensagens, grupos e chamadas.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => setCreateGroupOpen(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
          >
            <Plus className="size-4" />
            Novo grupo
          </button>
          {list}
          <GroupList
            groups={groups}
            onSelect={(group) => {
              setSelectedGroup(group);
              setMobileOpen(false);
            }}
            onCreate={() => setCreateGroupOpen(true)}
          />
          <CallHistoryList calls={callHistory.slice(0, 5)} />
        </DialogContent>
      </Dialog>
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar chamado por chat</DialogTitle>
            <DialogDescription>
              {ticketToShare
                ? `Escolha um colega para receber o chamado ${ticketToShare.id}.`
                : "Escolha um colega."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShareRecipients(colleagues.filter((item) => item.role === 'n1').map((item) => item.email))} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">Todos os N1</button><button type="button" onClick={() => setShareRecipients(colleagues.filter((item) => item.role === 'analista').map((item) => item.email))} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">Todos os analistas</button><button type="button" onClick={() => setShareRecipients(colleagues.map((item) => item.email))} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">Toda a equipe</button></div>
          <div className="max-h-72 space-y-1 overflow-y-auto">{colleagues.map((colleague) => <label key={colleague.email} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3"><input type="checkbox" checked={shareRecipients.includes(colleague.email)} onChange={() => setShareRecipients((current) => current.includes(colleague.email) ? current.filter((email) => email !== colleague.email) : [...current, colleague.email])} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{colleague.displayName || colleague.email.split('@')[0]}</span><span className="text-xs text-muted-foreground">{roleLabels[colleague.role]}</span></label>)}</div>
          <button type="button" disabled={!shareRecipients.length || sharing} onClick={() => void shareTicketWithMany()} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{sharing ? 'Enviando…' : `Enviar para ${shareRecipients.length} pessoa(s)`}</button>
          {shareError && <p role="alert" className="text-xs text-rose-300">{shareError}</p>}
        </DialogContent>
      </Dialog>
      <ChatDialog
        colleague={selected}
        tickets={tickets}
        initialTicket={chatTicket}
        onClose={() => {
          setSelected(null);
          setChatTicket(null);
        }}
        onOpenTicket={onOpenTicket}
        onMessageSent={indicateSentMessage}
      />
      <GroupChatDialog
        group={selectedGroup}
        colleagues={colleagues}
        tickets={tickets}
        onClose={() => setSelectedGroup(null)}
        onOpenTicket={onOpenTicket}
        onUpdated={loadCollaboration}
      />
      <CreateGroupDialog
        open={createGroupOpen}
        colleagues={colleagues}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={loadCollaboration}
      />
      <IncomingVoiceCall
        invitation={incomingVoice}
        colleagues={colleagues}
        onAnswered={stopCallTone}
        onClose={() => {
          stopCallTone();
          setIncomingVoice(null);
          void loadCollaboration();
        }}
        onDecline={(invitation) => {
          voiceReceiverRef.current?.decline(invitation);
          stopCallTone();
          setIncomingVoice(null);
          void recordCall(user, {
            sessionId: invitation.roomId,
            direction: "incoming",
            kind: invitation.kind,
            peerNames: invitation.callerName,
            status: "declined",
            startedAt: new Date().toISOString(),
            durationSeconds: 0,
          });
        }}
      />
      {notice && (
        <div
          aria-live="assertive"
          className="fixed right-4 top-4 z-(--z-incoming-call) flex w-[min(22rem,calc(100vw-2rem))] items-start rounded-2xl border border-primary/35 bg-card shadow-2xl ring-1 ring-primary/10"
        >
          <button
            type="button"
            onClick={() => {
              if (noticeSender) openChat(noticeSender);
              setNotice(null);
            }}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-l-2xl p-4 text-left transition hover:bg-muted"
            aria-label="Abrir nova mensagem"
          >
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
              {noticeSender?.photoUrl ? (
                <img
                  src={noticeSender.photoUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                initials(
                  noticeSender?.displayName || notice.message.senderEmail,
                )
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">
                {notice.count > 1
                  ? `${notice.count} novas mensagens`
                  : "Nova mensagem"}{" "}
                de{" "}
                {noticeSender?.displayName ||
                  notice.message.senderEmail.split("@")[0]}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {notice.message.body ||
                  notice.message.attachmentName ||
                  "Novo anexo"}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="m-2 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fechar aviso"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}

// Bolhas no estilo iOS: dentro de uma sequencia do mesmo remetente os cantos
// internos ficam quadrados e so a ultima bolha ganha a cauda curva.
const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D|\s){1,3}$/u;

function bubbleClass(
  mine: boolean,
  runStart: boolean,
  runContinues: boolean,
  jumbo = false,
) {
  return [
    "chat-bubble",
    mine ? "chat-bubble--out" : "chat-bubble--in",
    runStart ? "chat-bubble--run-start" : "",
    runContinues ? "chat-bubble--run-cont" : "chat-bubble--tail",
    jumbo ? "chat-bubble--jumbo" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function sameSender(a?: { senderEmail: string }, b?: { senderEmail: string }) {
  if (!a || !b) return false;
  return a.senderEmail.toLowerCase() === b.senderEmail.toLowerCase();
}

function ColleagueList({
  colleagues,
  loading,
  onSelect,
}: {
  colleagues: Colleague[];
  loading: boolean;
  onSelect: (colleague: Colleague) => void;
}) {
  if (loading)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/40 p-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando equipe...
      </div>
    );
  if (!colleagues.length)
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Nenhum outro funcionário ativo.
      </div>
    );
  return (
    <div className="space-y-1.5">
      {colleagues.map((colleague) => {
        const name = colleague.displayName || colleague.email.split("@")[0];
        return (
          <button
            key={colleague.email}
            type="button"
            onClick={() => onSelect(colleague)}
            className="group flex min-h-12 w-full items-center gap-2.5 rounded-lg border border-transparent px-1.5 py-1.5 text-left transition hover:border-border hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Conversar com ${name}, status ${colleague.status}`}
          >
            <span className="relative grid size-8 shrink-0 place-items-center overflow-visible rounded-full border border-white/10 bg-muted text-[10px] font-bold text-foreground">
              {colleague.photoUrl ? (
                <img
                  src={colleague.photoUrl}
                  alt=""
                  className="size-full rounded-full object-cover"
                />
              ) : (
                initials(name)
              )}
              <span
                className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-sidebar ${statusColors[colleague.status]}`}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">
                {name}
              </span>
              <span className="block truncate text-[11px]">
                <span className="text-muted-foreground">
                  {roleLabels[colleague.role]} ·{" "}
                </span>
                <span
                  className={`font-medium ${statusTextColors[colleague.status]}`}
                >
                  {colleague.status}
                </span>
              </span>
              {colleague.status === "Offline" && colleague.lastSeenAt && (
                <span className="block truncate text-[10px] text-muted-foreground">
                  Visto {relativeTime(colleague.lastSeenAt)}
                </span>
              )}
            </span>
            <MessageCircle
              className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

function ChatDialog({
  colleague,
  tickets,
  initialTicket,
  onClose,
  onOpenTicket,
  onMessageSent,
}: {
  colleague: Colleague | null;
  tickets: ChatTicket[];
  initialTicket?: ChatTicket | null;
  onClose: () => void;
  onOpenTicket?: (ticketId: string) => void;
  onMessageSent?: () => void;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<{
    name: string;
    type: string;
    data: string;
  } | null>(null);
  const [ticketRef, setTicketRef] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [otherTyping, setOtherTyping] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const typingTimerRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!colleague) setChatMinimized(false);
  }, [colleague]);
  useEffect(() => {
    if (chatMinimized && !callActive) {
      setChatMinimized(false);
      onClose();
    }
  }, [callActive, chatMinimized, onClose]);
  const loadMessages = useCallback(
    async (quiet = false) => {
      if (!user || !colleague) return;
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(
          `/api/messages?with=${encodeURIComponent(colleague.email)}`,
          {
            headers: { Authorization: `Bearer ${await user.getIdToken()}` },
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as {
          messages?: Message[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || "Falha ao carregar a conversa.");
        setMessages((current) => stableArray(current, payload.messages ?? []));
        setError("");
      } catch (reason) {
        if (!quiet)
          setError(
            reason instanceof Error
              ? reason.message
              : "Falha ao carregar a conversa.",
          );
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [colleague, user],
  );
  useEffect(() => {
    if (!colleague) {
      // Clear composer state when the dialog closes so a previous attachment
      // or ticket cannot leak into the next conversation/send attempt.
      setMessages([]);
      setDraft("");
      setTicketRef("");
      setAttachment(null);
      setError("");
      setLoading(false);
      return;
    }
    setMessages([]);
    setDraft("");
    setTicketRef(initialTicket?.id ?? "");
    setAttachment(null);
    setError("");
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(true), 3_000);
    return () => window.clearInterval(timer);
  }, [colleague, initialTicket, loadMessages]);
  useEffect(() => {
    if (!user || !colleague) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/typing?with=${encodeURIComponent(colleague.email)}`,
          {
            headers: { Authorization: `Bearer ${await user.getIdToken()}` },
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as { typing?: string[] };
        if (active) setOtherTyping(Boolean(payload.typing?.length));
      } catch {
        /* indicador não bloqueia conversa */
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [colleague, user]);
  const signalTyping = useCallback(
    async (active: boolean) => {
      if (!user || !colleague) return;
      try {
        await fetch("/api/typing", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ with: colleague.email, active }),
        });
      } catch {
        /* indicador opcional */
      }
    },
    [colleague, user],
  );
  useEffect(() => {
    // Keep the effect cleanup contract explicit. Some browsers return a value
    // from scrollIntoView; returning it from the effect makes React treat it
    // as a cleanup function and crashes the chat on message updates.
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [messages]);
  useEffect(
    () => () => {
      if (recordingIntervalRef.current !== null)
        window.clearInterval(recordingIntervalRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recorder?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  function readAttachment(file: File) {
    const valid =
      file.type.startsWith("image/") ||
      file.type.startsWith("audio/") ||
      file.type === "application/pdf";
    if (!valid) {
      setError("Envie uma imagem, áudio ou PDF.");
      return;
    }
    if (file.size > 700_000) {
      setError("O anexo deve ter até 700 KB para manter o chat rápido.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachment({
          name: file.name,
          type: file.type,
          data: reader.result,
        });
        setError("");
      }
    };
    reader.onerror = () => setError("Não foi possível ler este anexo.");
    reader.readAsDataURL(file);
  }
  async function startRecording() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("A gravação de áudio não é compatível com este dispositivo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, {
          ...(preferredType ? { mimeType: preferredType } : {}),
          audioBitsPerSecond: 32_000,
        });
      } catch {
        recorder = new MediaRecorder(stream);
      }
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setError("A gravação foi interrompida. Tente novamente.");
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        if (recordingIntervalRef.current !== null)
          window.clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, {
          type: recorder.mimeType || preferredType || "audio/webm",
        });
        if (!blob.size) return;
        if (blob.size > 700_000) {
          setError(
            "O áudio ficou muito grande. Grave uma mensagem mais curta.",
          );
          return;
        }
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        readAttachment(
          new window.File(
            [blob],
            `audio-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
            { type: blob.type },
          ),
        );
      };
      recorderRef.current = recorder;
      setRecordingSeconds(0);
      setError("");
      setRecording(true);
      recorder.start(500);
      recordingIntervalRef.current = window.setInterval(
        () =>
          setRecordingSeconds((seconds) => {
            if (seconds >= 89 && recorder.state !== "inactive") recorder.stop();
            return seconds + 1;
          }),
        1_000,
      );
    } catch {
      setError(
        "Não foi possível acessar o microfone. Verifique a permissão do aplicativo.",
      );
    }
  }
  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (
      !user ||
      !colleague ||
      (!draft.trim() && !attachment && !ticketRef) ||
      sending
    )
      return;
    setSending(true);
    setError("");
    try {
      const selectedTicket = tickets.find((ticket) => ticket.id === ticketRef);
      const ticketText = selectedTicket
        ? `Chamado ${selectedTicket.id}: ${selectedTicket.title} (${selectedTicket.store} · ${selectedTicket.city})`
        : "";
      const messageText = [draft.trim(), ticketText].filter(Boolean).join("\n");
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: colleague.email,
          body: messageText,
          attachment,
        }),
      });
      const payload = (await response.json()) as {
        message?: Message;
        error?: string;
      };
      if (!response.ok || !payload.message)
        throw new Error(payload.error || "Falha ao enviar a mensagem.");
      setMessages((current) => [...current, payload.message!]);
      setDraft("");
      setTicketRef("");
      setAttachment(null);
      void signalTyping(false);
      onMessageSent?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao enviar a mensagem.",
      );
    } finally {
      setSending(false);
    }
  }
  const name = colleague?.displayName || colleague?.email.split("@")[0] || "";
  function openSharedTicket(ticketId: string) {
    onClose();
    onOpenTicket?.(ticketId);
  }
  return (
    <>
    <Dialog
      open={Boolean(colleague) && !chatMinimized}
      onOpenChange={(open) => {
        if (!open) {
          if (callActive) {
            setChatMinimized(true);
            return;
          }
          stopRecording();
          onClose();
        }
      }}
    >
      <DialogContent keepMounted className="grid h-[min(620px,88vh)] grid-rows-[auto_1fr_auto] overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border p-4 pr-14">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center overflow-hidden rounded-full bg-muted text-xs font-bold">
              {colleague?.photoUrl ? (
                <img
                  src={colleague.photoUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                initials(name)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle>{name}</DialogTitle>
              <DialogDescription className="truncate">
                {colleague?.status} · {colleague?.email}
              </DialogDescription>
            </div>
          </div>
          {colleague && <VoiceCallControl colleague={colleague} onActiveChange={setCallActive} />}
        </DialogHeader>
        <div
          className="chat-thread min-h-0 overflow-y-auto p-4"
          aria-live="polite"
        >
          {loading ? (
            <div className="grid h-full place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : messages.length ? (
            <div>
              {messages.map((message, index) => {
                const mine =
                  message.senderEmail.toLowerCase() ===
                  user?.email?.toLowerCase();
                const parsed = parseTicketMessage(message.body, tickets);
                const runStart = sameSender(messages[index - 1], message);
                const runContinues = sameSender(messages[index + 1], message);
                const jumbo =
                  !!parsed.text &&
                  !parsed.ticketId &&
                  !message.attachmentData &&
                  EMOJI_ONLY.test(parsed.text.trim());
                return (
                  <div
                    key={message.id}
                    className={`flex ${runStart ? "mt-0.5" : "mt-2"} ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={bubbleClass(mine, runStart, runContinues, jumbo)}
                    >
                      {parsed.text && (
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {parsed.text}
                        </p>
                      )}
                      {parsed.ticketId && (
                        <TicketShareCard
                          ticketId={parsed.ticketId}
                          label={parsed.ticketLabel}
                          mine={mine}
                          onOpen={() => openSharedTicket(parsed.ticketId!)}
                        />
                      )}
                      <MessageAttachment message={message} mine={mine} />
                    </div>
                  </div>
                );
              })}
              <ChatReceipt messages={messages} userEmail={user?.email} />
              {otherTyping && (
                <p className="text-xs text-muted-foreground">
                  {name} está digitando<span className="animate-pulse">…</span>
                </p>
              )}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              Envie a primeira mensagem para {name}.
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
        <form
          onSubmit={sendMessage}
          className="border-t border-border bg-card p-3"
        >
          {recording && (
            <div
              role="status"
              aria-live="polite"
              className="mb-2 flex min-h-10 items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 text-sm text-rose-200"
            >
              <span className="size-2 animate-pulse rounded-full bg-rose-400" />
              Gravando áudio · {formatDuration(recordingSeconds)}
              <span className="ml-auto text-xs text-rose-200/70">
                máx. 1:30
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <label htmlFor="chat-message" className="sr-only">
              Mensagem
            </label>
            <input
              id="chat-message"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                void signalTyping(Boolean(event.target.value));
                if (typingTimerRef.current !== null)
                  window.clearTimeout(typingTimerRef.current);
                typingTimerRef.current = window.setTimeout(
                  () => void signalTyping(false),
                  4_000,
                );
              }}
              maxLength={2000}
              placeholder="Escreva uma mensagem..."
              className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
            />
            <label
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-input bg-background hover:bg-muted"
              aria-label="Anexar imagem, áudio ou PDF"
            >
              <Paperclip className="size-4" />
              <input
                className="sr-only"
                type="file"
                accept="image/*,audio/*,.pdf,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readAttachment(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                recording ? stopRecording() : void startRecording()
              }
              className={`grid size-11 shrink-0 place-items-center rounded-xl border transition ${recording ? "border-rose-400/50 bg-rose-400/15 text-rose-300" : "border-input bg-background hover:bg-muted"}`}
              aria-label={recording ? "Parar gravação" : "Gravar áudio"}
            >
              {recording ? (
                <Square className="size-4 fill-current" />
              ) : (
                <Mic className="size-4" />
              )}
            </button>
            <button
              type="submit"
              disabled={
                (!draft.trim() && !attachment && !ticketRef) ||
                sending ||
                recording
              }
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Enviar mensagem"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>
          <select
            aria-label="Enviar chamado"
            value={ticketRef}
            onChange={(event) => setTicketRef(event.target.value)}
            className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"
          >
            <option value="">Anexar um chamado da lista...</option>
            {tickets.slice(0, 100).map((ticket) => (
              <option key={ticket.id} value={ticket.id}>
                {ticket.id} · {ticket.store}
              </option>
            ))}
          </select>
          {attachment && (
            <AttachmentPreview
              attachment={attachment}
              onRemove={() => setAttachment(null)}
            />
          )}
          {ticketRef && (
            <p className="mt-2 truncate text-xs text-muted-foreground">
              Chamado selecionado: {ticketRef}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
    {colleague && callActive && chatMinimized && (
      <button type="button" onClick={() => setChatMinimized(false)} className="fixed bottom-4 right-4 z-(--z-live-call) inline-flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-400/30 bg-card px-4 text-left shadow-2xl" aria-label="Restaurar chamada em andamento">
        <span className="grid size-9 place-items-center rounded-xl bg-emerald-400/12 text-emerald-300"><Phone className="size-4" /></span>
        <span><strong className="block text-sm">Chamada em andamento</strong><small className="text-muted-foreground">Clique para restaurar</small></span>
      </button>
    )}
    </>
  );
}

function VoiceCallControl({ colleague, onActiveChange }: { colleague: Colleague; onActiveChange?: (active: boolean) => void }) {
  const { user } = useAuth();
  const clientRef = useRef<VoiceChatClient | null>(null);
  const audioRef = useRef(new Map<string, HTMLAudioElement>());
  const [state, setState] = useState<"idle" | "connecting" | "connected">(
    "idle",
  );
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<
    "excellent" | "good" | "poor" | "reconnecting"
  >("good");
  const startedAtRef = useRef<string | null>(null);
  useEffect(() => onActiveChange?.(state !== "idle"), [onActiveChange, state]);
  const reset = useCallback(() => {
    audioRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    audioRef.current.clear();
    setState("idle");
    setMuted(false);
    setParticipants(0);
    setScreenStream(null);
    setSharingScreen(false);
  }, []);
  const leave = useCallback(() => {
    clientRef.current?.leave();
    clientRef.current = null;
    reset();
  }, [reset]);
  useEffect(() => leave, [leave, colleague.email]);
  async function join() {
    if (!user?.email || state !== "idle") return;
    setState("connecting");
    setError("");
    const client = new VoiceChatClient({
      onParticipantsChanged: (items) => setParticipants(items.length),
      onRemoteStream: (socketId, stream) => {
        let audio = audioRef.current.get(socketId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioRef.current.set(socketId, audio);
        }
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      },
      onRemoteScreenStream: (_socketId, stream) => setScreenStream(stream),
      onPeerLeft: (socketId) => {
        const audio = audioRef.current.get(socketId);
        audio?.pause();
        audioRef.current.delete(socketId);
      },
      onCallEnded: () => {
        leave();
        setError("A chamada foi encerrada pelo colega.");
      },
      onCallDeclined: () => {
        leave();
        setError("O colega recusou a chamada.");
      },
      onConnectionQuality: setQuality,
      onError: (reason) => setError(reason.message),
    });
    clientRef.current = client;
    try {
      await client.join(
        directVoiceRoom(user.email, colleague.email),
        user.uid,
        user.displayName || user.email.split("@")[0],
        user.email,
      );
      client.invite([colleague.email], "direct");
      startedAtRef.current = new Date().toISOString();
      setState("connected");
    } catch (reason) {
      leave();
      setError(
        reason instanceof Error ? reason.message : "Falha ao iniciar chamada.",
      );
    }
  }
  return (
    <div className="mt-3 rounded-xl border border-primary/25 bg-primary/[.07] p-2.5">
      <div className="flex items-center gap-2">
        {state === "idle" ? (
          <button
            type="button"
            onClick={() => void join()}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Phone className="size-4" aria-hidden="true" />
            Iniciar chamada de voz
          </button>
        ) : (
          <>
            <div
              role="status"
              aria-live="polite"
              className="min-w-0 flex-1 px-1"
            >
              <p className="truncate text-xs font-bold text-primary">
                {state === "connecting"
                  ? "Conectando..."
                  : "Chamada em andamento"}
              </p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Signal
                  className={`size-3 ${quality === "poor" ? "text-rose-300" : quality === "reconnecting" ? "text-amber-300" : "text-emerald-300"}`}
                />
                {participants
                  ? `${participants + 1} participantes · ${qualityLabel(quality)}`
                  : "Aguardando colega"}
              </p>
            </div>
            <button
              type="button"
              disabled={state !== "connected"}
              onClick={() => {
                if (sharingScreen) { clientRef.current?.stopScreenShare(); setSharingScreen(false); setScreenStream(null); }
                else void clientRef.current?.startScreenShare().then((stream) => { setSharingScreen(true); setScreenStream(stream); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao compartilhar tela."));
              }}
              className="grid size-11 place-items-center rounded-lg border border-border bg-background transition hover:bg-muted disabled:opacity-50"
              aria-label={sharingScreen ? "Parar compartilhamento de tela" : "Compartilhar tela"}
            >
              <MonitorUp className="size-4" />
            </button>
            <button
              type="button"
              disabled={state !== "connected"}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                clientRef.current?.setMuted(next);
              }}
              className="grid size-11 place-items-center rounded-lg border border-border bg-background transition hover:bg-muted disabled:opacity-50"
              aria-label={muted ? "Ativar microfone" : "Silenciar microfone"}
            >
              {muted ? (
                <MicOff className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const startedAt =
                  startedAtRef.current || new Date().toISOString();
                void recordCall(user, {
                  sessionId: directVoiceRoom(
                    user?.email || "",
                    colleague.email,
                  ),
                  direction: "outgoing",
                  kind: "direct",
                  peerNames: colleague.displayName || colleague.email,
                  status: "completed",
                  startedAt,
                  endedAt: new Date().toISOString(),
                  durationSeconds: Math.round(
                    (Date.now() - Date.parse(startedAt)) / 1000,
                  ),
                });
                clientRef.current?.endCall();
                clientRef.current = null;
                reset();
              }}
              className="grid size-11 place-items-center rounded-lg bg-rose-500 text-white transition hover:bg-rose-400"
              aria-label="Encerrar chamada para todos"
            >
              <PhoneOff className="size-4" />
            </button>
          </>
        )}
      </div>
      {screenStream && <ScreenPreview stream={screenStream} label={sharingScreen ? "Sua tela compartilhada" : "Tela compartilhada pelo colega"} />}
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

function TeamVoiceControl({
  colleagues,
  onHistoryChanged,
}: {
  colleagues: Colleague[];
  onHistoryChanged?: () => void;
}) {
  const { user } = useAuth();
  const clientRef = useRef<VoiceChatClient | null>(null);
  const audioRef = useRef(new Map<string, HTMLAudioElement>());
  const [state, setState] = useState<"idle" | "connecting" | "connected">(
    "idle",
  );
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [pickerMode, setPickerMode] = useState<"start" | "add">("start");
  const [minimized, setMinimized] = useState(false);
  const [quality, setQuality] = useState<
    "excellent" | "good" | "poor" | "reconnecting"
  >("good");
  const [remoteMuted, setRemoteMuted] = useState(false);
  const sessionRef = useRef<{
    id: string;
    startedAt: string;
    names: string;
  } | null>(null);
  const leave = useCallback(() => {
    clientRef.current?.leave();
    clientRef.current = null;
    audioRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    audioRef.current.clear();
    setState("idle");
    setMuted(false);
    setParticipants(0);
    setInvitedEmails([]);
    setSelectedEmails([]);
    setScreenStream(null);
    setSharingScreen(false);
    setMinimized(false);
  }, []);
  useEffect(() => leave, [leave]);
  async function join() {
    if (!user?.email || state !== "idle" || !selectedEmails.length) return;
    setState("connecting");
    setError("");
    const client = new VoiceChatClient({
      onParticipantsChanged: (items) => setParticipants(items.length),
      onRemoteStream: (socketId, stream) => {
        let audio = audioRef.current.get(socketId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioRef.current.set(socketId, audio);
        }
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      },
      onRemoteScreenStream: (_socketId, stream) => setScreenStream(stream),
      onPeerLeft: (socketId) => {
        const audio = audioRef.current.get(socketId);
        audio?.pause();
        audioRef.current.delete(socketId);
      },
      onConnectionQuality: setQuality,
      onError: (reason) => setError(reason.message),
    });
    clientRef.current = client;
    try {
      const roomId = `group:${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      await client.join(
        roomId,
        user.uid,
        user.displayName || user.email.split("@")[0],
        user.email,
      );
      client.invite(selectedEmails, "group");
      sessionRef.current = {
        id: roomId,
        startedAt: new Date().toISOString(),
        names: colleagues
          .filter((item) => selectedEmails.includes(item.email))
          .map((item) => item.displayName || item.email)
          .join(", "),
      };
      setInvitedEmails(selectedEmails);
      setSelectedEmails([]);
      setPickerOpen(false);
      setState("connected");
      setMinimized(false);
    } catch (reason) {
      leave();
      setError(
        reason instanceof Error ? reason.message : "Falha ao iniciar reunião.",
      );
    }
  }
  function openPicker(mode: "start" | "add") {
    setPickerMode(mode);
    setSelectedEmails([]);
    setPickerOpen(true);
  }
  function inviteMore() {
    if (state !== "connected" || !selectedEmails.length) return;
    clientRef.current?.invite(selectedEmails, "group");
    setInvitedEmails((current) => [
      ...new Set([...current, ...selectedEmails]),
    ]);
    setSelectedEmails([]);
    setPickerOpen(false);
  }
  const inviteLimit = Math.max(0, 5 - invitedEmails.length);
  const invitedNames = invitedEmails
    .map((email) => colleagues.find((item) => item.email === email))
    .filter((item): item is Colleague => Boolean(item))
    .map((item) => item.displayName || item.email.split("@")[0]);
  return (
    // Idle, this is just a launcher and must stay under dialogs; once a call is
    // live the surface has to outrank them so mute/hang-up stay reachable.
    <div
      className="pointer-events-none fixed bottom-20 right-4 sm:right-5"
      style={{ zIndex: state === "idle" ? "var(--z-float)" : "var(--z-live-call)" }}
    >
      {state === "idle" ? (
        <button
          type="button"
          onClick={() => openPicker("start")}
          className="pointer-events-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary px-4 text-sm font-bold text-primary-foreground shadow-2xl transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Users className="size-4" aria-hidden="true" />
          Reunião
        </button>
      ) : (
        <section
          aria-label="Reunião de voz em andamento"
          className={`pointer-events-auto overflow-hidden rounded-[1.7rem] border border-emerald-400/25 bg-slate-950/95 shadow-[0_24px_90px_rgba(0,0,0,.45)] backdrop-blur-xl transition-[width,transform] motion-reduce:transition-none ${minimized ? "w-[min(19rem,calc(100vw-2rem))]" : "w-[min(44rem,calc(100vw-2rem))]"}`}
        >
          <div className="flex min-h-16 items-center gap-3 border-b border-white/10 bg-white/[.03] p-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
              <Phone className="size-5" />
            </span>
            <div role="status" aria-live="polite" className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-foreground">
                {state === "connecting" ? "Conectando..." : "Reunião em andamento"}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Signal className={`size-3 ${quality === "poor" ? "text-rose-300" : quality === "reconnecting" ? "text-amber-300" : "text-emerald-300"}`} />
                {participants ? `${participants + 1} participantes · ${qualityLabel(quality)}` : "Aguardando colegas"}
              </p>
            </div>
            <button type="button" onClick={() => setMinimized((value) => !value)} className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" aria-label={minimized ? "Aumentar reunião" : "Minimizar reunião"}>
              {minimized ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
            </button>
            <button type="button" onClick={() => { const session = sessionRef.current; if (session) void recordCall(user, { sessionId: session.id, direction: "outgoing", kind: "group", peerNames: session.names, status: "completed", startedAt: session.startedAt, endedAt: new Date().toISOString(), durationSeconds: Math.round((Date.now() - Date.parse(session.startedAt)) / 1000) }).then(onHistoryChanged); leave(); }} className="grid size-10 place-items-center rounded-xl bg-rose-500 text-white transition hover:bg-rose-400" aria-label="Sair da reunião">
              <PhoneOff className="size-4" />
            </button>
          </div>
          {!minimized && (
            <>
              <div className="grid gap-3 p-3 sm:grid-cols-[1fr_14rem]">
                <div className="min-h-44 rounded-2xl border border-white/10 bg-black/35 p-3">
                  {screenStream ? (
                    <ScreenPreview stream={screenStream} label={sharingScreen ? "Sua tela compartilhada" : "Tela compartilhada"} />
                  ) : (
                    <div className="grid min-h-40 place-items-center text-center text-sm text-muted-foreground">
                      <div>
                        <Users className="mx-auto mb-3 size-10 text-emerald-300" />
                        <p className="font-semibold text-foreground">Sala de voz ativa</p>
                        <p className="mt-1 text-xs">Compartilhe tela quando precisar mostrar algo.</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Participantes</p>
                  <div className="mt-2 space-y-2">
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">Você</div>
                    {invitedNames.slice(0, 5).map((name) => (
                      <div key={name} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold">{name}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 border-t border-white/10 p-3">
                <button type="button" disabled={state !== "connected"} onClick={() => { if (sharingScreen) { clientRef.current?.stopScreenShare(); setSharingScreen(false); setScreenStream(null); } else void clientRef.current?.startScreenShare().then((stream) => { setSharingScreen(true); setScreenStream(stream); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao compartilhar tela.")); }} className={`min-h-12 rounded-2xl border px-2 text-xs font-bold disabled:opacity-50 ${sharingScreen ? "border-emerald-300/40 bg-emerald-400/20 text-emerald-100" : "border-white/10 bg-white/5"}`} aria-label={sharingScreen ? "Parar compartilhamento de tela" : "Compartilhar tela"}><MonitorUp className="mx-auto mb-1 size-4" />Tela</button>
                <button type="button" disabled={state !== "connected"} onClick={() => { const next = !muted; setMuted(next); clientRef.current?.setMuted(next); }} className={`min-h-12 rounded-2xl border px-2 text-xs font-bold disabled:opacity-50 ${muted ? "border-rose-300/35 bg-rose-400/15 text-rose-100" : "border-white/10 bg-white/5"}`} aria-label={muted ? "Ativar microfone" : "Silenciar microfone"}>{muted ? <MicOff className="mx-auto mb-1 size-4" /> : <Mic className="mx-auto mb-1 size-4" />}{muted ? "Mudo" : "Mic"}</button>
                <button type="button" disabled={state !== "connected"} onClick={() => { const next = !remoteMuted; setRemoteMuted(next); audioRef.current.forEach((audio) => { audio.muted = next; }); }} className={`min-h-12 rounded-2xl border px-2 text-xs font-bold disabled:opacity-50 ${remoteMuted ? "border-amber-300/35 bg-amber-400/15 text-amber-100" : "border-white/10 bg-white/5"}`} aria-label={remoteMuted ? "Ouvir participantes" : "Silenciar participantes"}><FileAudio className="mx-auto mb-1 size-4" />Som</button>
                <button type="button" disabled={state !== "connected" || !inviteLimit} onClick={() => openPicker("add")} className="min-h-12 rounded-2xl border border-white/10 bg-white/5 px-2 text-xs font-bold disabled:opacity-50" aria-label="Adicionar participantes"><UserPlus className="mx-auto mb-1 size-4" />Adicionar</button>
              </div>
            </>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="pointer-events-auto mt-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pickerMode === "start"
                ? "Iniciar reunião de voz"
                : "Adicionar participantes"}
            </DialogTitle>
            <DialogDescription>
              Selecione até {pickerMode === "start" ? 5 : inviteLimit} colega
              {pickerMode === "start" ? "s" : inviteLimit === 1 ? "" : "s"} para
              convidar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {colleagues
              .filter(
                (colleague) =>
                  pickerMode === "start" ||
                  !invitedEmails.includes(colleague.email),
              )
              .map((colleague) => {
                const checked = selectedEmails.includes(colleague.email);
                const name =
                  colleague.displayName || colleague.email.split("@")[0];
                return (
                  <label
                    key={colleague.email}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 transition hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedEmails((current) =>
                          checked
                            ? current.filter(
                                (email) => email !== colleague.email,
                              )
                            : current.length < inviteLimit
                              ? [...current, colleague.email]
                              : current,
                        )
                      }
                      className="size-4 accent-primary"
                    />
                    <span
                      className={`size-2.5 rounded-full ${statusColors[colleague.status]}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {colleague.status}
                    </span>
                  </label>
                );
              })}
          </div>
          <button
            type="button"
            disabled={!selectedEmails.length || state === "connecting"}
            onClick={() =>
              pickerMode === "start" ? void join() : inviteMore()
            }
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "connecting" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Phone className="size-4" />
            )}
            {pickerMode === "start"
              ? `Convidar ${selectedEmails.length || ""} colega${selectedEmails.length === 1 ? "" : "s"}`
              : `Adicionar ${selectedEmails.length || ""} participante${selectedEmails.length === 1 ? "" : "s"}`}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IncomingVoiceCall({
  invitation,
  colleagues,
  onAnswered,
  onClose,
  onDecline,
}: {
  invitation: VoiceInvitation | null;
  colleagues: Colleague[];
  onAnswered: () => void;
  onClose: () => void;
  onDecline: (invitation: VoiceInvitation) => void;
}) {
  const { user } = useAuth();
  const clientRef = useRef<VoiceChatClient | null>(null);
  const audioRef = useRef(new Map<string, HTMLAudioElement>());
  const [state, setState] = useState<"ringing" | "connecting" | "connected">(
    "ringing",
  );
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState<
    "excellent" | "good" | "poor" | "reconnecting"
  >("good");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const startedAtRef = useRef<string | null>(null);
  useEffect(() => {
    setState("ringing");
    setMuted(false);
    setParticipants(0);
    setError("");
    setMinimized(false);
    setScreenStream(null);
    setSharingScreen(false);
  }, [invitation?.roomId]);
  const cleanup = useCallback((notify = true) => {
    if (notify) clientRef.current?.leave();
    clientRef.current = null;
    audioRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    audioRef.current.clear();
    setState("ringing");
    setMuted(false);
    setParticipants(0);
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);
  async function accept() {
    if (!invitation || !user?.email || state !== "ringing") return;
    setState("connecting");
    setError("");
    const client = new VoiceChatClient({
      onParticipantsChanged: (items) => setParticipants(items.length),
      onRemoteStream: (socketId, stream) => {
        let audio = audioRef.current.get(socketId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioRef.current.set(socketId, audio);
        }
        audio.srcObject = stream;
        void audio.play().catch(() => undefined);
      },
      onRemoteScreenStream: (_socketId, stream) => setScreenStream(stream),
      onPeerLeft: (socketId) => {
        const audio = audioRef.current.get(socketId);
        audio?.pause();
        audioRef.current.delete(socketId);
      },
      onCallEnded: () => {
        cleanup(false);
        onClose();
      },
      onConnectionQuality: setQuality,
      onError: (reason) => setError(reason.message),
    });
    clientRef.current = client;
    try {
      await client.join(
        invitation.roomId,
        user.uid,
        user.displayName || user.email.split("@")[0],
        user.email,
      );
      startedAtRef.current = new Date().toISOString();
      onAnswered();
      setState("connected");
    } catch (reason) {
      cleanup();
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atender a chamada.",
      );
    }
  }
  useEffect(() => {
    const answerFromNotification = () => {
      void accept();
    };
    window.addEventListener(
      "caju-voice-answer-request-in-dialog",
      answerFromNotification,
    );
    return () =>
      window.removeEventListener(
        "caju-voice-answer-request-in-dialog",
        answerFromNotification,
      );
  });
  function closeActive() {
    if (invitation) {
      const startedAt = startedAtRef.current || new Date().toISOString();
      void recordCall(user, {
        sessionId: invitation.roomId,
        direction: "incoming",
        kind: invitation.kind,
        peerNames: invitation.callerName,
        status: "completed",
        startedAt,
        endedAt: new Date().toISOString(),
        durationSeconds: Math.round(
          (Date.now() - Date.parse(startedAt)) / 1000,
        ),
      });
    }
    if (invitation?.kind === "direct") {
      clientRef.current?.endCall();
      cleanup(false);
    } else cleanup();
    onClose();
  }
  const caller = invitation?.callerName || "Colega";
  const active = Boolean(invitation) && state !== "ringing";
  return (
    <>
      <Dialog
        open={Boolean(invitation) && state === "ringing"}
        onOpenChange={(open) => {
          if (!open && invitation) onDecline(invitation);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneIncoming className="size-5 text-emerald-400" />
              Chamada recebida
            </DialogTitle>
            <DialogDescription>
              {caller} convidou você para{" "}
              {invitation?.kind === "group"
                ? "uma reunião de voz"
                : "uma chamada de voz"}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => invitation && onDecline(invitation)}
              className="min-h-11 flex-1 rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 text-sm font-semibold text-rose-200"
            >
              Recusar
            </button>
            <button
              type="button"
              onClick={() => void accept()}
              className="min-h-11 flex-1 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-white"
            >
              Atender
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      {active && (
        <section
          aria-label="Chamada de voz em andamento"
          className={`fixed bottom-4 right-4 z-(--z-live-call) rounded-2xl border border-emerald-400/30 bg-card/95 shadow-2xl backdrop-blur-xl transition-[width] motion-reduce:transition-none ${minimized ? "w-56" : "w-[min(25rem,calc(100vw-2rem))]"}`}
        >
          <div className="flex min-h-14 items-center gap-3 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/12 text-emerald-300">
              <Phone className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {invitation?.kind === "group" ? "Reunião em andamento" : caller}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {state === "connecting"
                  ? "Conectando…"
                  : `${participants + 1} participante(s) · ${qualityLabel(quality)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMinimized((value) => !value)}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-border hover:bg-muted"
              aria-label={minimized ? "Expandir chamada" : "Minimizar chamada"}
            >
              {minimized ? (
                <Maximize2 className="size-4" />
              ) : (
                <Minimize2 className="size-4" />
              )}
            </button>
          </div>
          {!minimized && (
            <><div className="flex gap-2 border-t border-border p-3">
              <button type="button" disabled={state !== "connected"} onClick={() => { if (sharingScreen) { clientRef.current?.stopScreenShare(); setSharingScreen(false); setScreenStream(null); } else void clientRef.current?.startScreenShare().then((stream) => { setSharingScreen(true); setScreenStream(stream); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Falha ao compartilhar tela.")); }} className="grid size-11 place-items-center rounded-xl border border-border bg-background" aria-label={sharingScreen ? "Parar compartilhamento de tela" : "Compartilhar tela"}><MonitorUp className="size-4" /></button>
              <button
                type="button"
                disabled={state !== "connected"}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  clientRef.current?.setMuted(next);
                }}
                className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-xs font-semibold disabled:opacity-50"
              >
                {muted ? "Ativar microfone" : "Silenciar"}
              </button>
              {invitation?.kind === "group" && (
                <button
                  type="button"
                  disabled={state !== "connected"}
                  onClick={() => setInviteOpen(true)}
                  className="grid size-11 place-items-center rounded-xl border border-border bg-background"
                  aria-label="Adicionar participantes"
                >
                  <UserPlus className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={closeActive}
                className="min-h-11 flex-1 rounded-xl bg-rose-500 px-3 text-xs font-semibold text-white"
              >
                Encerrar
              </button>
            </div>{screenStream && <div className="px-3 pb-3"><ScreenPreview stream={screenStream} label={sharingScreen ? "Sua tela compartilhada" : "Tela compartilhada"} /></div>}</>
          )}
          {error && (
            <p role="alert" className="px-3 pb-3 text-xs text-rose-300">
              {error}
            </p>
          )}
        </section>
      )}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar à reunião</DialogTitle>
            <DialogDescription>
              Escolha colegas para convidar agora.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {colleagues.map((colleague) => (
              <label
                key={colleague.email}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3"
              >
                <input
                  type="checkbox"
                  checked={selectedEmails.includes(colleague.email)}
                  onChange={() =>
                    setSelectedEmails((items) =>
                      items.includes(colleague.email)
                        ? items.filter((item) => item !== colleague.email)
                        : [...items, colleague.email].slice(0, 5),
                    )
                  }
                />
                <span className="truncate text-sm">
                  {colleague.displayName || colleague.email}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={!selectedEmails.length}
            onClick={() => {
              clientRef.current?.invite(selectedEmails, "group");
              setSelectedEmails([]);
              setInviteOpen(false);
            }}
            className="min-h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Enviar convite
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageAttachment({
  message,
  mine,
}: {
  message: Pick<
    Message,
    "attachmentData" | "attachmentName" | "attachmentType"
  >;
  mine: boolean;
}) {
  if (!message.attachmentData) return null;
  const name = message.attachmentName || "Anexo";
  const type = message.attachmentType || "";
  if (type.startsWith("image/"))
    return (
      <a
        href={message.attachmentData}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block overflow-hidden rounded-xl border border-white/15 bg-black/15"
        aria-label={`Abrir imagem ${name}`}
      >
        <img
          src={message.attachmentData}
          alt={name}
          className="max-h-72 w-full object-contain"
          loading="lazy"
        />
        <span
          className={`block truncate px-2 py-1.5 text-[11px] ${mine ? "text-white/75" : "text-muted-foreground"}`}
        >
          {name}
        </span>
      </a>
    );
  if (type.startsWith("audio/"))
    return (
      <div className="mt-2 min-w-[230px] rounded-xl border border-white/15 bg-black/10 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px]">
          <FileAudio className="size-3.5" />
          Mensagem de áudio
        </div>
        <audio
          controls
          preload="metadata"
          src={message.attachmentData}
          className="h-10 w-full"
          aria-label={name}
        />
      </div>
    );
  return (
    <a
      href={message.attachmentData}
      download={name}
      target="_blank"
      rel="noreferrer"
      className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-black/10 px-3 text-xs font-semibold underline"
    >
      <File className="size-4" />
      {name}
    </a>
  );
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: { name: string; type: string; data: string };
  onRemove: () => void;
}) {
  return (
    <div className="relative mt-2 overflow-hidden rounded-xl border border-border bg-background/70 p-2 pr-10">
      {attachment.type.startsWith("image/") ? (
        <div className="flex items-center gap-3">
          <img
            src={attachment.data}
            alt={`Prévia de ${attachment.name}`}
            className="h-20 w-24 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold">Imagem pronta para enviar</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {attachment.name}
            </p>
          </div>
        </div>
      ) : attachment.type.startsWith("audio/") ? (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
            <FileAudio className="size-4" />
            Áudio pronto para enviar
          </p>
          <audio
            controls
            preload="metadata"
            src={attachment.data}
            className="h-10 w-full"
          />
        </div>
      ) : (
        <div className="flex min-h-10 items-center gap-2 text-xs">
          <File className="size-4" />
          <span className="truncate">{attachment.name}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Remover anexo"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function MessageSearchResults({
  messages,
  currentEmail,
  colleagues,
  onSelect,
}: {
  messages: Message[];
  currentEmail: string;
  colleagues: Colleague[];
  onSelect: (colleague: Colleague) => void;
}) {
  if (!messages.length)
    return (
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Nenhuma mensagem encontrada.
      </p>
    );
  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Mensagens encontradas
      </p>
      {messages.slice(0, 8).map((message) => {
        const peerEmail =
          message.senderEmail.toLowerCase() === currentEmail.toLowerCase()
            ? message.recipientEmail
            : message.senderEmail;
        const peer = colleagues.find(
          (item) => item.email.toLowerCase() === peerEmail.toLowerCase(),
        );
        if (!peer) return null;
        return (
          <button
            key={message.id}
            type="button"
            onClick={() => onSelect(peer)}
            className="mb-1 block w-full rounded-lg border border-border/60 px-2 py-1.5 text-left hover:bg-muted"
          >
            <span className="block truncate text-[11px] font-semibold">
              {peer.displayName || peer.email}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {message.body || message.attachmentName}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GroupList({
  groups,
  onSelect,
  onCreate,
}: {
  groups: Group[];
  onSelect: (group: Group) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onCreate}
        className="mb-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 text-xs font-semibold text-primary"
      >
        <Plus className="size-4" />
        Novo grupo
      </button>
      {groups.length ? (
        groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelect(group)}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-transparent px-2 text-left transition hover:border-border hover:bg-muted"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <Users className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">
                {group.name}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {group.members.length} participantes
                {group.lastMessage?.body ? ` · ${group.lastMessage.body}` : ""}
              </span>
            </span>
            {group.unread > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {group.unread}
              </span>
            )}
          </button>
        ))
      ) : (
        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Nenhum grupo ainda.
        </p>
      )}
    </div>
  );
}

function CallHistoryList({ calls }: { calls: CallLog[] }) {
  if (!calls.length)
    return (
      <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
        O histórico aparecerá depois da primeira chamada.
      </p>
    );
  return (
    <div className="space-y-1.5">
      {calls.map((call) => (
        <div
          key={call.id}
          className="flex min-h-12 items-center gap-2.5 rounded-xl border border-border/70 px-2"
        >
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full ${call.status === "missed" || call.status === "failed" ? "bg-rose-400/10 text-rose-300" : "bg-emerald-400/10 text-emerald-300"}`}
          >
            <History className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">
              {call.peerNames}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {call.direction === "incoming" ? "Recebida" : "Realizada"} ·{" "}
              {call.kind === "group" ? "grupo" : "individual"} ·{" "}
              {call.durationSeconds
                ? formatDuration(call.durationSeconds)
                : statusCallLabel(call.status)}
            </span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(call.startedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CreateGroupDialog({
  open,
  colleagues,
  onClose,
  onCreated,
}: {
  open: boolean;
  colleagues: Colleague[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    if (!user || !name.trim() || !members.length) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/chat-groups", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, members }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Falha ao criar grupo.");
      setName("");
      setMembers([]);
      onCreated();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao criar grupo.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo grupo</DialogTitle>
          <DialogDescription>
            Crie uma conversa permanente e escolha os participantes.
          </DialogDescription>
        </DialogHeader>
        <label className="text-xs font-semibold">
          Nome do grupo
          <input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          />
        </label>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {colleagues.map((colleague) => (
            <label
              key={colleague.email}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3"
            >
              <input
                type="checkbox"
                checked={members.includes(colleague.email)}
                onChange={() =>
                  setMembers((items) =>
                    items.includes(colleague.email)
                      ? items.filter((item) => item !== colleague.email)
                      : [...items, colleague.email],
                  )
                }
              />
              <span
                className={`size-2.5 rounded-full ${statusColors[colleague.status]}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {colleague.displayName || colleague.email}
              </span>
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={saving || !name.trim() || !members.length}
          onClick={() => void create()}
          className="min-h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Criando..." : "Criar grupo"}
        </button>
      </DialogContent>
    </Dialog>
  );
}

function GroupChatDialog({
  group,
  colleagues,
  tickets,
  onClose,
  onOpenTicket,
  onUpdated,
}: {
  group: Group | null;
  colleagues: Colleague[];
  tickets: ChatTicket[];
  onClose: () => void;
  onOpenTicket?: (ticketId: string) => void;
  onUpdated: () => void;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [attachment, setAttachment] = useState<{
    name: string;
    type: string;
    data: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    if (!user || !group) return;
    try {
      const response = await fetch(`/api/chat-groups/${group.id}/messages`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        messages?: GroupMessage[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setMessages((current) => stableArray(current, payload.messages ?? []));
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Falha ao carregar grupo.",
      );
    }
  }, [group, user]);
  useEffect(() => {
    if (!group) {
      setMessages([]);
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(), 3_000);
    return () => window.clearInterval(timer);
  }, [group, load]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [messages]);
  function choose(file?: File) {
    if (!file) return;
    if (
      !(
        file.type.startsWith("image/") ||
        file.type.startsWith("audio/") ||
        file.type === "application/pdf"
      ) ||
      file.size > 700_000
    ) {
      setError("Envie imagem, áudio ou PDF de até 700 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setAttachment({
        name: file.name,
        type: file.type,
        data: String(reader.result),
      });
    reader.readAsDataURL(file);
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !group || (!draft.trim() && !ticketId && !attachment)) return;
    try {
      const response = await fetch(`/api/chat-groups/${group.id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: draft, ticketId, attachment }),
      });
      const payload = (await response.json()) as {
        message?: GroupMessage;
        error?: string;
      };
      if (!response.ok || !payload.message) throw new Error(payload.error);
      setMessages((items) => [...items, payload.message!]);
      setDraft("");
      setTicketId("");
      setAttachment(null);
      setError("");
      onUpdated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao enviar.");
    }
  }
  const owner = group?.createdBy.toLowerCase() === user?.email?.toLowerCase();
  return (
    <>
      <Dialog
        open={Boolean(group)}
        onOpenChange={(value) => {
          if (!value) onClose();
        }}
      >
        <DialogContent className="grid h-[min(640px,90vh)] grid-rows-[auto_1fr_auto] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-border p-4 pr-14">
            <DialogTitle>{group?.name}</DialogTitle>
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Users className="size-3.5" />
              {group?.members.length} participantes
            </button>
          </DialogHeader>
          <div className="chat-thread min-h-0 overflow-y-auto p-4">
            {messages.length ? (
              <div>
                {messages.map((message, index) => {
                  const mine =
                    message.senderEmail.toLowerCase() ===
                    user?.email?.toLowerCase();
                  const sender = colleagues.find(
                    (item) => item.email === message.senderEmail,
                  );
                  const selectedTicket = tickets.find(
                    (item) => item.id === message.ticketId,
                  );
                  const runStart = sameSender(messages[index - 1], message);
                  const runContinues = sameSender(messages[index + 1], message);
                  const jumbo =
                    !!message.body &&
                    !message.ticketId &&
                    !message.attachmentData &&
                    EMOJI_ONLY.test(message.body.trim());
                  return (
                    <div
                      key={message.id}
                      className={`flex ${runStart ? "mt-0.5" : "mt-2"} ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={bubbleClass(mine, runStart, runContinues, jumbo)}
                      >
                        {!mine && !runStart && (
                          <p className="mb-1 text-[10px] font-bold text-primary">
                            {sender?.displayName ||
                              message.senderEmail.split("@")[0]}
                          </p>
                        )}
                        {message.body && (
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {message.body}
                          </p>
                        )}
                        {message.ticketId && (
                          <TicketShareCard
                            ticketId={message.ticketId}
                            label={
                              selectedTicket
                                ? `${selectedTicket.title} · ${selectedTicket.store}`
                                : "Abrir detalhes do chamado"
                            }
                            mine={mine}
                            onOpen={() => {
                              onClose();
                              onOpenTicket?.(message.ticketId!);
                            }}
                          />
                        )}
                        <MessageAttachment message={message} mine={mine} />
                      </div>
                    </div>
                  );
                })}
                <ChatReceipt messages={messages} userEmail={user?.email} />
                <div ref={bottomRef} />
              </div>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Comece a conversa do grupo.
              </div>
            )}
            {error && (
              <p role="alert" className="mt-2 text-xs text-rose-300">
                {error}
              </p>
            )}
          </div>
          <form onSubmit={send} className="border-t border-border bg-card p-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Mensagem para o grupo..."
                className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
              />
              <label className="grid size-11 cursor-pointer place-items-center rounded-xl border border-input">
                <Paperclip className="size-4" />
                <span className="sr-only">Anexar arquivo</span>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*,audio/*,.pdf"
                  onChange={(event) => {
                    choose(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                type="submit"
                className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </button>
            </div>
            <select
              value={ticketId}
              onChange={(event) => setTicketId(event.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"
            >
              <option value="">Anexar chamado...</option>
              {tickets.slice(0, 100).map((ticket) => (
                <option key={ticket.id} value={ticket.id}>
                  {ticket.id} · {ticket.store}
                </option>
              ))}
            </select>
            {attachment && (
              <AttachmentPreview
                attachment={attachment}
                onRemove={() => setAttachment(null)}
              />
            )}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Participantes</DialogTitle>
            <DialogDescription>
              {owner
                ? "Você administra este grupo."
                : "Somente o responsável pode alterar participantes."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {group?.members.map((member) => {
              const colleague = colleagues.find(
                (item) => item.email === member.email,
              );
              return (
                <div
                  key={member.email}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {colleague?.displayName || member.email}
                    {member.memberRole === "owner" ? " · responsável" : ""}
                  </span>
                  {owner && member.memberRole !== "owner" && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user || !group) return;
                        await fetch(
                          `/api/chat-groups/${group.id}/members?email=${encodeURIComponent(member.email)}`,
                          {
                            method: "DELETE",
                            headers: {
                              Authorization: `Bearer ${await user.getIdToken()}`,
                            },
                          },
                        );
                        onUpdated();
                      }}
                      className="text-xs text-rose-300"
                    >
                      Remover
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {owner && (
            <select
              defaultValue=""
              onChange={async (event) => {
                const email = event.target.value;
                if (!email || !user || !group) return;
                await fetch(`/api/chat-groups/${group.id}/members`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${await user.getIdToken()}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ email }),
                });
                event.currentTarget.value = "";
                onUpdated();
              }}
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">Adicionar colega...</option>
              {colleagues
                .filter(
                  (item) =>
                    !group?.members.some(
                      (member) => member.email === item.email,
                    ),
                )
                .map((item) => (
                  <option key={item.email} value={item.email}>
                    {item.displayName || item.email}
                  </option>
                ))}
            </select>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function UserMenu() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("Online");
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [feedback, setFeedback] = useState("");
  const statusRef = useRef<Status>("Online");
  const manualStatusRef = useRef(false);
  const lastActivityRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const syncPresence = useCallback(
    async (
      changes: Partial<{
        status: Status;
        manualStatus: boolean;
        displayName: string;
        phone: string;
        photoUrl: string | null;
      }> = {},
    ) => {
      if (!user) return;
      const response = await fetch("/api/colleagues", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, ...changes }),
      });
      if (!response.ok)
        throw new Error("Não foi possível sincronizar seu perfil.");
      window.dispatchEvent(new Event("caju-presence-updated"));
    },
    [status, user],
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const localStatus =
        (localStorage.getItem("caju-status") as Status) || "Online";
      const manual = localStorage.getItem("caju-status-manual") === "1";
      setStatus(localStatus);
      manualStatusRef.current = manual;
      try {
        const response = await fetch("/api/colleagues", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as { colleagues?: Colleague[] };
        const profile = payload.colleagues?.find(
          (item) => item.email.toLowerCase() === user.email?.toLowerCase(),
        );
        if (active && profile) {
          setName(profile.displayName || "");
          setPhone(profile.phone || "");
          setPhoto(profile.photoUrl);
        }
      } finally {
        if (active)
          void syncPresence({ status: localStatus, manualStatus: manual });
      }
    })();
    const timer = window.setInterval(() => void syncPresence(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [syncPresence, user]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  async function updateStatus(value: Status) {
    const manual = value !== "Online";
    manualStatusRef.current = manual;
    setStatus(value);
    localStorage.setItem("caju-status", value);
    localStorage.setItem("caju-status-manual", manual ? "1" : "0");
    setFeedback(`Status alterado para ${value}.`);
    try {
      await syncPresence({ status: value, manualStatus: manual });
    } catch (reason) {
      setFeedback(
        reason instanceof Error
          ? reason.message
          : "Falha ao atualizar o status.",
      );
    }
  }
  useEffect(() => {
    const markActive = () => {
      if (!user) return;
      lastActivityRef.current = Date.now();
      if (idleTimerRef.current !== null)
        window.clearTimeout(idleTimerRef.current);
      if (!manualStatusRef.current && statusRef.current !== "Online") {
        statusRef.current = "Online";
        setStatus("Online");
        void syncPresence({ status: "Online", manualStatus: false });
      }
      idleTimerRef.current = window.setTimeout(
        () => {
          if (
            !manualStatusRef.current &&
            document.visibilityState !== "visible"
          ) {
            statusRef.current = "Ausente";
            setStatus("Ausente");
            void syncPresence({ status: "Ausente", manualStatus: false });
          }
        },
        5 * 60 * 1000,
      );
    };
    const visible = () => {
      if (document.visibilityState === "visible") markActive();
    };
    window.addEventListener("pointerdown", markActive, { capture: true });
    window.addEventListener("keydown", markActive, { capture: true });
    window.addEventListener("focus", markActive);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("pointerdown", markActive, { capture: true });
      window.removeEventListener("keydown", markActive, { capture: true });
      window.removeEventListener("focus", markActive);
      document.removeEventListener("visibilitychange", visible);
      if (idleTimerRef.current !== null)
        window.clearTimeout(idleTimerRef.current);
    };
  }, [syncPresence, user]);
  const label = name || user?.email?.slice(0, 2).toUpperCase() || "US";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" aria-label="Minha conta e disponibilidade" className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card/50 p-2 text-left hover:bg-muted" />}>
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 text-xs font-bold text-emerald-200">
          {photo ? <img src={photo} alt="" className="size-full object-cover" /> : label.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{name || user?.email}</span>
          <span className="block truncate text-xs text-muted-foreground">{role ? roleLabels[role] : "Sem perfil"} · <span className="text-emerald-300">{status}</span></span>
        </span>
        <ChevronUp aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? "" : "rotate-180"}`} />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="max-h-[min(30rem,calc(100dvh-7rem))] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meu status</p>
        <div className="mt-2 grid gap-1">
          {statuses.map((item) => <button key={item} type="button" aria-pressed={status === item} onClick={() => void updateStatus(item)} className={`flex min-h-11 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${status === item ? "border-primary/50 bg-primary/15 font-semibold text-foreground" : "border-transparent hover:bg-muted"}`}>{item}{status === item && <Check aria-hidden="true" className="size-4 text-primary" />}</button>)}
        </div>
        <a href="/?view=settings" onClick={() => setOpen(false)} className="mt-3 flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">Editar perfil em Configurações</a>
        {feedback && <p role="status" className="mt-2 text-xs text-muted-foreground">{feedback}</p>}
        <button type="button" onClick={() => void signOut(auth)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-destructive/20 text-sm text-destructive hover:bg-destructive/10"><LogOut aria-hidden="true" className="size-4" />Sair da conta</button>
      </PopoverContent>
    </Popover>
  );
}

export function ProfileSettings() {
  const { user } = useAuth();
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    void user
      .getIdToken()
      .then(async (token) => {
        const response = await fetch("/api/colleagues", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as { colleagues?: Colleague[] };
        const profile = payload.colleagues?.find(
          (item) => item.email.toLowerCase() === user.email?.toLowerCase(),
        );
        if (active && profile) {
          setName(profile.displayName || "");
          setPhone(profile.phone || "");
          setPhoto(profile.photoUrl);
        }
      })
      .catch(() => {
        if (active) setMessage("Não foi possível carregar perfil.");
      });
    return () => {
      active = false;
    };
  }, [user]);
  function choosePhoto(file?: File) {
    if (!file) return;
    if (file.size > 650_000) {
      setMessage("Escolha uma imagem de até 650 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }
  async function save() {
    if (!user) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/colleagues", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: name, phone, photoUrl: photo }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Falha ao salvar perfil.");
      window.dispatchEvent(new Event("caju-presence-updated"));
      setMessage("Perfil atualizado.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao salvar perfil.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <section className="surface-panel rounded-2xl p-5">
        <h2 className="font-semibold">Meu perfil</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Foto, nome e telefone visíveis para colegas.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="grid size-16 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
            {photo ? (
              <img
                src={photo}
                alt="Foto do perfil"
                className="size-full object-cover"
              />
            ) : (
              initials(name || user?.email || "US")
            )}
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-primary">
            <Camera className="size-4" />
            Alterar foto
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => choosePhoto(event.target.files?.[0])}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3">
          <label
            className="text-xs font-semibold text-muted-foreground"
            htmlFor="settings-profile-name"
          >
            Nome de exibição
            <input
              id="settings-profile-name"
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label
            className="text-xs font-semibold text-muted-foreground"
            htmlFor="settings-profile-phone"
          >
            Telefone
            <input
              id="settings-profile-phone"
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar perfil"}
          </button>
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
        </div>
      </section>
      <CommunicationSettings />
    </>
  );
}

function CommunicationSettings() {
  const { user } = useAuth();
  const [preferences, setPreferences] =
    useState<CommunicationPreferences>(defaultPreferences);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const response = await fetch("/api/communication-preferences", {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        preferences?: CommunicationPreferences;
      };
      if (active && payload.preferences) setPreferences(payload.preferences);
    })();
    return () => {
      active = false;
    };
  }, [user]);
  async function save() {
    if (!user) return;
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/communication-preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error();
      setFeedback("Preferências salvas.");
      window.dispatchEvent(new Event("caju-collaboration-updated"));
    } catch {
      setFeedback("Não foi possível salvar as preferências.");
    } finally {
      setSaving(false);
    }
  }
  const choices: Array<
    [
      keyof Pick<
        CommunicationPreferences,
        | "desktopMessages"
        | "desktopCalls"
        | "soundMessages"
        | "soundCalls"
        | "quietHoursEnabled"
      >,
      string,
    ]
  > = [
    ["desktopMessages", "Notificações de mensagens na área de trabalho"],
    ["desktopCalls", "Notificações de chamadas na área de trabalho"],
    ["soundMessages", "Som ao enviar e receber mensagens"],
    ["soundCalls", "Toque de chamada"],
    ["quietHoursEnabled", "Horário silencioso"],
  ];
  return (
    <section className="surface-panel rounded-2xl p-5">
      <h2 className="font-semibold">Comunicação e notificações</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha como o Caju OS avisa você.
      </p>
      <div className="mt-4 space-y-2">
        {choices.map(([key, label]) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm"
          >
            <input
              type="checkbox"
              checked={preferences[key]}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
              className="size-4 accent-primary"
            />
            <span className="flex-1">{label}</span>
          </label>
        ))}
      </div>
      {preferences.quietHoursEnabled && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Início
            <input
              type="time"
              value={preferences.quietHoursStart}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  quietHoursStart: event.target.value,
                }))
              }
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Fim
            <input
              type="time"
              value={preferences.quietHoursEnd}
              onChange={(event) =>
                setPreferences((current) => ({
                  ...current,
                  quietHoursEnd: event.target.value,
                }))
              }
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            />
          </label>
        </div>
      )}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-4 min-h-11 w-full rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Salvar notificações"}
      </button>
      {feedback && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {feedback}
        </p>
      )}
    </section>
  );
}

// Um unico recibo no fim da conversa, como no iOS, em vez de horario e ticks
// repetidos em cada bolha.
function ChatReceipt({
  messages,
  userEmail,
}: {
  messages: {
    senderEmail: string;
    createdAt: string | number;
    readAt?: string | number | null;
    deliveredAt?: string | number | null;
  }[];
  userEmail?: string | null;
}) {
  const last = messages[messages.length - 1];
  if (!last) return null;
  const mine = last.senderEmail.toLowerCase() === userEmail?.toLowerCase();
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(last.createdAt));
  const state = !mine
    ? time
    : last.readAt
      ? `Lida ${time}`
      : last.deliveredAt
        ? `Entregue ${time}`
        : `Enviada ${time}`;
  return (
    <p
      className={`mt-1 px-1 text-[11px] font-semibold tracking-wide text-muted-foreground ${mine ? "text-right" : "text-left"}`}
    >
      {state}
    </p>
  );
}

function TicketShareCard({
  ticketId,
  label,
  mine,
  onOpen,
}: {
  ticketId: string;
  label: string;
  mine: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`mt-2 flex w-full min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mine ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-primary/30 bg-primary/10 hover:bg-primary/20"}`}
      aria-label={`Abrir chamado ${ticketId}`}
    >
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-lg ${mine ? "bg-white/15 text-white" : "bg-primary/15 text-primary"}`}
      >
        <ClipboardList className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[.08em] opacity-75">
          Chamado compartilhado
        </span>
        <span className="mt-0.5 block text-xs font-bold">{ticketId}</span>
        <span
          className={`mt-0.5 block break-words text-[11px] leading-snug [overflow-wrap:anywhere] ${mine ? "text-white/75" : "text-muted-foreground"}`}
        >
          {label || "Abrir detalhes do chamado"}
        </span>
      </span>
      <ExternalLink
        className={`mt-1 size-3.5 shrink-0 ${mine ? "text-white/80" : "text-primary"}`}
        aria-hidden="true"
      />
    </button>
  );
}

function initials(value: string) {
  return (
    value
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "US"
  );
}

function stableArray<T>(current: T[], next: T[]) {
  if (current.length !== next.length) return next;
  for (let index = 0; index < current.length; index += 1) {
    if (JSON.stringify(current[index]) !== JSON.stringify(next[index]))
      return next;
  }
  return current;
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function qualityLabel(value: "excellent" | "good" | "poor" | "reconnecting") {
  return value === "excellent"
    ? "conexão excelente"
    : value === "good"
      ? "conexão boa"
      : value === "poor"
        ? "conexão instável"
        : "reconectando";
}
function statusCallLabel(value: CallLog["status"]) {
  return value === "missed"
    ? "não atendida"
    : value === "declined"
      ? "recusada"
      : value === "failed"
        ? "falhou"
        : "concluída";
}
function relativeTime(value: string) {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - Date.parse(value)) / 1000),
  );
  if (seconds < 60) return "agora";
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function ScreenPreview({ stream, label }: { stream: MediaStream; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  async function toggleFullscreen() {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (video.requestFullscreen) {
        await video.requestFullscreen();
      } else {
        const mobileVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
        mobileVideo.webkitEnterFullscreen?.();
      }
    } catch {
      // Some mobile browsers only allow their native video fullscreen method.
      const mobileVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
      mobileVideo.webkitEnterFullscreen?.();
    }
  }
  return (
    <div className="relative mt-2 overflow-hidden rounded-xl border border-border bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onLoadedMetadata={(event) => void event.currentTarget.play().catch(() => undefined)}
        onCanPlay={(event) => void event.currentTarget.play().catch(() => undefined)}
        className="aspect-video w-full object-contain"
        aria-label={label}
      />
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="absolute right-2 top-2 grid size-11 place-items-center rounded-xl border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={fullscreen ? "Sair da tela cheia" : "Abrir tela compartilhada em tela cheia"}
      >
        <Maximize2 className="size-4" aria-hidden="true" />
      </button>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">{label} · Toque para ampliar</p>
    </div>
  );
}

function parseTicketMessage(body: string, tickets: ChatTicket[]) {
  const lines = body.split("\n");
  const index = lines.findIndex((line) =>
    /^Chamado\s+[A-Z0-9-]+\s*:/i.test(line.trim()),
  );
  if (index < 0)
    return { text: body, ticketId: null as string | null, ticketLabel: "" };
  const match = lines[index]
    .trim()
    .match(/^Chamado\s+([A-Z0-9-]+)\s*:\s*(.*)$/i);
  if (!match)
    return { text: body, ticketId: null as string | null, ticketLabel: "" };
  const ticketId = match[1].toUpperCase();
  const ticket = tickets.find((item) => item.id.toUpperCase() === ticketId);
  const ticketLabel = ticket ? `${ticket.title} · ${ticket.store}` : match[2];
  return {
    text: lines
      .filter((_, lineIndex) => lineIndex !== index)
      .join("\n")
      .trim(),
    ticketId,
    ticketLabel,
  };
}
