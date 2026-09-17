'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_QUESTION } from '@/lib/rovo';

type User = { getIdToken: () => Promise<string> } | null;
type Pending = { id: string; question: string };
type Result = { answer: string; actionId: string | null; warning: string | null };

const POLL_MS = 2000;

// Ponte com o Rovo. A resposta não volta pela mesma requisição: a pergunta sai
// para o Jira Automation e a resposta chega por callback, então a tela
// consulta até a volta chegar (ou o tempo acabar).
export function RovoPanel({ user, ticketKey }: { user: User; ticketKey?: string }) {
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  async function authed(path: string, init: RequestInit = {}) {
    if (!user) throw new Error('Sessão expirada. Entre de novo.');
    return fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await user.getIdToken()}` } });
  }

  async function poll(id: string) {
    try {
      const response = await authed(`/api/rovo/${id}`);
      const payload = await response.json() as { status?: string; answer?: string; error?: string; actionId?: string | null };
      if (!response.ok) throw new Error(payload.error || 'Falha ao consultar a resposta.');
      if (payload.status === 'pending') {
        timer.current = window.setTimeout(() => void poll(id), POLL_MS);
        return;
      }
      setPending(null);
      if (payload.status === 'answered') {
        setResult({ answer: payload.answer ?? '', actionId: payload.actionId ?? null, warning: payload.error ?? null });
      } else {
        setError(payload.error || 'O Rovo não respondeu.');
      }
    } catch (reason) {
      setPending(null);
      setError(reason instanceof Error ? reason.message : 'Falha ao consultar a resposta.');
    }
  }

  async function submit() {
    if (sending || question.trim().length < 3) return;
    setSending(true); setError(''); setResult(null); setApplied('');
    try {
      const response = await authed('/api/rovo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, ticketKey }),
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || 'Não foi possível enviar ao Rovo.');
      setPending({ id: payload.id, question: question.trim() });
      setQuestion('');
      timer.current = window.setTimeout(() => void poll(payload.id!), POLL_MS);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar ao Rovo.');
    } finally { setSending(false); }
  }

  // A ação proposta pelo Rovo passa pela mesma confirmação do assistente local.
  async function decide(actionId: string, accept: boolean) {
    if (confirming) return;
    setConfirming(true); setError('');
    try {
      const response = await authed(`/api/assistant/actions/${actionId}`, { method: accept ? 'POST' : 'DELETE' });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir.');
      setApplied(accept ? 'Aplicado no Jira e registrado na auditoria.' : 'Sugestão recusada e registrada na auditoria.');
      setResult((current) => current && { ...current, actionId: null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.');
    } finally { setConfirming(false); }
  }

  return <section aria-labelledby="rovo-title" className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-3">
    <h3 id="rovo-title" className="flex items-center gap-2 text-sm font-bold"><Send className="size-4 text-sky-300" />Perguntar ao Rovo</h3>
    <p className="mt-1 text-xs text-muted-foreground">
      A pergunta vai ao Rovo pelo Jira{ticketKey ? ` no contexto de ${ticketKey}` : ''}. A resposta volta em alguns segundos.
    </p>

    <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={MAX_QUESTION}
        placeholder="O que você quer perguntar ou pedir ao Rovo?"
        aria-label="Pergunta ao Rovo"
        className="min-h-11 min-w-0 flex-1"
        disabled={sending || Boolean(pending)}
      />
      <Button type="submit" className="h-11" disabled={sending || Boolean(pending) || question.trim().length < 3}>
        {sending ? <Loader2 className="animate-spin" /> : <Send />}Enviar
      </Button>
    </form>

    {pending && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />Esperando o Rovo responder sobre “{pending.question}”...
    </p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    {result && <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-background/70 p-3 text-sm leading-relaxed">{result.answer}</div>}
    {result?.warning && <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">{result.warning}</p>}

    {result?.actionId && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-200"><ShieldCheck className="size-4" />O Rovo propôs uma ação</p>
      <p className="mt-2 text-xs text-muted-foreground">Nada foi escrito. Confirme para aplicar no Jira em seu nome — fica registrado na auditoria.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={confirming} onClick={() => void decide(result.actionId!, true)}>
          {confirming ? <Loader2 className="animate-spin" /> : <Check />}Confirmar e aplicar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={confirming} onClick={() => void decide(result.actionId!, false)}><X />Recusar</Button>
      </div>
    </div>}
    {applied && <p role="status" className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">{applied}</p>}
  </section>;
}
