'use client';

import { useState } from 'react';
import { Check, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_QUESTION_LENGTH, type AssistantTask } from '@/lib/assistant';

type Proposal = { id: string; description: string; kind: string; preview: Record<string, unknown> };

type User = { getIdToken: () => Promise<string> } | null;

async function ask(user: User, body: Record<string, unknown>) {
  if (!user) throw new Error('Sessão expirada. Entre de novo.');
  const response = await fetch('/api/assistant', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { answer?: string; error?: string };
  if (!response.ok || !payload.answer) throw new Error(payload.error || 'O assistente não respondeu.');
  return payload.answer;
}

function Answer({ text }: { text: string }) {
  return <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-background/70 p-3 text-sm leading-relaxed">{text}</div>;
}

function Shell({ children, hint }: { children: React.ReactNode; hint: string }) {
  return <section aria-labelledby="assistente-title" className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 id="assistente-title" className="flex items-center gap-2 text-sm font-bold"><Sparkles className="size-4 text-violet-300" />Assistente</h3>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
    {children}
  </section>;
}

// Resumo, próximo passo e escrita assistida. Escrever exige confirmação: o
// assistente propõe, a pessoa lê o que vai mudar e aceita. Nada é aplicado
// sem esse passo, e tudo fica na auditoria.
export function TicketAssistant({ ticketKey, user, onApplied }: { ticketKey: string; user: User; onApplied?: () => void }) {
  const [task, setTask] = useState<AssistantTask | 'action' | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [resolving, setResolving] = useState(false);
  const [applied, setApplied] = useState('');
  const busy = task !== null;

  function reset() {
    setError(''); setAnswer(''); setWarning(''); setProposal(null); setApplied('');
  }

  async function run(next: Exclude<AssistantTask, 'queue'>) {
    setTask(next); reset();
    try { setAnswer(await ask(user, { task: next, ticketKey })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'O assistente falhou.'); }
    finally { setTask(null); }
  }

  async function propose() {
    setTask('action'); reset();
    try {
      if (!user) throw new Error('Sessão expirada. Entre de novo.');
      const response = await fetch('/api/assistant/actions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketKey }),
      });
      const payload = await response.json() as { answer?: string; action?: Proposal | null; actionWarning?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || 'O assistente não respondeu.');
      setAnswer(payload.answer ?? '');
      setProposal(payload.action ?? null);
      setWarning(payload.actionWarning ?? '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'O assistente falhou.');
    } finally { setTask(null); }
  }

  async function decide(accept: boolean) {
    if (!proposal || resolving || !user) return;
    setResolving(true); setError('');
    try {
      const response = await fetch(`/api/assistant/actions/${proposal.id}`, {
        method: accept ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir.');
      setApplied(accept ? 'Aplicado no Jira e registrado na auditoria.' : 'Sugestão recusada e registrada na auditoria.');
      setProposal(null);
      if (accept) onApplied?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.');
    } finally { setResolving(false); }
  }

  return <Shell hint="Lê o chamado e responde. Para escrever no Jira, propõe e espera sua confirmação.">
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run('summary')}>
        {task === 'summary' ? <Loader2 className="animate-spin" /> : <Sparkles />}Resumir chamado
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run('next_step')}>
        {task === 'next_step' ? <Loader2 className="animate-spin" /> : <Sparkles />}Sugerir próximo passo
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void propose()}>
        {task === 'action' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Sugerir ação no Jira
      </Button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    {answer && <Answer text={answer} />}

    {proposal && <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-200"><ShieldCheck className="size-4" />Confirmação necessária</p>
      <p className="mt-2 text-sm font-semibold">{proposal.description}</p>
      {proposal.kind === 'comment' && typeof proposal.preview.body === 'string' &&
        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-background/70 p-3 text-sm">{proposal.preview.body}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Nada foi escrito ainda. Ao confirmar, a ação vai ao Jira em seu nome e fica registrada para a coordenação e a gerência.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={resolving} onClick={() => void decide(true)}>
          {resolving ? <Loader2 className="animate-spin" /> : <Check />}Confirmar e aplicar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={resolving} onClick={() => void decide(false)}><X />Recusar</Button>
      </div>
    </div>}

    {warning && <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">{warning}</p>}
    {applied && <p role="status" className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">{applied}</p>}
    {answer && !proposal && <p className="mt-2 text-xs text-muted-foreground">Gerado por IA a partir do chamado. Confira antes de agir.</p>}
  </Shell>;
}

// Pergunta livre sobre a fila. O servidor relê a fila; o contexto do modelo
// nunca vem do cliente.
export function QueueAssistant({ user, status, query }: { user: User; status?: string; query?: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || question.trim().length < 3) return;
    setBusy(true); setError(''); setAnswer('');
    try { setAnswer(await ask(user, { task: 'queue', question, status, query })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'O assistente falhou.'); }
    finally { setBusy(false); }
  }

  return <Shell hint="Pergunte sobre os chamados desta fila. Responde só com o que está listado.">
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={MAX_QUESTION_LENGTH}
        placeholder="Ex.: quais chamados estão sem técnico há mais de dois dias?"
        aria-label="Pergunta sobre a fila"
        className="min-h-11 min-w-0 flex-1"
        disabled={busy}
      />
      <Button type="submit" className="h-11" disabled={busy || question.trim().length < 3}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Perguntar
      </Button>
    </form>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    {answer && <Answer text={answer} />}
    {answer && <p className="mt-2 text-xs text-muted-foreground">Resposta gerada por IA sobre os chamados carregados. Confira antes de agir.</p>}
  </Shell>;
}
