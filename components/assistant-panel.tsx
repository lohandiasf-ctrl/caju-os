'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, SendHorizontal, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_QUESTION_LENGTH, splitTicketKeys, type AssistantTask } from '@/lib/assistant';

type Proposal = { id: string; description: string; kind: string; preview: Record<string, unknown> };
type PreparedAction =
  | { tipo: 'agendar'; chamados: string[]; quando: string }
  | { tipo: 'whatsapp'; contato: string; nome: string; texto: string };

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

// Assistente geral: a pergunta pode ser qualquer uma, e o servidor consulta o
// sistema até saber responder. Enquanto a chave do Gemini não estiver posta,
// `sem_chave` faz a pergunta voltar para o assistente da fila — que responde
// menos, mas responde.
async function askGeneral(user: User, question: string, fallback: Record<string, unknown>) {
  if (!user) throw new Error('Sessão expirada. Entre de novo.');
  const response = await fetch('/api/assistant/ask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const payload = await response.json() as { answer?: string; error?: string; code?: string; prepared?: PreparedAction | null };
  if (payload.code === 'sem_chave') return { answer: await ask(user, { ...fallback, task: 'queue', question }), prepared: null };
  if (!response.ok || !payload.answer) throw new Error(payload.error || 'O assistente não respondeu.');
  return { answer: payload.answer, prepared: payload.prepared ?? null };
}

// Com `onOpenTicket`, cada FSA citada vira botão que abre o chamado.
function Answer({ text, onOpenTicket }: { text: string; onOpenTicket?: (ticketKey: string) => void }) {
  return <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-background/70 p-3 text-sm leading-relaxed">
    {onOpenTicket
      ? splitTicketKeys(text).map((part, index) => part.ticketKey
        ? <button
            key={index}
            type="button"
            onClick={() => onOpenTicket(part.ticketKey!)}
            aria-label={`Abrir chamado ${part.ticketKey}`}
            className="inline rounded font-semibold text-violet-300 underline decoration-violet-300/40 underline-offset-2 transition hover:text-violet-200 hover:decoration-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >{part.text}</button>
        : <span key={index}>{part.text}</span>)
      : text}
  </div>;
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
export function QueueAssistant({ user, status, query, onOpenTicket }: { user: User; status?: string; query?: string; onOpenTicket?: (ticketKey: string) => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || question.trim().length < 3) return;
    setBusy(true); setError(''); setAnswer('');
    try { setAnswer((await askGeneral(user, question, { status, query })).answer); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'O assistente falhou.'); }
    finally { setBusy(false); }
  }

  return <Shell hint="Pergunte sobre a operação: chamados, técnicos, prazos, histórico. Ele consulta o sistema para responder.">
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={MAX_QUESTION_LENGTH}
        placeholder="Ex.: quem atende em Itabuna e está livre agora?"
        aria-label="Pergunta sobre a operação"
        className="min-h-11 min-w-0 flex-1"
        disabled={busy}
      />
      <Button type="submit" className="h-11" disabled={busy || question.trim().length < 3}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Perguntar
      </Button>
    </form>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    {answer && <Answer text={answer} onOpenTicket={onOpenTicket} />}
    {answer && <p className="mt-2 text-xs text-muted-foreground">Resposta gerada por IA a partir do que ela consultou no sistema. Toque numa FSA para abrir o chamado. Confira antes de agir.</p>}
  </Shell>;
}

// Janela própria da IA: não usa modal nem fundo desfocado, portanto a pessoa
// pode continuar navegando e trabalhando enquanto conversa.
export function FloatingAssistant({ user, onOpenTicket, onPrepareSchedule, onPrepareMessage }: {
  user: User;
  onOpenTicket?: (ticketKey: string) => void;
  onPrepareSchedule?: (ticketKeys: string[], at: string) => void;
  onPrepareMessage?: (draft: { contato: string; nome: string; texto: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function submit() {
    const text = question.trim();
    if (busy || text.length < 3) return;
    setBusy(true);
    setError('');
    setPrepared(null);
    setLastQuestion(text);
    try {
      const result = await askGeneral(user, text, { status: '', query: '' });
      setAnswer(result.answer);
      setPrepared(result.prepared);
      setQuestion('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'O assistente falhou.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-(--z-float) sm:bottom-5 sm:right-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir assistente de IA"
          className="grid size-14 place-items-center rounded-2xl border border-violet-300/35 bg-primary text-primary-foreground shadow-[0_18px_45px_rgba(0,0,0,.38)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Sparkles className="size-5" aria-hidden="true" />
        </button>
      ) : (
        <section
          aria-label="Assistente de IA"
          className="flex h-[min(34rem,calc(100dvh-2rem))] w-[min(25rem,calc(100dvw-2rem))] flex-col overflow-hidden rounded-[1.5rem] border border-violet-300/25 bg-card shadow-[0_24px_80px_rgba(0,0,0,.48)]"
        >
          <header className="flex items-center gap-3 border-b border-border/70 bg-violet-400/8 px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">Caju IA</h2>
              <p className="text-xs text-muted-foreground">Consulta segura da operação</p>
            </div>
            {!!answer && (
              <button type="button" onClick={() => { setAnswer(''); setError(''); setPrepared(null); }} className="grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Limpar conversa">
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Fechar assistente">
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!answer && !error ? (
              <div className="flex h-full min-h-44 flex-col items-center justify-center text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-violet-400/10 text-violet-300"><Sparkles className="size-5" aria-hidden="true" /></span>
                <p className="mt-3 text-sm font-semibold">Como posso ajudar?</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Pergunte sobre chamados, repasses, técnicos, peças ou histórico.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['Como está a operação agora?', 'Quais chamados estão agendados?', 'Quem atende em Itabuna?'].map((item) => (
                    <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">{lastQuestion}</div>
                {answer && <Answer text={answer} onOpenTicket={onOpenTicket} />}
                {prepared?.tipo === 'agendar' && onPrepareSchedule && (
                  <Button type="button" className="mt-3 min-h-11 w-full" onClick={() => onPrepareSchedule(prepared.chamados, prepared.quando)}>
                    Revisar agendamento de {prepared.chamados.length} {prepared.chamados.length === 1 ? 'chamado' : 'chamados'}
                  </Button>
                )}
                {prepared?.tipo === 'whatsapp' && onPrepareMessage && (
                  <Button type="button" className="mt-3 min-h-11 w-full" onClick={() => onPrepareMessage(prepared)}>
                    Revisar mensagem para {prepared.nome}
                  </Button>
                )}
                {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
              </>
            )}
            {busy && <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Consultando o sistema...</div>}
          </div>

          <form className="border-t border-border/70 p-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <label htmlFor="floating-assistant-question" className="sr-only">Pergunta para a IA</label>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 focus-within:border-primary/70">
              <Input ref={inputRef} id="floating-assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={MAX_QUESTION_LENGTH} disabled={busy} placeholder="Escreva uma pergunta..." className="h-10 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" />
              <Button type="submit" size="icon" className="size-10 rounded-xl" disabled={busy || question.trim().length < 3} aria-label="Enviar pergunta">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
              </Button>
            </div>
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">Enter envia · Clique numa FSA para abrir o chamado.</p>
          </form>
        </section>
      )}
    </div>
  );
}
