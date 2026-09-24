'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Delete, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLockCountdown, wrongPinMessage, type PinDevice } from '@/lib/pin-device';

// Tela de PIN do login (app/login/page.tsx). Quatro casas em vez de um campo:
// o número aparece por um instante e vira ponto, o PIN errado treme, o certo
// fica verde. No celular (< lg) um teclado numérico próprio substitui o do
// sistema; no desktop vale o teclado físico. Envia sozinho ao completar.
// Animações em app/globals.css (.pin-*).

type Phase = 'idle' | 'checking' | 'error' | 'locked' | 'success';
type UnlockPayload = { customToken?: string; error?: string; revoked?: boolean; attemptsLeft?: number; lockedUntil?: string | null };

const PIN_LENGTH = 4;
const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']] as const;

export function PinPad({ email, device, onToken, onRevoked, onUsePassword }: {
  email: string;
  device: PinDevice;
  /** Troca o custom token por sessão; se lançar, a mensagem aparece aqui. */
  onToken: (customToken: string) => Promise<void>;
  onRevoked: (message: string) => void;
  onUsePassword: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [revealed, setRevealed] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const desktop = useMinWidth(1024);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const typing = phase === 'idle' || phase === 'error';

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    if (phase !== 'locked' || !lockedUntil) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setPhase('idle');
        setLockedUntil(null);
      }
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [lockedUntil, phase]);

  async function submit(value: string) {
    setRevealed(null);
    setPhase('checking');
    setMessage('Conferindo…');
    try {
      const response = await fetch('/api/auth/pin/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceId: device.deviceId, deviceSecret: device.deviceSecret, pin: value }),
      });
      const payload = await response.json().catch(() => ({})) as UnlockPayload;
      if (response.ok && payload.customToken) {
        setPhase('success');
        setMessage('PIN confirmado.');
        await onToken(payload.customToken);
        return;
      }
      if (payload.revoked) return onRevoked(payload.error || 'Sem acesso ao sistema. Use sua senha.');
      if (response.status === 429) {
        setPin('');
        setMessage('');
        setLockedUntil(payload.lockedUntil ? Date.parse(payload.lockedUntil) : null);
        setPhase('locked');
        return;
      }
      fail(response.status === 401 ? wrongPinMessage(payload.attemptsLeft) : payload.error || 'Não foi possível entrar com o PIN.', response.status === 401);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Não foi possível entrar com o PIN.', false);
    }
  }

  function fail(text: string, wrongPin: boolean) {
    setPhase('error');
    setMessage(text);
    if (wrongPin) setShake(true);
    later(() => setPin(''), wrongPin ? 480 : 0);
    later(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }

  function addDigit(digit: string) {
    if (!typing) return;
    // Primeiro número depois de um erro começa um PIN novo.
    const base = phase === 'error' ? '' : pin;
    if (phase === 'error') { setPhase('idle'); setMessage(''); }
    if (base.length >= PIN_LENGTH) return;
    const next = base + digit;
    setPin(next);
    setRevealed(next.length - 1);
    later(() => setRevealed((current) => (current === next.length - 1 ? null : current)), 520);
    if (next.length === PIN_LENGTH) later(() => void submit(next), 220);
  }

  function removeDigit() {
    if (!typing) return;
    if (phase === 'error') { setPhase('idle'); setMessage(''); setPin(''); return; }
    setRevealed(null);
    setPin((current) => current.slice(0, -1));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^\d$/.test(event.key)) { event.preventDefault(); addDigit(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); removeDigit(); }
  }

  // Teclado físico com o foco fora do campo (clicou no painel): digitar volta ao PIN.
  const addDigitRef = useRef(addDigit);
  useEffect(() => { addDigitRef.current = addDigit; });
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (document.activeElement && document.activeElement !== document.body) return;
      if (!/^\d$/.test(event.key)) return;
      event.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      addDigitRef.current(event.key);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (phase === 'locked') {
    return (
      <div className="mt-6 flex flex-1 flex-col items-center pt-2 text-center lg:flex-none">
        <span className="grid size-14 place-items-center rounded-[18px] bg-danger-soft text-danger"><LockKeyhole aria-hidden="true" strokeWidth={1.75} className="size-6" /></span>
        <p className="mt-4 text-[17px] font-semibold tracking-[-.01em]">PIN pausado neste aparelho</p>
        <p className="mt-1 max-w-[30ch] text-balance text-sm text-muted-foreground">Foram 5 tentativas erradas. Entre com a senha agora ou espere o PIN voltar.</p>
        {lockedUntil && <p aria-label="Tempo até o PIN voltar" className="mt-3.5 font-mono text-[34px] font-semibold leading-none tracking-[-.02em] tabular-nums">{formatLockCountdown(lockedUntil - now)}</p>}
        <Button type="button" onClick={onUsePassword} className="mt-auto h-12 w-full rounded-[14px] text-[15px] font-semibold lg:mt-6">Entrar com a senha</Button>
      </div>
    );
  }

  return (
    <form className="mt-6 flex flex-1 flex-col lg:flex-none" onSubmit={(event) => { event.preventDefault(); if (pin.length === PIN_LENGTH && typing) void submit(pin); }}>
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="login-pin" className="text-sm font-medium">PIN</label>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" strokeWidth={1.75} className="size-3.5 text-success" />Vale só neste aparelho</span>
      </div>
      <input
        ref={inputRef}
        id="login-pin"
        name="pin"
        className="sr-only"
        inputMode={desktop ? 'numeric' : 'none'}
        autoComplete="off"
        maxLength={PIN_LENGTH}
        value={pin}
        disabled={!typing}
        aria-describedby="login-pin-status"
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          // Teclados que não mandam a tecla no keydown (Android): reconcilia pelo valor.
          const digits = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
          if (digits.length > pin.length && digits.startsWith(pin)) Array.from(digits.slice(pin.length)).forEach(addDigit);
        }}
      />
      <div
        aria-hidden="true"
        data-checking={phase === 'checking' || undefined}
        data-success={phase === 'success' || undefined}
        className={`pin-cells mt-2.5 grid cursor-text grid-cols-4 gap-3 ${shake ? 'pin-shake' : ''}`}
        onClick={() => inputRef.current?.focus({ preventScroll: true })}
        onAnimationEnd={(event) => { if (event.target === event.currentTarget) setShake(false); }}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => {
          const filled = index < pin.length;
          const active = typing && index === pin.length;
          const tone = phase === 'success' ? 'border-success bg-success-soft' : phase === 'error' && filled ? 'border-danger bg-danger-soft' : active ? 'border-primary bg-card-elevated' : 'border-transparent bg-muted';
          const dot = phase === 'success' ? 'bg-success' : phase === 'error' ? 'bg-danger' : 'bg-foreground';
          return (
            <span key={index} style={{ '--i': index } as CSSProperties} data-filled={filled || undefined} data-reveal={revealed === index || undefined} className={`pin-cell relative grid h-16 place-items-center rounded-2xl border-[1.5px] transition-colors duration-200 lg:h-[72px] ${tone}`}>
              <span className="pin-digit absolute font-mono text-[26px] font-medium leading-none tabular-nums">{filled ? pin[index] : ''}</span>
              <span className={`pin-dot size-3 rounded-full ${dot}`} />
              {active && <span className="pin-caret absolute h-6 w-0.5 rounded-full bg-primary" />}
            </span>
          );
        })}
      </div>
      <output id="login-pin-status" className={`mt-3 block min-h-5 text-center text-[13px] ${phase === 'error' ? 'text-danger' : phase === 'success' ? 'text-success' : 'text-muted-foreground'}`}>{message}</output>
      <p className="mt-2 hidden flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground lg:flex">
        Digite no teclado <kbd className={kbd}>0</kbd>–<kbd className={kbd}>9</kbd> · <kbd className={kbd}>⌫</kbd> apaga · entra ao completar
      </p>

      <div className="mt-auto grid grid-cols-3 gap-x-2.5 gap-y-2 pt-3 lg:hidden">
        {KEYS.map(([digit, letters]) => (
          <button key={digit} type="button" disabled={!typing} onClick={() => addDigit(digit)} className={keyClass}>
            <span className="text-[25px] font-medium leading-none tabular-nums">{digit}</span>
            <span className="h-2.5 text-[9px] font-semibold leading-none tracking-[.2em] text-muted-foreground">{letters}</span>
          </button>
        ))}
        <span aria-hidden="true" />
        <button type="button" disabled={!typing} onClick={() => addDigit('0')} className={keyClass}>
          <span className="text-[25px] font-medium leading-none tabular-nums">0</span>
          <span className="h-2.5" />
        </button>
        <button type="button" disabled={!typing} onClick={removeDigit} aria-label="Apagar último número" className={`${keyClass} bg-transparent`}>
          <Delete aria-hidden="true" strokeWidth={1.75} className="size-6" />
        </button>
      </div>

      <button type="button" onClick={onUsePassword} className="mt-2 min-h-11 w-full rounded-md text-center text-[13px] font-semibold text-primary hover:underline lg:mt-4">Usar a senha</button>
    </form>
  );
}

const kbd = 'inline-grid h-[22px] min-w-[22px] place-items-center rounded-md border border-b-2 border-border bg-muted px-1.5 font-mono text-[11px] leading-none text-foreground';
const keyClass = 'grid h-14 touch-manipulation place-items-center content-center gap-1 rounded-[18px] bg-muted text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[.94] active:bg-accent disabled:opacity-40 disabled:active:scale-100';

function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
