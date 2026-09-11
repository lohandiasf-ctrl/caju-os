'use client';

import { FormEvent, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (cause) {
      setError(authErrorMessage(cause));
      setLoading(false);
    }
  }

  async function resetPassword() {
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Informe seu e-mail para receber a recuperação de senha.');
      emailRef.current?.focus();
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage('Enviamos as instruções de recuperação para o seu e-mail.');
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh overflow-hidden text-foreground lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden border-r border-border bg-sidebar lg:m-4 lg:flex lg:flex-col lg:justify-between lg:rounded-[28px] lg:border lg:p-14 lg:shadow-2xl">
        <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_22%_20%,rgba(240,122,63,.2),transparent_34%),radial-gradient(circle_at_78%_78%,rgba(95,219,184,.13),transparent_32%)]" />
        <div className="relative flex items-center gap-3">
          <div className="cockpit-brand grid size-11 place-items-center overflow-hidden rounded-xl"><img src="/caju-tech-emblem.png" alt="Caju Tech" className="size-10 object-contain" /></div>
          <div><p className="font-extrabold">Caju OS</p><p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Comando operacional</p></div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Operação em um só lugar</p>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.04em] xl:text-5xl">Chamados, equipe e cobertura técnica com acesso protegido.</h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Entre com a conta fornecida pelo administrador para acessar o ambiente interno da Caju Tech.</p>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-emerald-300" />Ambiente restrito a usuários autorizados</div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="surface-panel w-full max-w-[440px] rounded-[28px] p-6 sm:p-9">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="cockpit-brand grid size-10 place-items-center overflow-hidden rounded-xl"><img src="/caju-tech-emblem.png" alt="Caju Tech" className="size-9 object-contain" /></div>
            <div><p className="font-extrabold">Caju OS</p><p className="text-xs uppercase tracking-[.16em] text-muted-foreground">Comando operacional</p></div>
          </div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Acesso interno</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">Entrar na sua conta</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use o e-mail e a senha cadastrados pelo administrador.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="block">
              <label htmlFor="login-email" className="mb-2 block text-sm font-medium">E-mail</label>
              <span className="relative block"><Mail className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input ref={emailRef} id="login-email" name="email" className="h-11 pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@cajutech.net" required /></span>
            </div>
            <label className="block">
              <label htmlFor="login-password" className="mb-2 block text-sm font-medium">Senha</label>
              <span className="relative block"><LockKeyhole className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="login-password" name="password" className="h-11 px-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" minLength={6} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-pressed={showPassword} className="absolute right-0 top-0 z-10 grid size-11 place-items-center rounded-lg text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/8 p-3 text-xs text-red-200">{error}</p>}
            {message && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/8 p-3 text-xs text-emerald-200">{message}</p>}
            <Button className="h-11 w-full font-bold" type="submit" disabled={loading || resetting}>{loading ? <><LoaderCircle className="animate-spin" />Entrando...</> : 'Entrar'}</Button>
            <button type="button" disabled={loading || resetting} onClick={() => void resetPassword()} className="min-h-11 w-full rounded-lg text-center text-sm font-semibold text-muted-foreground transition hover:text-primary">{resetting ? 'Enviando recuperação...' : 'Esqueci minha senha'}</button>
          </form>
          <p className="mt-9 text-center text-xs leading-5 text-muted-foreground">Não possui acesso? Solicite seu cadastro ao administrador da operação.</p>
        </div>
      </section>
    </main>
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
