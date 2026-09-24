'use client';

import { FormEvent, useEffect, useRef, useState, type RefObject } from 'react';
import Image from 'next/image';
import { FirebaseError } from 'firebase/app';
import { signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ClipboardCheck, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, MapPinned, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PinPad } from '@/components/pin-pad';
import { startLoginTransition } from '@/components/login-transition';
import { ThemeToggle } from '@/components/theme-toggle';
import { auth } from '@/lib/firebase';
import { emailInitials, forgetRememberedEmail, readRememberedEmail, rememberEmail } from '@/lib/login-memory';
import { forgetPinDevice, readPinDevice } from '@/lib/pin-device';

function localStore() {
  try { return window.localStorage; } catch { return null; }
}

export default function LoginPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const [resetting, setResetting] = useState(false);
  // E-mail de quem entrou por último neste aparelho: a volta pede só a senha.
  // A tela só renderiza no cliente (o AuthProvider segura o SSR), então dá
  // para ler o storage no estado inicial.
  const [remembered, setRemembered] = useState(() => (typeof window === 'undefined' ? '' : readRememberedEmail(localStore())));
  const [email, setEmail] = useState(remembered);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  // PIN de acesso rápido deste aparelho (lib/pin-device.ts). Quando existe
  // para o e-mail lembrado, a volta pede o PIN em vez da senha por padrão —
  // "Usar a senha" sempre disponível como saída.
  const pinDevice = remembered ? readPinDevice(localStore(), remembered) : null;
  const [usePin, setUsePin] = useState(() => Boolean(pinDevice));
  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // O PinPad foca o próprio campo ao montar.
    if (remembered && !usePin) passwordRef.current?.focus();
  }, [remembered, usePin]);

  function switchAccount() {
    forgetRememberedEmail(localStore());
    setRemembered('');
    setEmail('');
    setPassword('');
    setUsePin(false);
    setError('');
    setMessage('');
    window.requestAnimationFrame(() => emailRef.current?.focus());
  }

  function loginTransitionBox() {
    // Mede o painel azul agora: depois do login o AuthProvider desmonta esta
    // tela e o elemento deixa de existir.
    const panel = [desktopPanelRef.current, mobilePanelRef.current].find((element) => element && element.offsetParent !== null);
    return panel?.getBoundingClientRect();
  }

  // O PinPad confere o PIN no servidor; aqui só vira sessão e segue a mesma
  // transição do login por senha.
  async function handlePinToken(customToken: string) {
    const box = loginTransitionBox();
    try {
      await signInWithCustomToken(auth, customToken);
    } catch (cause) {
      throw new Error(authErrorMessage(cause));
    }
    rememberEmail(localStore(), remembered);
    setLeaving(true);
    startLoginTransition(box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null);
  }

  function handlePinRevoked(message: string) {
    forgetPinDevice(localStore(), remembered);
    setUsePin(false);
    setError(message);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    const box = loginTransitionBox();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      rememberEmail(localStore(), email);
      setLeaving(true);
      startLoginTransition(box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null);
    } catch (cause) {
      setError(authErrorMessage(cause));
      setLoading(false);
    }
  }

  async function resetPassword() {
    setError('');
    setMessage('');
    // Read the DOM value as well: browser/password-manager autofill may fill an
    // input without issuing React's onChange event.
    const resetEmail = (emailRef.current?.value || email).trim().toLowerCase();
    if (!resetEmail) {
      setError('Informe seu e-mail para receber a recuperação de senha.');
      emailRef.current?.focus();
      return;
    }
    setResetting(true);
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar o e-mail de recuperação.');
      setMessage('Se houver uma conta com esse e-mail, enviaremos as instruções de recuperação em instantes. Verifique também a caixa de spam.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o e-mail de recuperação.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh overflow-x-hidden bg-background text-foreground lg:grid-cols-2">
      <BrandPanel panelRef={desktopPanelRef} variant="full" />

      <section className="relative flex min-w-0 flex-col lg:items-center lg:justify-center lg:px-10 lg:py-10">
        <BrandPanel panelRef={mobilePanelRef} variant="compact" />
        <ThemeToggle className="absolute right-3 top-3 z-10 lg:right-6 lg:top-6" />
        <motion.div
          animate={leaving ? { opacity: 0, scale: 0.98 } : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative z-[1] -mt-6 flex w-full flex-1 flex-col rounded-t-[24px] bg-card-elevated px-5 pb-10 pt-7 shadow-(--shadow-card) sm:px-8 lg:mt-0 lg:block lg:max-w-[400px] lg:flex-none lg:rounded-[20px] lg:border lg:border-border lg:p-8"
        >
          {remembered ? <>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{emailInitials(remembered)}</span>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-[-.01em]">Que bom ter você de volta <span aria-hidden="true">👋</span></h1>
                <p className="truncate text-sm text-muted-foreground">{remembered}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{usePin && pinDevice ? 'Digite o PIN deste aparelho para continuar.' : 'Por segurança, a sessão termina quando o app é fechado. Digite sua senha para continuar.'}</p>
          </> : <>
            <h1 className="text-xl font-semibold tracking-[-.01em]">Que bom ter você de volta <span aria-hidden="true">👋</span></h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Entre com suas credenciais para continuar.</p>
          </>}

          {remembered && usePin && pinDevice ? (
            <PinPad
              email={remembered}
              device={pinDevice}
              onToken={handlePinToken}
              onRevoked={handlePinRevoked}
              onUsePassword={() => { setUsePin(false); setError(''); }}
            />
          ) : (
            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              {remembered ? (
                // Continua no formulário para o gerenciador de senhas saber de qual conta é a senha.
                <input ref={emailRef} type="email" name="email" autoComplete="username" value={email} readOnly hidden />
              ) : (
                <div>
                  <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium">E-mail</label>
                  <span className="relative block">
                    <Mail aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground" />
                    <Input ref={emailRef} id="login-email" name="email" className={loginInput} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@cajutech.net" required />
                  </span>
                </div>
              )}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="text-sm font-medium">Senha</label>
                  <button type="button" disabled={loading || resetting} onClick={() => void resetPassword()} className="-my-2 min-h-9 rounded-md px-1 text-[13px] font-semibold text-primary hover:underline disabled:opacity-60">{resetting ? 'Enviando recuperação…' : 'Esqueci a senha'}</button>
                </div>
                <span className="relative block">
                  <LockKeyhole aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-[18px] -translate-y-1/2 text-muted-foreground" />
                  <Input ref={passwordRef} id="login-password" name="password" className={`${loginInput} pr-12`} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" minLength={6} required />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} aria-pressed={showPassword} className="absolute right-0.5 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="size-[18px]" strokeWidth={1.75} /> : <Eye className="size-[18px]" strokeWidth={1.75} />}</button>
                </span>
              </div>
              {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-[13px] text-danger">{error}</p>}
              {message && <output className="block rounded-xl bg-success-soft p-3 text-[13px] text-success">{message}</output>}
              <Button className="h-11 w-full rounded-xl text-[15px] font-semibold" type="submit" disabled={loading || resetting}>{loading ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Entrando…</> : 'Entrar'}</Button>
              {remembered && pinDevice && <button type="button" onClick={() => { setUsePin(true); setError(''); }} className="block w-full text-center text-[13px] font-semibold text-primary hover:underline">Usar o PIN deste aparelho</button>}
            </form>
          )}
          {remembered ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Não é {remembered.split('@')[0]}?{' '}
              <button type="button" onClick={switchAccount} className="min-h-9 rounded-md px-1 font-semibold text-primary hover:underline">Usar outra conta</button>
            </p>
          ) : (
            <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">Não possui acesso? Solicite seu cadastro ao administrador da operação.</p>
          )}
        </motion.div>
      </section>
    </main>
  );
}

const loginInput = 'h-11 rounded-xl border-transparent bg-muted pl-11 text-[15px] shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:bg-card-elevated focus-visible:ring-2 focus-visible:ring-primary';

const slides = [
  'Operação de campo, chamados e financeiro em um só lugar.',
  'Do acionamento à validação, cada chamado com o contexto completo.',
  'Técnicos, agenda e cobertura por cidade no mesmo painel.',
];
const highlights = [
  [ClipboardCheck, 'Chamados', 'sincronizados'],
  [MapPinned, 'Mapa de', 'técnicos'],
  [ShieldCheck, 'Acesso', 'seguro'],
] as const;

/**
 * Painel da marca. No desktop ocupa a metade esquerda; no celular vira um
 * cabeçalho de ~180 px e o card do formulário sobe 24 px por cima dele.
 */
function BrandPanel({ variant, panelRef }: { variant: 'full' | 'compact'; panelRef: RefObject<HTMLDivElement | null> }) {
  const reduced = useReducedMotion();
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (variant !== 'full' || reduced) return;
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 5000);
    return () => window.clearInterval(timer);
  }, [reduced, variant]);
  const full = variant === 'full';
  return (
    <div
      ref={panelRef}
      className={full
        ? 'brand-surface relative m-3 hidden overflow-hidden rounded-[28px] lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12 lg:py-16'
        : 'brand-surface relative flex h-[180px] shrink-0 items-center overflow-hidden px-6 pb-6 lg:hidden'}
    >
      {full && <DotGrid />}
      <Waves />
      <div className={full ? 'relative flex flex-col items-center text-center' : 'relative flex items-center gap-3'}>
        <span className={`grid place-items-center rounded-[22%] bg-white ${full ? 'size-24 p-3' : 'size-12 p-1.5'}`}>
          <Image src="/caju-tech-emblem.png" alt="" width={96} height={96} priority className="size-full object-contain" />
        </span>
        <div>
          <p className={full ? 'mt-6 text-2xl font-semibold tracking-[-.02em]' : 'text-lg font-semibold leading-tight'}>Caju OS</p>
          {!full && <p className="text-xs text-white/80">Central de operações</p>}
        </div>
        {full && <>
          <div className="relative mt-2 h-12 w-full max-w-sm">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={slide}
                className="absolute inset-x-0 text-[15px] leading-6 text-white/80"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
              >
                {slides[slide]}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {slides.map((text, index) => (
              <button key={text} type="button" onClick={() => setSlide(index)} aria-label={`Mensagem ${index + 1} de ${slides.length}`} aria-current={slide === index} className="grid h-6 place-items-center px-0.5">
                <span className={`block h-1.5 rounded-full bg-white transition-[width,opacity] duration-300 ${slide === index ? 'w-5 opacity-100' : 'w-1.5 opacity-45'}`} />
              </button>
            ))}
          </div>
          <ul className="mt-14 grid w-full max-w-md grid-cols-3 gap-4">
            {highlights.map(([Icon, first, second]) => (
              <li key={first} className="flex flex-col items-center gap-2.5 text-center text-[13px] leading-snug text-white/85">
                <span className="grid size-11 place-items-center rounded-2xl border border-white/20 bg-white/10"><Icon aria-hidden="true" strokeWidth={1.75} className="size-5" /></span>
                <span>{first}<br />{second}</span>
              </li>
            ))}
          </ul>
        </>}
      </div>
    </div>
  );
}

function DotGrid() {
  return (
    <svg aria-hidden="true" className="absolute left-10 top-10 opacity-25" width="86" height="58" viewBox="0 0 86 58">
      {Array.from({ length: 24 }, (_, index) => <circle key={index} cx={3 + (index % 6) * 16} cy={3 + Math.floor(index / 6) * 17} r="2.5" fill="currentColor" />)}
    </svg>
  );
}

function Waves() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] w-full" viewBox="0 0 800 300" preserveAspectRatio="none">
      <path d="M0 170 C 160 110 300 230 470 170 S 700 90 800 140 V300 H0 Z" fill="rgb(255 255 255 / 8%)" />
      <path d="M0 230 C 180 180 320 280 500 225 S 720 170 800 205 V300 H0 Z" fill="rgb(255 255 255 / 14%)" />
    </svg>
  );
}

function authErrorMessage(cause: unknown) {
  if (!(cause instanceof FirebaseError)) return 'Não foi possível entrar. Tente novamente.';
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(cause.code)) return 'E-mail ou senha inválidos.';
  if (cause.code === 'auth/too-many-requests') return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (cause.code === 'auth/invalid-email') return 'Informe um endereço de e-mail válido.';
  if (cause.code === 'auth/operation-not-allowed') return 'O login por e-mail ainda precisa ser ativado pelo administrador.';
  if (cause.code === 'auth/network-request-failed') return 'Sem conexão com o serviço de login. Verifique sua internet.';
  return 'Não foi possível entrar. Tente novamente.';
}
