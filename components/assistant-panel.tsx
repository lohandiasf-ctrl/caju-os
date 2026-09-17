'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_QUESTION_LENGTH, type AssistantTask } from '@/lib/assistant';

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

// Resumo e próximo passo de um chamado. Só leitura: nada é gravado no Jira.
export function TicketAssistant({ ticketKey, user }: { ticketKey: string; user: User }) {
  const [task, setTask] = useState<AssistantTask | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const busy = task !== null;

  async function run(next: Exclude<AssistantTask, 'queue'>) {
    setTask(next); setError(''); setAnswer('');
    try { setAnswer(await ask(user, { task: next, ticketKey })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'O assistente falhou.'); }
    finally { setTask(null); }
  }

  return <Shell hint="Lê o chamado e responde em texto. Não altera nada no Jira.">
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run('summary')}>
        {task === 'summary' ? <Loader2 className="animate-spin" /> : <Sparkles />}Resumir chamado
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run('next_step')}>
        {task === 'next_step' ? <Loader2 className="animate-spin" /> : <Sparkles />}Sugerir próximo passo
      </Button>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    {answer && <Answer text={answer} />}
    {answer && <p className="mt-2 text-xs text-muted-foreground">Sugestão gerada por IA a partir do chamado. Confira antes de agir.</p>}
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
