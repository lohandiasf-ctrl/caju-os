'use client';

import { FormEvent, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
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
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage('Enviamos as instruções de recuperação para o seu e-mail.');
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-background text-foreground lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden border-r border-border bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(229,98,35,.2),transparent_35%),radial-gradient(circle_at_75%_80%,rgba(57,214,162,.1),transparent_30%)]" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary text-xl font-black text-primary-foreground shadow-[0_12px_35px_rgba(229,98,35,.3)]">C</div>
          <div><p className="font-extrabold">Caju OS</p><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Central de operações</p></div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Operação em um só lugar</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-[-.04em] xl:text-5xl">Chamados, equipe e cobertura técnica com acesso protegido.</h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground">Entre com a conta fornecida pelo administrador para acessar o ambiente interno da Caju Tech.</p>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-emerald-300" />Ambiente restrito a usuários autorizados</div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">C</div>
            <div><p className="font-extrabold">Caju OS</p><p className="text-[10px] uppercase tracking-[.16em] text-muted-foreground">Central de operações</p></div>
          </div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Acesso interno</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-[-.03em]">Entrar na sua conta</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use o e-mail e a senha cadastrados pelo administrador.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">E-mail</span>
              <span className="relative block"><Mail className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@cajutech.com.br" required /></span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold">Senha</span>
              <span className="relative block"><LockKeyhole className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 px-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" minLength={6} required /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/8 p-3 text-xs text-red-200">{error}</p>}
            {message && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/8 p-3 text-xs text-emerald-200">{message}</p>}
            <Button className="h-11 w-full font-bold" type="submit" disabled={loading}>{loading ? <><LoaderCircle className="animate-spin" />Entrando...</> : 'Entrar'}</Button>
            <button type="button" onClick={() => void resetPassword()} className="w-full text-center text-xs font-semibold text-muted-foreground transition hover:text-primary">Esqueci minha senha</button>
          </form>
          <p className="mt-9 text-center text-[11px] leading-5 text-muted-foreground">Não possui acesso? Solicite seu cadastro ao administrador da operação.</p>
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
