'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronUp, ClipboardList, ExternalLink, File, FileAudio, Loader2, LogOut, MessageCircle, Mic, MicOff, Paperclip, Phone, PhoneIncoming, PhoneOff, Send, Square, Users, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/auth-provider';
import { roleLabels } from '@/lib/permissions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { directVoiceRoom, type VoiceInvitation, VoiceCallReceiver, VoiceChatClient } from '@/lib/voice-chat';

export const statuses = ['Online', 'Ocupado', 'Almoçando', 'Pausa de 15 minutos', 'Offline'] as const;
export type Status = typeof statuses[number];
type Colleague = { email: string; role: 'gerencia' | 'n1' | 'analista'; displayName: string | null; phone: string | null; photoUrl: string | null; status: Status; updatedAt: string | null };
type Message = { id: number; senderEmail: string; recipientEmail: string; body: string; attachmentName?: string | null; attachmentType?: string | null; attachmentData?: string | null; createdAt: string; readAt: string | null };
type ChatTicket = { id: string; title: string; store: string; city: string };
type NewMessageNotice = { message: Message; count: number };
let desktopPermissionRequested = false;

function appIsInBackground() {
  return document.hidden || !document.hasFocus();
}

async function showDesktopMessageNotification(senderName: string, message: Message) {
  if (!appIsInBackground()) return;
  const body = message.body || message.attachmentName || 'Novo anexo';
  const title = `Nova mensagem de ${senderName}`;
  try {
    // Tauri uses Windows native toast notifications. The dynamic import keeps
    // the web edition free of desktop-only code.
    if ('__TAURI_INTERNALS__' in window) {
      const notification = await import('@tauri-apps/plugin-notification');
      let allowed = await notification.isPermissionGranted();
      if (!allowed && !desktopPermissionRequested) {
        desktopPermissionRequested = true;
        allowed = (await notification.requestPermission()) === 'granted';
      }
      if (allowed) notification.sendNotification({ title, body, group: 'caju-messages', autoCancel: true });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, tag: `caju-message-${message.id}` });
  } catch { /* Desktop notifications are optional; in-app feedback remains available. */ }
}

async function showDesktopCallNotification(callerName: string, invitation: VoiceInvitation) {
  if (!appIsInBackground()) return;
  const group = invitation.kind === 'group';
  const title = group ? 'Convite para reunião de voz' : 'Chamada de voz recebida';
  const body = `${callerName} está chamando você. Abra o Caju OS para atender ou recusar.`;
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const notification = await import('@tauri-apps/plugin-notification');
      const { invoke } = await import('@tauri-apps/api/core');
      let allowed = await notification.isPermissionGranted();
      if (!allowed && !desktopPermissionRequested) { desktopPermissionRequested = true; allowed = (await notification.requestPermission()) === 'granted'; }
      if (allowed) notification.sendNotification({ title, body, group: 'caju-voice', autoCancel: true });
      const callUrl = new URL(window.location.origin);
      callUrl.searchParams.set('voiceRoom', invitation.roomId); callUrl.searchParams.set('voiceCaller', invitation.callerName);
      callUrl.searchParams.set('voiceKind', invitation.kind); callUrl.searchParams.set('voiceCallerEmail', invitation.callerEmail);
      await invoke('show_voice_call_window', { url: callUrl.toString() });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      const desktopNotification = new Notification(title, { body, tag: 'caju-voice-call', requireInteraction: true });
      desktopNotification.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent('caju-voice-answer-request')); };
    }
  } catch { /* O convite também fica visível dentro do Caju OS. */ }
}

const statusColors: Record<Status, string> = {
  Online: 'bg-emerald-400', Ocupado: 'bg-rose-400', Almoçando: 'bg-amber-400',
  'Pausa de 15 minutos': 'bg-sky-400', Offline: 'bg-slate-500',
};
const statusTextColors: Record<Status, string> = {
  Online: 'text-emerald-300', Ocupado: 'text-rose-300', Almoçando: 'text-amber-300',
  'Pausa de 15 minutos': 'text-sky-300', Offline: 'text-slate-400',
};

export function ColleaguesPanel({ tickets = [], ticketToShare = null, onTicketShareConsumed, onOpenTicket }: { tickets?: ChatTicket[]; ticketToShare?: ChatTicket | null; onTicketShareConsumed?: () => void; onOpenTicket?: (ticketId: string) => void }) {
  const { user } = useAuth();
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [selected, setSelected] = useState<Colleague | null>(null);
  const [chatTicket, setChatTicket] = useState<ChatTicket | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [colleaguesOpen, setColleaguesOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<NewMessageNotice | null>(null);
  const [messageDot, setMessageDot] = useState(false);
  const [incomingVoice, setIncomingVoice] = useState<VoiceInvitation | null>(null);
  const latestIncomingId = useRef<number | null>(null);
  const colleaguesRef = useRef<Colleague[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sentDotTimerRef = useRef<number | null>(null);
  const callToneTimerRef = useRef<number | null>(null);
  const voiceReceiverRef = useRef<VoiceCallReceiver | null>(null);
  const prepareNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === 'suspended') void audioContextRef.current.resume();
    } catch { /* O indicador visual continua disponível quando o áudio não for suportado. */ }
  }, []);
  const playNotificationSound = useCallback((received: boolean) => {
    const context = audioContextRef.current;
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(received ? 740 : 560, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (received ? 0.18 : 0.11));
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + (received ? 0.2 : 0.13));
  }, []);
  const stopCallTone = useCallback(() => {
    if (callToneTimerRef.current !== null) window.clearInterval(callToneTimerRef.current);
    callToneTimerRef.current = null;
  }, []);
  const startCallTone = useCallback(() => {
    stopCallTone(); prepareNotificationSound();
    const ring = () => {
      const context = audioContextRef.current;
      if (!context || context.state !== 'running') return;
      [0, 0.2].forEach((offset) => {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(460, context.currentTime + offset);
        gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.16);
        oscillator.connect(gain).connect(context.destination); oscillator.start(context.currentTime + offset); oscillator.stop(context.currentTime + offset + 0.18);
      });
    };
    ring(); callToneTimerRef.current = window.setInterval(ring, 1_600);
  }, [prepareNotificationSound, stopCallTone]);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/colleagues', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as { colleagues?: Colleague[] };
      if (response.ok) setColleagues((payload.colleagues ?? []).filter((item) => item.email.toLowerCase() !== user.email?.toLowerCase()));
    } finally { setLoading(false); }
  }, [user]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 7_500);
    const refresh = () => void load();
    window.addEventListener('caju-presence-updated', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('caju-presence-updated', refresh); };
  }, [load]);
  useEffect(() => { colleaguesRef.current = colleagues; }, [colleagues]);
  useEffect(() => {
    const unlock = () => prepareNotificationSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [prepareNotificationSound]);
  useEffect(() => {
    if (!user?.email) return;
    const receiver = new VoiceCallReceiver(user.email, (invitation) => {
      setIncomingVoice(invitation); startCallTone();
      void showDesktopCallNotification(invitation.callerName, invitation);
    });
    voiceReceiverRef.current = receiver; receiver.connect();
    return () => { receiver.dispose(); if (voiceReceiverRef.current === receiver) voiceReceiverRef.current = null; stopCallTone(); };
  }, [startCallTone, stopCallTone, user?.email]);
  useEffect(() => {
    const handleExternalAnswer = (event: StorageEvent) => {
      if (event.key !== 'caju-voice-popup-answer' || !event.newValue || !incomingVoice) return;
      try { if ((JSON.parse(event.newValue) as { roomId?: string }).roomId === incomingVoice.roomId) { stopCallTone(); setIncomingVoice(null); } } catch { /* Ignore malformed storage events. */ }
    };
    window.addEventListener('storage', handleExternalAnswer);
    return () => window.removeEventListener('storage', handleExternalAnswer);
  }, [incomingVoice, stopCallTone]);
  useEffect(() => {
    const answerFromBrowserNotification = () => window.dispatchEvent(new CustomEvent('caju-voice-answer-request-in-dialog'));
    window.addEventListener('caju-voice-answer-request', answerFromBrowserNotification);
    return () => window.removeEventListener('caju-voice-answer-request', answerFromBrowserNotification);
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
          const baselineResponse = await fetch('/api/messages?latestIncoming=1', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
          const baseline = await baselineResponse.json() as { latestMessageId?: number };
          if (active && baselineResponse.ok) latestIncomingId.current = baseline.latestMessageId ?? 0;
          return;
        }
        const response = await fetch(`/api/messages?incomingAfter=${latestIncomingId.current}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const payload = await response.json() as { messages?: Message[]; latestMessageId?: number };
        if (!active || !response.ok) return;
        latestIncomingId.current = payload.latestMessageId ?? latestIncomingId.current;
        const incoming = payload.messages ?? [];
        if (!incoming.length) return;
        const newest = incoming[incoming.length - 1];
        setNotice({ message: newest, count: incoming.length }); setMessageDot(true); playNotificationSound(true);
        if (dismissTimer) window.clearTimeout(dismissTimer);
        dismissTimer = window.setTimeout(() => setNotice(null), 6_000);
        const sender = colleaguesRef.current.find((item) => item.email.toLowerCase() === newest.senderEmail.toLowerCase());
        void showDesktopMessageNotification(sender?.displayName || newest.senderEmail.split('@')[0], newest);
      } catch { /* A próxima atualização tenta novamente sem interromper o painel. */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => { active = false; window.clearInterval(timer); if (dismissTimer) window.clearTimeout(dismissTimer); };
  }, [playNotificationSound, user]);
  useEffect(() => { if (ticketToShare) setShareOpen(true); }, [ticketToShare]);
  const openChat = (colleague: Colleague) => { setChatTicket(null); setSelected(colleague); setMobileOpen(false); setColleaguesOpen(false); };
  const chooseShareRecipient = (colleague: Colleague) => {
    if (!ticketToShare) return;
    setChatTicket(ticketToShare); setSelected(colleague); setShareOpen(false); setMobileOpen(false); setColleaguesOpen(false); onTicketShareConsumed?.();
  };
  const list = <ColleagueList colleagues={colleagues} loading={loading} onSelect={openChat} />;
  const shareList = <ColleagueList colleagues={colleagues} loading={loading} onSelect={chooseShareRecipient} />;
  const noticeSender = notice ? colleagues.find((item) => item.email.toLowerCase() === notice.message.senderEmail.toLowerCase()) : null;
  function indicateSentMessage() {
    prepareNotificationSound(); playNotificationSound(false); setMessageDot(true);
    if (sentDotTimerRef.current !== null) window.clearTimeout(sentDotTimerRef.current);
    sentDotTimerRef.current = window.setTimeout(() => setMessageDot(false), 3_500);
  }
  function toggleColleagues() { setColleaguesOpen((open) => { const next = !open; if (next) setMessageDot(false); return next; }); }
  return <>
    <button type="button" onClick={toggleColleagues} aria-label={colleaguesOpen ? 'Fechar colegas' : messageDot ? 'Abrir colegas, nova atividade no chat' : 'Abrir colegas'} aria-expanded={colleaguesOpen} className="fixed bottom-5 right-5 z-40 hidden size-11 place-items-center rounded-xl border border-primary/30 bg-sidebar text-primary shadow-xl transition hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary xl:grid"><Users className="size-5" aria-hidden="true" />{messageDot && <span className="absolute right-1.5 top-1.5 size-2.5 animate-pulse rounded-full border-2 border-sidebar bg-emerald-400" />}</button>
    <aside inert={!colleaguesOpen} className={`colleagues-sidebar fixed inset-y-0 right-0 z-30 hidden w-[228px] flex-col border-l border-sidebar-border bg-sidebar/95 px-3 py-4 shadow-[-18px_0_50px_rgba(0,0,0,.18)] backdrop-blur-xl transition-transform duration-200 motion-reduce:transition-none xl:flex ${colleaguesOpen ? 'translate-x-0' : 'pointer-events-none translate-x-[calc(100%+1.5rem)]'}`} aria-label="Colegas" aria-hidden={!colleaguesOpen}>
      <div className="flex h-10 items-center justify-between px-1"><div><p className="text-sm font-bold">Colegas</p><p className="text-[11px] text-muted-foreground">Equipe e disponibilidade</p></div><button type="button" onClick={toggleColleagues} className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary transition hover:bg-primary/20" aria-label="Fechar colegas"><Users className="size-4" aria-hidden="true" /></button></div>
      <TeamVoiceControl colleagues={colleagues} />
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{list}</div>
    </aside>
    <button type="button" onClick={() => { setMobileOpen(true); setMessageDot(false); }} className="fixed bottom-4 right-4 z-30 grid size-12 place-items-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-2xl xl:hidden" aria-label={messageDot ? 'Abrir colegas, nova atividade no chat' : 'Abrir colegas'}><Users className="size-5" />{messageDot && <span className="absolute right-0.5 top-0.5 size-3 animate-pulse rounded-full border-2 border-background bg-emerald-400" />}</button>
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Colegas</DialogTitle><DialogDescription>Status da equipe em tempo real. Toque em uma foto para conversar.</DialogDescription></DialogHeader><TeamVoiceControl colleagues={colleagues} />{list}</DialogContent></Dialog>
    <Dialog open={shareOpen} onOpenChange={setShareOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle>Enviar chamado por chat</DialogTitle><DialogDescription>{ticketToShare ? `Escolha um colega para receber o chamado ${ticketToShare.id}.` : 'Escolha um colega.'}</DialogDescription></DialogHeader>{shareList}</DialogContent></Dialog>
    <ChatDialog colleague={selected} tickets={tickets} initialTicket={chatTicket} onClose={() => { setSelected(null); setChatTicket(null); }} onOpenTicket={onOpenTicket} onMessageSent={indicateSentMessage} />
    <IncomingVoiceCall invitation={incomingVoice} onAnswered={stopCallTone} onClose={() => { stopCallTone(); setIncomingVoice(null); }} onDecline={(invitation) => { voiceReceiverRef.current?.decline(invitation); stopCallTone(); setIncomingVoice(null); }} />
    {notice && <div aria-live="assertive" className="fixed right-4 top-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] items-start rounded-2xl border border-primary/35 bg-card shadow-2xl ring-1 ring-primary/10">
      <button type="button" onClick={() => { if (noticeSender) openChat(noticeSender); setNotice(null); }} className="flex min-w-0 flex-1 items-start gap-3 rounded-l-2xl p-4 text-left transition hover:bg-muted" aria-label="Abrir nova mensagem">
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">{noticeSender?.photoUrl ? <img src={noticeSender.photoUrl} alt="" className="size-full object-cover" /> : initials(noticeSender?.displayName || notice.message.senderEmail)}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{notice.count > 1 ? `${notice.count} novas mensagens` : 'Nova mensagem'} de {noticeSender?.displayName || notice.message.senderEmail.split('@')[0]}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{notice.message.body || notice.message.attachmentName || 'Novo anexo'}</span></span>
      </button>
      <button type="button" onClick={() => setNotice(null)} className="m-2 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar aviso"><X className="size-4" /></button>
    </div>}
  </>;
}

function ColleagueList({ colleagues, loading, onSelect }: { colleagues: Colleague[]; loading: boolean; onSelect: (colleague: Colleague) => void }) {
  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-border bg-card/40 p-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando equipe...</div>;
  if (!colleagues.length) return <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum outro funcionário ativo.</div>;
  return <div className="space-y-1.5">{colleagues.map((colleague) => {
    const name = colleague.displayName || colleague.email.split('@')[0];
    return <button key={colleague.email} type="button" onClick={() => onSelect(colleague)} className="group flex min-h-12 w-full items-center gap-2.5 rounded-lg border border-transparent px-1.5 py-1.5 text-left transition hover:border-border hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Conversar com ${name}, status ${colleague.status}`}>
      <span className="relative grid size-8 shrink-0 place-items-center overflow-visible rounded-full border border-white/10 bg-muted text-[10px] font-bold text-foreground">{colleague.photoUrl ? <img src={colleague.photoUrl} alt="" className="size-full rounded-full object-cover" /> : initials(name)}<span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-sidebar ${statusColors[colleague.status]}`} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{name}</span><span className="block truncate text-[11px]"><span className="text-muted-foreground">{roleLabels[colleague.role]} · </span><span className={`font-medium ${statusTextColors[colleague.status]}`}>{colleague.status}</span></span></span>
      <MessageCircle className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden="true" />
    </button>;
  })}</div>;
}

function ChatDialog({ colleague, tickets, initialTicket, onClose, onOpenTicket, onMessageSent }: { colleague: Colleague | null; tickets: ChatTicket[]; initialTicket?: ChatTicket | null; onClose: () => void; onOpenTicket?: (ticketId: string) => void; onMessageSent?: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [ticketRef, setTicketRef] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const loadMessages = useCallback(async (quiet = false) => {
    if (!user || !colleague) return;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/messages?with=${encodeURIComponent(colleague.email)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      const payload = await response.json() as { messages?: Message[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Falha ao carregar a conversa.');
      setMessages(payload.messages ?? []); setError('');
    } catch (reason) { if (!quiet) setError(reason instanceof Error ? reason.message : 'Falha ao carregar a conversa.'); }
    finally { if (!quiet) setLoading(false); }
  }, [colleague, user]);
  useEffect(() => {
    if (!colleague) {
      // Clear composer state when the dialog closes so a previous attachment
      // or ticket cannot leak into the next conversation/send attempt.
      setMessages([]); setDraft(''); setTicketRef(''); setAttachment(null); setError(''); setLoading(false);
      return;
    }
    setMessages([]); setDraft(''); setTicketRef(initialTicket?.id ?? ''); setAttachment(null); setError(''); void loadMessages();
    const timer = window.setInterval(() => void loadMessages(true), 5_000);
    return () => window.clearInterval(timer);
  }, [colleague, initialTicket, loadMessages]);
  useEffect(() => {
    // Keep the effect cleanup contract explicit. Some browsers return a value
    // from scrollIntoView; returning it from the effect makes React treat it
    // as a cleanup function and crashes the chat on message updates.
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  useEffect(() => () => {
    if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder?.stream.getTracks().forEach((track) => track.stop());
  }, []);
  function readAttachment(file: File) {
    const valid = file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type === 'application/pdf';
    if (!valid) { setError('Envie uma imagem, áudio ou PDF.'); return; }
    if (file.size > 700_000) { setError('O anexo deve ter até 700 KB para manter o chat rápido.'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') { setAttachment({ name: file.name, type: file.type, data: reader.result }); setError(''); } };
    reader.onerror = () => setError('Não foi possível ler este anexo.');
    reader.readAsDataURL(file);
  }
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('A gravação de áudio não é compatível com este dispositivo.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      let recorder: MediaRecorder;
      try { recorder = new MediaRecorder(stream, { ...(preferredType ? { mimeType: preferredType } : {}), audioBitsPerSecond: 32_000 }); }
      catch { recorder = new MediaRecorder(stream); }
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { setError('A gravação foi interrompida. Tente novamente.'); setRecording(false); stream.getTracks().forEach((track) => track.stop()); };
      recorder.onstop = () => {
        if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null; setRecording(false); stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || preferredType || 'audio/webm' });
        if (!blob.size) return;
        if (blob.size > 700_000) { setError('O áudio ficou muito grande. Grave uma mensagem mais curta.'); return; }
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        readAttachment(new window.File([blob], `audio-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, { type: blob.type }));
      };
      recorderRef.current = recorder; setRecordingSeconds(0); setError(''); setRecording(true); recorder.start(500);
      recordingIntervalRef.current = window.setInterval(() => setRecordingSeconds((seconds) => {
        if (seconds >= 89 && recorder.state !== 'inactive') recorder.stop();
        return seconds + 1;
      }), 1_000);
    } catch { setError('Não foi possível acessar o microfone. Verifique a permissão do aplicativo.'); }
  }
  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }
  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !colleague || (!draft.trim() && !attachment && !ticketRef) || sending) return;
    setSending(true); setError('');
    try {
      const selectedTicket = tickets.find((ticket) => ticket.id === ticketRef);
      const ticketText = selectedTicket ? `Chamado ${selectedTicket.id}: ${selectedTicket.title} (${selectedTicket.store} · ${selectedTicket.city})` : '';
      const messageText = [draft.trim(), ticketText].filter(Boolean).join('\n');
      const response = await fetch('/api/messages', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: colleague.email, body: messageText, attachment }) });
      const payload = await response.json() as { message?: Message; error?: string };
      if (!response.ok || !payload.message) throw new Error(payload.error || 'Falha ao enviar a mensagem.');
      setMessages((current) => [...current, payload.message!]); setDraft(''); setTicketRef(''); setAttachment(null); onMessageSent?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao enviar a mensagem.'); }
    finally { setSending(false); }
  }
  const name = colleague?.displayName || colleague?.email.split('@')[0] || '';
  function openSharedTicket(ticketId: string) { onClose(); onOpenTicket?.(ticketId); }
  return <Dialog open={Boolean(colleague)} onOpenChange={(open) => { if (!open) { stopRecording(); onClose(); } }}><DialogContent className="grid h-[min(620px,88vh)] grid-rows-[auto_1fr_auto] overflow-hidden p-0 sm:max-w-lg">
    <DialogHeader className="border-b border-border p-4 pr-14"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center overflow-hidden rounded-full bg-muted text-xs font-bold">{colleague?.photoUrl ? <img src={colleague.photoUrl} alt="" className="size-full object-cover" /> : initials(name)}</span><div className="min-w-0 flex-1"><DialogTitle>{name}</DialogTitle><DialogDescription className="truncate">{colleague?.status} · {colleague?.email}</DialogDescription></div></div>{colleague && <VoiceCallControl colleague={colleague} />}</DialogHeader>
    <div className="min-h-0 overflow-y-auto bg-black/10 p-4" aria-live="polite">{loading ? <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div> : messages.length ? <div className="space-y-2">{messages.map((message) => { const mine = message.senderEmail.toLowerCase() === user?.email?.toLowerCase(); const parsed = parseTicketMessage(message.body, tickets); return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 ${mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card'}`}>{parsed.text && <p className="whitespace-pre-wrap break-words text-sm">{parsed.text}</p>}{parsed.ticketId && <TicketShareCard ticketId={parsed.ticketId} label={parsed.ticketLabel} mine={mine} onOpen={() => openSharedTicket(parsed.ticketId!)} />}<MessageAttachment message={message} mine={mine} /><p className={`mt-1 text-[10px] ${mine ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</p></div></div>; })}<div ref={bottomRef} /></div> : <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">Envie a primeira mensagem para {name}.</div>}{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}</div>
    <form onSubmit={sendMessage} className="border-t border-border bg-card p-3">{recording && <div role="status" aria-live="polite" className="mb-2 flex min-h-10 items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 text-sm text-rose-200"><span className="size-2 animate-pulse rounded-full bg-rose-400" />Gravando áudio · {formatDuration(recordingSeconds)}<span className="ml-auto text-xs text-rose-200/70">máx. 1:30</span></div>}<div className="flex gap-2"><label htmlFor="chat-message" className="sr-only">Mensagem</label><input id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Escreva uma mensagem..." className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm" /><label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-input bg-background hover:bg-muted" aria-label="Anexar imagem, áudio ou PDF"><Paperclip className="size-4" /><input className="sr-only" type="file" accept="image/*,audio/*,.pdf,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) readAttachment(file); event.currentTarget.value = ''; }} /></label><button type="button" onClick={() => recording ? stopRecording() : void startRecording()} className={`grid size-11 shrink-0 place-items-center rounded-xl border transition ${recording ? 'border-rose-400/50 bg-rose-400/15 text-rose-300' : 'border-input bg-background hover:bg-muted'}`} aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}>{recording ? <Square className="size-4 fill-current" /> : <Mic className="size-4" />}</button><button type="submit" disabled={(!draft.trim() && !attachment && !ticketRef) || sending || recording} className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Enviar mensagem">{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button></div><select aria-label="Enviar chamado" value={ticketRef} onChange={(event) => setTicketRef(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"><option value="">Anexar um chamado da lista...</option>{tickets.slice(0, 100).map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.id} · {ticket.store}</option>)}</select>{attachment && <AttachmentPreview attachment={attachment} onRemove={() => setAttachment(null)} />}{ticketRef && <p className="mt-2 truncate text-xs text-muted-foreground">Chamado selecionado: {ticketRef}</p>}</form>
  </DialogContent></Dialog>;
}

function VoiceCallControl({ colleague }: { colleague: Colleague }) {
  const { user } = useAuth();
  const clientRef = useRef<VoiceChatClient | null>(null);
  const audioRef = useRef(new Map<string, HTMLAudioElement>());
  const [state, setState] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState('');
  const reset = useCallback(() => {
    audioRef.current.forEach((audio) => { audio.pause(); audio.srcObject = null; }); audioRef.current.clear();
    setState('idle'); setMuted(false); setParticipants(0);
  }, []);
  const leave = useCallback(() => { clientRef.current?.leave(); clientRef.current = null; reset(); }, [reset]);
  useEffect(() => leave, [leave, colleague.email]);
  async function join() {
    if (!user?.email || state !== 'idle') return;
    setState('connecting'); setError('');
    const client = new VoiceChatClient({
      onParticipantsChanged: (items) => setParticipants(items.length),
      onRemoteStream: (socketId, stream) => {
        let audio = audioRef.current.get(socketId);
        if (!audio) { audio = new Audio(); audio.autoplay = true; audioRef.current.set(socketId, audio); }
        audio.srcObject = stream; void audio.play().catch(() => undefined);
      },
      onPeerLeft: (socketId) => { const audio = audioRef.current.get(socketId); audio?.pause(); audioRef.current.delete(socketId); },
      onCallEnded: () => { leave(); setError('A chamada foi encerrada pelo colega.'); },
      onCallDeclined: () => { leave(); setError('O colega recusou a chamada.'); },
      onError: (reason) => setError(reason.message),
    });
    clientRef.current = client;
    try {
      await client.join(directVoiceRoom(user.email, colleague.email), user.uid, user.displayName || user.email.split('@')[0], user.email);
      client.invite([colleague.email], 'direct');
      setState('connected');
    } catch (reason) { leave(); setError(reason instanceof Error ? reason.message : 'Falha ao iniciar chamada.'); }
  }
  return <div className="mt-3 rounded-xl border border-primary/25 bg-primary/[.07] p-2.5">
    <div className="flex items-center gap-2">
      {state === 'idle' ? <button type="button" onClick={() => void join()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><Phone className="size-4" aria-hidden="true" />Iniciar chamada de voz</button> : <>
        <div role="status" aria-live="polite" className="min-w-0 flex-1 px-1"><p className="truncate text-xs font-bold text-primary">{state === 'connecting' ? 'Conectando...' : 'Chamada em andamento'}</p><p className="text-[11px] text-muted-foreground">{participants ? `${participants + 1} participantes` : 'Aguardando colega'}</p></div>
        <button type="button" disabled={state !== 'connected'} onClick={() => { const next = !muted; setMuted(next); clientRef.current?.setMuted(next); }} className="grid size-11 place-items-center rounded-lg border border-border bg-background transition hover:bg-muted disabled:opacity-50" aria-label={muted ? 'Ativar microfone' : 'Silenciar microfone'}>{muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}</button>
        <button type="button" onClick={() => { clientRef.current?.endCall(); clientRef.current = null; reset(); }} className="grid size-11 place-items-center rounded-lg bg-rose-500 text-white transition hover:bg-rose-400" aria-label="Encerrar chamada para todos"><PhoneOff className="size-4" /></button>
      </>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
  </div>;
}

function TeamVoiceControl({ colleagues }: { colleagues: Colleague[] }) {
  const { user } = useAuth();
  const clientRef = useRef<VoiceChatClient | null>(null);
  const audioRef = useRef(new Map<string, HTMLAudioElement>());
  const [state, setState] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [pickerMode, setPickerMode] = useState<'start' | 'add'>('start');
  const leave = useCallback(() => {
    clientRef.current?.leave(); clientRef.current = null;
    audioRef.current.forEach((audio) => { audio.pause(); audio.srcObject = null; }); audioRef.current.clear();
    setState('idle'); setMuted(false); setParticipants(0); setInvitedEmails([]); setSelectedEmails([]);
  }, []);
  useEffect(() => leave, [leave]);
  async function join() {
    if (!user?.email || state !== 'idle' || !selectedEmails.length) return;
    setState('connecting'); setError('');
    const client = new VoiceChatClient({
      onParticipantsChanged: (items) => setParticipants(items.length),
      onRemoteStream: (socketId, stream) => {
        let audio = audioRef.current.get(socketId);
        if (!audio) { audio = new Audio(); audio.autoplay = true; audioRef.current.set(socketId, audio); }
        audio.srcObject = stream; void audio.play().catch(() => undefined);
      },
      onPeerLeft: (socketId) => { const audio = audioRef.current.get(socketId); audio?.pause(); audioRef.current.delete(socketId); },
      onError: (reason) => setError(reason.message),
    });
    clientRef.current = client;
    try {
      const roomId = `group:${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      await client.join(roomId, user.uid, user.displayName || user.email.split('@')[0], user.email);
      client.invite(selectedEmails, 'group'); setInvitedEmails(selectedEmails); setSelectedEmails([]); setPickerOpen(false); setState('connected');
    } catch (reason) { leave(); setError(reason instanceof Error ? reason.message : 'Falha ao iniciar reunião.'); }
  }
  function openPicker(mode: 'start' | 'add') { setPickerMode(mode); setSelectedEmails([]); setPickerOpen(true); }
  function inviteMore() {
    if (state !== 'connected' || !selectedEmails.length) return;
    clientRef.current?.invite(selectedEmails, 'group');
    setInvitedEmails((current) => [...new Set([...current, ...selectedEmails])]); setSelectedEmails([]); setPickerOpen(false);
  }
  const inviteLimit = Math.max(0, 5 - invitedEmails.length);
  return <div className="mt-3 rounded-xl border border-primary/25 bg-primary/[.07] p-2.5">
    {state === 'idle' ? <button type="button" onClick={() => openPicker('start')} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><Users className="size-4" aria-hidden="true" />Nova reunião de voz</button> : <div className="flex items-center gap-2">
      <div role="status" aria-live="polite" className="min-w-0 flex-1 px-1"><p className="truncate text-xs font-bold text-primary">{state === 'connecting' ? 'Conectando...' : 'Reunião em andamento'}</p><p className="text-[11px] text-muted-foreground">{participants ? `${participants + 1} participantes` : 'Aguardando colegas'}</p></div>
      <button type="button" disabled={state !== 'connected' || !inviteLimit} onClick={() => openPicker('add')} className="grid size-10 place-items-center rounded-lg border border-border bg-background transition hover:bg-muted disabled:opacity-50" aria-label="Adicionar participantes"><Users className="size-4" /></button>
      <button type="button" disabled={state !== 'connected'} onClick={() => { const next = !muted; setMuted(next); clientRef.current?.setMuted(next); }} className="grid size-10 place-items-center rounded-lg border border-border bg-background transition hover:bg-muted disabled:opacity-50" aria-label={muted ? 'Ativar microfone' : 'Silenciar microfone'}>{muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}</button>
      <button type="button" onClick={leave} className="grid size-10 place-items-center rounded-lg bg-rose-500 text-white transition hover:bg-rose-400" aria-label="Sair da reunião"><PhoneOff className="size-4" /></button>
    </div>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{pickerMode === 'start' ? 'Iniciar reunião de voz' : 'Adicionar participantes'}</DialogTitle><DialogDescription>Selecione até {pickerMode === 'start' ? 5 : inviteLimit} colega{pickerMode === 'start' ? 's' : inviteLimit === 1 ? '' : 's'} para convidar.</DialogDescription></DialogHeader><div className="max-h-72 space-y-1 overflow-y-auto pr-1">{colleagues.filter((colleague) => pickerMode === 'start' || !invitedEmails.includes(colleague.email)).map((colleague) => { const checked = selectedEmails.includes(colleague.email); const name = colleague.displayName || colleague.email.split('@')[0]; return <label key={colleague.email} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 transition hover:bg-muted"><input type="checkbox" checked={checked} onChange={() => setSelectedEmails((current) => checked ? current.filter((email) => email !== colleague.email) : current.length < inviteLimit ? [...current, colleague.email] : current)} className="size-4 accent-primary" /><span className={`size-2.5 rounded-full ${statusColors[colleague.status]}`} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span><span className="text-xs text-muted-foreground">{colleague.status}</span></label>; })}</div><button type="button" disabled={!selectedEmails.length || state === 'connecting'} onClick={() => pickerMode === 'start' ? void join() : inviteMore()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{state === 'connecting' ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}{pickerMode === 'start' ? `Convidar ${selectedEmails.length || ''} colega${selectedEmails.length === 1 ? '' : 's'}` : `Adicionar ${selectedEmails.length || ''} participante${selectedEmails.length === 1 ? '' : 's'}`}</button></DialogContent></Dialog>
  </div>;
}

function IncomingVoiceCall({ invitation, onAnswered, onClose, onDecline }: { invitation: VoiceInvitation | null; onAnswered: () => void; onClose: () => void; onDecline: (invitation: VoiceInvitation) => void }) {
  const { user } = useAuth();
  const clientRef = useRef<VoiceChatClient | null>(null);
  const audioRef = useRef(new Map<string, HTMLAudioElement>());
  const [state, setState] = useState<'ringing' | 'connecting' | 'connected'>('ringing');
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { setState('ringing'); setMuted(false); setParticipants(0); setError(''); }, [invitation?.roomId]);
  const cleanup = useCallback((notify = true) => { if (notify) clientRef.current?.leave(); clientRef.current = null; audioRef.current.forEach((audio) => { audio.pause(); audio.srcObject = null; }); audioRef.current.clear(); setState('ringing'); setMuted(false); setParticipants(0); }, []);
  useEffect(() => () => cleanup(), [cleanup]);
  async function accept() {
    if (!invitation || !user?.email || state !== 'ringing') return;
    setState('connecting'); setError('');
    const client = new VoiceChatClient({
      onParticipantsChanged: (items) => setParticipants(items.length),
      onRemoteStream: (socketId, stream) => { let audio = audioRef.current.get(socketId); if (!audio) { audio = new Audio(); audio.autoplay = true; audioRef.current.set(socketId, audio); } audio.srcObject = stream; void audio.play().catch(() => undefined); },
      onPeerLeft: (socketId) => { const audio = audioRef.current.get(socketId); audio?.pause(); audioRef.current.delete(socketId); },
      onCallEnded: () => { cleanup(false); onClose(); },
      onError: (reason) => setError(reason.message),
    });
    clientRef.current = client;
    try { await client.join(invitation.roomId, user.uid, user.displayName || user.email.split('@')[0], user.email); onAnswered(); setState('connected'); }
    catch (reason) { cleanup(); setError(reason instanceof Error ? reason.message : 'Não foi possível atender a chamada.'); }
  }
  useEffect(() => {
    const answerFromNotification = () => { void accept(); };
    window.addEventListener('caju-voice-answer-request-in-dialog', answerFromNotification);
    return () => window.removeEventListener('caju-voice-answer-request-in-dialog', answerFromNotification);
  });
  function closeActive() { if (invitation?.kind === 'direct') { clientRef.current?.endCall(); cleanup(false); } else cleanup(); onClose(); }
  const caller = invitation?.callerName || 'Colega';
  return <Dialog open={Boolean(invitation)} onOpenChange={(open) => { if (!open && invitation) state === 'ringing' ? onDecline(invitation) : closeActive(); }}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle className="flex items-center gap-2"><PhoneIncoming className="size-5 text-emerald-400" />{state === 'ringing' ? 'Chamada recebida' : 'Chamada de voz'}</DialogTitle><DialogDescription>{state === 'ringing' ? `${caller} convidou você para ${invitation?.kind === 'group' ? 'uma reunião de voz' : 'uma chamada de voz'}.` : invitation?.kind === 'group' ? `${participants + 1} participante(s) na reunião.` : 'Chamada em andamento.'}</DialogDescription></DialogHeader>{state === 'ringing' ? <div className="flex gap-2"><button type="button" onClick={() => invitation && onDecline(invitation)} className="min-h-11 flex-1 rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 text-sm font-semibold text-rose-200">Recusar</button><button type="button" onClick={() => void accept()} className="min-h-11 flex-1 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-white">Atender</button></div> : <div className="flex gap-2"><button type="button" disabled={state !== 'connected'} onClick={() => { const next = !muted; setMuted(next); clientRef.current?.setMuted(next); }} className="min-h-11 flex-1 rounded-xl border border-border bg-background text-sm font-semibold disabled:opacity-50">{muted ? 'Ativar microfone' : 'Silenciar'}</button><button type="button" onClick={closeActive} className="min-h-11 flex-1 rounded-xl bg-rose-500 px-3 text-sm font-semibold text-white">Encerrar</button></div>}{error && <p role="alert" className="text-xs text-rose-300">{error}</p>}</DialogContent></Dialog>;
}

export function DesktopVoiceCallPopup() {
  const { user } = useAuth();
  const receiverRef = useRef<VoiceCallReceiver | null>(null);
  const invitation = typeof window === 'undefined' ? null : (() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('voiceRoom'); const callerName = params.get('voiceCaller'); const callerEmail = params.get('voiceCallerEmail'); const kind = params.get('voiceKind');
    return roomId && callerName && callerEmail && (kind === 'direct' || kind === 'group') ? { roomId, callerName, callerEmail, kind } as VoiceInvitation : null;
  })();
  useEffect(() => {
    if (!invitation || !user?.email) return;
    const receiver = new VoiceCallReceiver(user.email, () => undefined);
    receiverRef.current = receiver; receiver.connect();
    return () => { receiver.dispose(); receiverRef.current = null; };
  }, [invitation?.roomId, user?.email]);
  if (!invitation) return null;
  const closePopup = async () => {
    try {
      if ('__TAURI_INTERNALS__' in window) { const { invoke } = await import('@tauri-apps/api/core'); await invoke('close_voice_call_window'); return; }
    } catch { /* The browser fallback can close its own notification window. */ }
    window.close();
  };
  return <IncomingVoiceCall invitation={invitation} onAnswered={() => { localStorage.setItem('caju-voice-popup-answer', JSON.stringify({ roomId: invitation.roomId, at: Date.now() })); }} onClose={() => void closePopup()} onDecline={(call) => { receiverRef.current?.decline(call); void closePopup(); }} />;
}

function MessageAttachment({ message, mine }: { message: Message; mine: boolean }) {
  if (!message.attachmentData) return null;
  const name = message.attachmentName || 'Anexo';
  const type = message.attachmentType || '';
  if (type.startsWith('image/')) return <a href={message.attachmentData} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-white/15 bg-black/15" aria-label={`Abrir imagem ${name}`}><img src={message.attachmentData} alt={name} className="max-h-72 w-full object-contain" loading="lazy" /><span className={`block truncate px-2 py-1.5 text-[11px] ${mine ? 'text-white/75' : 'text-muted-foreground'}`}>{name}</span></a>;
  if (type.startsWith('audio/')) return <div className="mt-2 min-w-[230px] rounded-xl border border-white/15 bg-black/10 p-2"><div className="mb-1 flex items-center gap-1.5 text-[11px]"><FileAudio className="size-3.5" />Mensagem de áudio</div><audio controls preload="metadata" src={message.attachmentData} className="h-10 w-full" aria-label={name} /></div>;
  return <a href={message.attachmentData} download={name} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-black/10 px-3 text-xs font-semibold underline"><File className="size-4" />{name}</a>;
}

function AttachmentPreview({ attachment, onRemove }: { attachment: { name: string; type: string; data: string }; onRemove: () => void }) {
  return <div className="relative mt-2 overflow-hidden rounded-xl border border-border bg-background/70 p-2 pr-10">{attachment.type.startsWith('image/') ? <div className="flex items-center gap-3"><img src={attachment.data} alt={`Prévia de ${attachment.name}`} className="h-20 w-24 rounded-lg object-cover" /><div className="min-w-0"><p className="text-xs font-bold">Imagem pronta para enviar</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{attachment.name}</p></div></div> : attachment.type.startsWith('audio/') ? <div><p className="mb-1 flex items-center gap-1.5 text-xs font-bold"><FileAudio className="size-4" />Áudio pronto para enviar</p><audio controls preload="metadata" src={attachment.data} className="h-10 w-full" /></div> : <div className="flex min-h-10 items-center gap-2 text-xs"><File className="size-4" /><span className="truncate">{attachment.name}</span></div>}<button type="button" onClick={onRemove} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground" aria-label="Remover anexo"><X className="size-4" /></button></div>;
}

export function UserMenu() {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('Online');
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [feedback, setFeedback] = useState('');
  const statusRef = useRef<Status>('Online');
  const lastActivityRef = useRef(0);
  const offlineDismissUntilRef = useRef(0);
  const syncPresence = useCallback(async (changes: Partial<{ status: Status; displayName: string; phone: string; photoUrl: string | null }> = {}) => {
    if (!user) return;
    const response = await fetch('/api/colleagues', { method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, ...changes }) });
    if (!response.ok) throw new Error('Não foi possível sincronizar seu perfil.');
    window.dispatchEvent(new Event('caju-presence-updated'));
  }, [status, user]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      const localStatus = (localStorage.getItem('caju-status') as Status) || 'Online'; setStatus(localStatus);
      try {
        const response = await fetch('/api/colleagues', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
        const payload = await response.json() as { colleagues?: Colleague[] };
        const profile = payload.colleagues?.find((item) => item.email.toLowerCase() === user.email?.toLowerCase());
        if (active && profile) { setName(profile.displayName || ''); setPhone(profile.phone || ''); setPhoto(profile.photoUrl); }
      } finally { if (active) void syncPresence({ status: localStatus }); }
    })();
    const timer = window.setInterval(() => void syncPresence(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [syncPresence, user]);
  useEffect(() => { statusRef.current = status; }, [status]);
  async function updateStatus(value: Status) {
    if (value === 'Offline') offlineDismissUntilRef.current = Date.now() + 4_000;
    setStatus(value); localStorage.setItem('caju-status', value); setFeedback(`Status alterado para ${value}.`);
    try { await syncPresence({ status: value }); } catch (reason) { setFeedback(reason instanceof Error ? reason.message : 'Falha ao atualizar o status.'); }
  }
  useEffect(() => {
    const markActive = () => {
      if (!user || statusRef.current !== 'Offline' || Date.now() < offlineDismissUntilRef.current || Date.now() - lastActivityRef.current < 5_000) return;
      lastActivityRef.current = Date.now();
      void updateStatus('Online');
    };
    const visible = () => { if (document.visibilityState === 'visible') markActive(); };
    window.addEventListener('pointerdown', markActive, { capture: true });
    window.addEventListener('keydown', markActive, { capture: true });
    window.addEventListener('focus', markActive);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('pointerdown', markActive, { capture: true });
      window.removeEventListener('keydown', markActive, { capture: true });
      window.removeEventListener('focus', markActive);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [user]);
  const label = name || user?.email?.slice(0, 2).toUpperCase() || 'US';
  return <div className="relative mt-2 rounded-xl border border-border/70 bg-card/40 p-2 group-hover/sidebar:p-3" onMouseLeave={() => setOpen(false)}>
    <button type="button" className="flex min-h-10 w-full items-center gap-3 text-left" onClick={() => setOpen((value) => !value)} onFocus={() => setOpen(true)} aria-haspopup="menu" aria-expanded={open}><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 text-xs font-bold text-emerald-200">{photo ? <img src={photo} alt="Foto do perfil" className="size-full object-cover" /> : label.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1 opacity-0 transition-opacity group-hover/sidebar:opacity-100"><p className="truncate text-xs font-semibold">{name || user?.email}</p><p className="truncate text-xs text-muted-foreground">{role ? roleLabels[role] : 'Sem perfil'} · <span className="font-semibold text-emerald-300">{status}</span></p></div><ChevronUp className={`size-4 shrink-0 opacity-0 transition group-hover/sidebar:opacity-100 ${open ? '' : 'rotate-180'}`} /></button>
    {open && <div role="menu" className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 max-h-[calc(100vh-1.5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meu status</p><div className="mt-2 grid gap-1">{statuses.map((item) => <button key={item} type="button" role="menuitem" onClick={() => void updateStatus(item)} className={`flex min-h-11 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${status === item ? 'border-primary/50 bg-primary/15 font-bold text-primary' : 'border-transparent hover:bg-muted'}`}>{item}{status === item && <Check className="size-4 text-primary" />}</button>)}</div><a href="/?view=settings" onClick={() => setOpen(false)} className="mt-3 flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold text-primary transition hover:bg-muted">Editar perfil em Configurações</a>{feedback && <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">{feedback}</p>}<button type="button" onClick={() => void signOut(auth)} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted"><LogOut className="size-4" />Sair da conta</button></div>}
  </div>;
}

export function ProfileSettings() {
  const { user } = useAuth();
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!user) return;
    let active = true;
    void user.getIdToken().then(async (token) => {
      const response = await fetch('/api/colleagues', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json() as { colleagues?: Colleague[] };
      const profile = payload.colleagues?.find((item) => item.email.toLowerCase() === user.email?.toLowerCase());
      if (active && profile) { setName(profile.displayName || ''); setPhone(profile.phone || ''); setPhoto(profile.photoUrl); }
    }).catch(() => { if (active) setMessage('Não foi possível carregar perfil.'); });
    return () => { active = false; };
  }, [user]);
  function choosePhoto(file?: File) {
    if (!file) return;
    if (file.size > 650_000) { setMessage('Escolha uma imagem de até 650 KB.'); return; }
    const reader = new FileReader(); reader.onload = () => setPhoto(String(reader.result)); reader.readAsDataURL(file);
  }
  async function save() {
    if (!user) return; setSaving(true); setMessage('');
    try { const response = await fetch('/api/colleagues', { method: 'PATCH', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, phone, photoUrl: photo }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || 'Falha ao salvar perfil.'); window.dispatchEvent(new Event('caju-presence-updated')); setMessage('Perfil atualizado.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar perfil.'); } finally { setSaving(false); }
  }
  return <section className="surface-panel rounded-2xl p-5"><h2 className="font-semibold">Meu perfil</h2><p className="mt-1 text-sm text-muted-foreground">Foto, nome e telefone visíveis para colegas.</p><div className="mt-4 flex items-center gap-4"><div className="grid size-16 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-sm font-bold text-primary">{photo ? <img src={photo} alt="Foto do perfil" className="size-full object-cover" /> : initials(name || user?.email || 'US')}</div><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-primary"><Camera className="size-4" />Alterar foto<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} /></label></div><div className="mt-4 grid gap-3"><label className="text-xs font-semibold text-muted-foreground" htmlFor="settings-profile-name">Nome de exibição<input id="settings-profile-name" className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-xs font-semibold text-muted-foreground" htmlFor="settings-profile-phone">Telefone<input id="settings-profile-phone" className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><button type="button" disabled={saving} onClick={() => void save()} className="h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar perfil'}</button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</div></section>;
}

function TicketShareCard({ ticketId, label, mine, onOpen }: { ticketId: string; label: string; mine: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className={`mt-2 flex w-full min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mine ? 'border-white/25 bg-white/10 hover:bg-white/15' : 'border-primary/30 bg-primary/10 hover:bg-primary/20'}`} aria-label={`Abrir chamado ${ticketId}`}>
    <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${mine ? 'bg-white/15 text-white' : 'bg-primary/15 text-primary'}`}><ClipboardList className="size-4" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] font-semibold uppercase tracking-[.08em] opacity-75">Chamado compartilhado</span>
      <span className="mt-0.5 block text-xs font-bold">{ticketId}</span>
      <span className={`mt-0.5 block break-words text-[11px] leading-snug [overflow-wrap:anywhere] ${mine ? 'text-white/75' : 'text-muted-foreground'}`}>{label || 'Abrir detalhes do chamado'}</span>
    </span>
    <ExternalLink className={`mt-1 size-3.5 shrink-0 ${mine ? 'text-white/80' : 'text-primary'}`} aria-hidden="true" />
  </button>;
}

function initials(value: string) { return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'US'; }

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

function parseTicketMessage(body: string, tickets: ChatTicket[]) {
  const lines = body.split('\n');
  const index = lines.findIndex((line) => /^Chamado\s+[A-Z0-9-]+\s*:/i.test(line.trim()));
  if (index < 0) return { text: body, ticketId: null as string | null, ticketLabel: '' };
  const match = lines[index].trim().match(/^Chamado\s+([A-Z0-9-]+)\s*:\s*(.*)$/i);
  if (!match) return { text: body, ticketId: null as string | null, ticketLabel: '' };
  const ticketId = match[1].toUpperCase();
  const ticket = tickets.find((item) => item.id.toUpperCase() === ticketId);
  const ticketLabel = ticket ? `${ticket.title} · ${ticket.store}` : match[2];
  return { text: lines.filter((_, lineIndex) => lineIndex !== index).join('\n').trim(), ticketId, ticketLabel };
}
