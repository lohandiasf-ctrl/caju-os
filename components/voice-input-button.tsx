'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { formatRecordingTime, MAX_RECORDING_SECONDS, RECORDER_MIME_TYPES } from '@/lib/voice-transcription';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'recording' | 'transcribing';

const noop = () => () => {};
function canRecord() {
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Botão de ditado. Clique grava, clique de novo para; o áudio vai para
 * /api/assistant/transcribe e o texto cai no campo via `onText` — nunca envia
 * a pergunta sozinho. Qualquer falha vira mensagem curta e o campo continua
 * funcionando (falha de conveniência não bloqueia o fluxo).
 */
export function VoiceInputButton({ onText, onError, disabled = false, className }: {
  onText: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  // Sem gravação (navegador antigo, contexto sem HTTPS), o botão nem aparece.
  const supported = useSyncExternalStore(noop, canRecord, () => false);

  function releaseMic() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // Sair da tela no meio da gravação solta o microfone e descarta o áudio.
  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseMic();
  }, []);

  useEffect(() => {
    if (status !== 'recording') return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS && recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [status]);

  async function transcribe(blob: Blob) {
    if (!user) { onError?.('Sessão expirada. Entre de novo.'); return; }
    setStatus('transcribing');
    try {
      const response = await fetch('/api/assistant/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      const payload = await response.json().catch(() => ({})) as { text?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || 'Não foi possível transcrever agora. Digite a pergunta.');
      onText(payload.text);
    } catch (reason) {
      onError?.(reason instanceof Error ? reason.message : 'Não foi possível transcrever agora. Digite a pergunta.');
    } finally {
      setStatus('idle');
    }
  }

  async function start() {
    if (!supported) { onError?.('Este navegador não grava áudio.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        releaseMic();
        if (cancelledRef.current) { setStatus('idle'); return; }
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setStatus('recording');
    } catch (reason) {
      releaseMic();
      const denied = reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError');
      onError?.(denied ? 'Permita o microfone no navegador para ditar.' : 'Não foi possível abrir o microfone.');
      setStatus('idle');
    }
  }

  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  if (!supported) return null;
  const recording = status === 'recording';
  const busy = status === 'transcribing';
  return (
    <button
      type="button"
      onClick={() => (recording ? stop() : void start())}
      disabled={disabled || busy}
      aria-pressed={recording}
      aria-label={recording ? `Parar e transcrever (${formatRecordingTime(seconds)})` : busy ? 'Transcrevendo áudio' : 'Ditar pergunta por voz'}
      title={recording ? 'Parar e transcrever' : 'Ditar por voz'}
      className={cn(
        'relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-[background-color,color,width] disabled:opacity-60 max-sm:h-11',
        recording ? 'bg-danger-soft px-3 text-danger' : 'w-9 text-muted-foreground hover:bg-muted hover:text-foreground max-sm:w-11',
        className,
      )}
    >
      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        : recording ? <><span aria-hidden="true" className="voice-dot" /><Square aria-hidden="true" className="size-3 fill-current" /><span className="tabular-nums">{formatRecordingTime(seconds)}</span></>
          : <Mic aria-hidden="true" className="size-4" strokeWidth={1.75} />}
      <span className="sr-only" aria-live="polite">{recording ? 'Gravando' : busy ? 'Transcrevendo' : ''}</span>
    </button>
  );
}
