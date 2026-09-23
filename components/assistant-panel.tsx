'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, SendHorizontal, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_QUESTION_LENGTH, sanitizeFinalAnswer, splitTicketKeys, type AssistantTask } from '@/lib/assistant';
import { ASSISTANT_ASK_EVENT, ASSISTANT_BUSY_EVENT } from '@/lib/assistant-events';
import { VoiceInputButton } from '@/components/voice-input-button';

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
// sistema até saber responder via Workers AI. O histórico recente dá contexto
// para perguntas de continuação.
async function askGeneral(
  user: User,
  question: string,
  history?: Array<{ role: 'user' | 'assistant'; text: string }>,
) {
  if (!user) throw new Error('Sessão expirada. Entre de novo.');
  const response = await fetch('/api/assistant/ask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
  const payload = await response.json() as {
    answer?: string;
    error?: string;
    code?: string;
    prepared?: PreparedAction | null;
    used?: string[];
    model?: string;
  };
  if (!response.ok || !payload.answer) throw new Error(payload.error || 'O assistente não respondeu.');
  return {
    answer: payload.answer,
    prepared: payload.prepared ?? null,
    used: payload.used ?? [],
    model: payload.model ?? '',
  };
}

// Com `onOpenTicket`, cada FSA citada vira botão que abre o chamado.
// Higieniza contra qualquer resquício de tags de ferramentas para proteger a tela.
function Answer({ text, onOpenTicket }: { text: string; onOpenTicket?: (ticketKey: string) => void }) {
  const clean = sanitizeFinalAnswer(text);
  return <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-background/70 p-3 text-sm leading-relaxed">
    {onOpenTicket
      ? splitTicketKeys(clean).map((part, index) => part.ticketKey
        ? <button
            key={index}
            type="button"
            onClick={() => onOpenTicket(part.ticketKey!)}
            aria-label={`Abrir chamado ${part.ticketKey}`}
            className="inline rounded font-semibold text-violet-300 underline decoration-violet-300/40 underline-offset-2 transition hover:text-violet-200 hover:decoration-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >{part.text}</button>
        : <span key={index}>{part.text}</span>)
      : clean}
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
    try { setAnswer((await askGeneral(user, question)).answer); }
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

const TOOL_LABELS: Record<string, string> = {
  consultar_chamados: 'Chamados',
  detalhar_chamado: 'Detalhes do chamado',
  consultar_tecnicos: 'Técnicos',
  consultar_cobertura: 'Cobertura',
  simular_repasse: 'Simulação de repasse',
  consultar_repasses: 'Repasses',
  consultar_historico_local: 'Histórico permanente',
  consultar_catalogo_pecas: 'Catálogo de peças',
  consultar_spares: 'Spares e rastreio',
  resumo_operacao: 'Resumo operacional',
  consultar_whatsapp: 'WhatsApp',
  consultar_atendimentos: 'Atendimentos',
  consultar_tarefas: 'Tarefas',
  consultar_financas: 'Finanças',
  consultar_financeiro_jira: 'Financeiro Jira',
  consultar_lojas: 'Lojas',
  consultar_projetos: 'Projetos',
  consultar_colaboradores: 'Colaboradores',
  consultar_feedback: 'Feedback',
  consultar_bilhetes: 'Bilhetes',
  consultar_historico: 'Auditoria',
  preparar_agendamento: 'Agendamento',
  preparar_mensagem_whatsapp: 'Mensagem WhatsApp',
};

type ChatMessageItem = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  used?: string[];
  prepared?: PreparedAction | null;
  error?: string;
};

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
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    if (messages.length || busy) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, busy]);

  // O card do assistente no dashboard pergunta por evento: abre esta janela
  // e envia pelo mesmo `submit`. O estado "pensando" volta para o orb do card.
  const submitRef = useRef<(text?: string) => Promise<void>>(async () => undefined);
  useEffect(() => {
    const onAsk = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      setOpen(true);
      if (typeof text === 'string') void submitRef.current(text);
    };
    window.addEventListener(ASSISTANT_ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASSISTANT_ASK_EVENT, onAsk);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(ASSISTANT_BUSY_EVENT, { detail: busy }));
  }, [busy]);

  async function submit(textToAsk?: string) {
    const text = (textToAsk ?? question).trim();
    if (busy || text.length < 3) return;
    setBusy(true);
    setQuestion('');

    const userMsg: ChatMessageItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };

    // Monta o histórico das rodadas anteriores com sucesso para contexto
    const historyPayload = messages
      .filter((m) => !m.error && m.text.trim())
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await askGeneral(user, text, historyPayload);
      const assistantMsg: ChatMessageItem = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: result.answer,
        used: result.used,
        prepared: result.prepared,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (reason) {
      const errorMsg = reason instanceof Error ? reason.message : 'O assistente falhou.';
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', text: '', error: errorMsg },
      ]);
    } finally {
      setBusy(false);
    }
  }

  submitRef.current = submit;

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
          className="flex h-[min(36rem,calc(100dvh-2rem))] w-[min(26rem,calc(100dvw-2rem))] flex-col overflow-hidden rounded-[1.5rem] border border-violet-300/25 bg-card shadow-[0_24px_80px_rgba(0,0,0,.48)] backdrop-blur-md"
        >
          <header className="flex items-center gap-3 border-b border-border/70 bg-violet-400/8 px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">Caju IA</h2>
              <p className="text-xs text-muted-foreground">Consulta segura da operação</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Limpar conversa"
                title="Limpar conversa"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Fechar assistente"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-44 flex-col items-center justify-center text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-violet-400/10 text-violet-300">
                  <Sparkles className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-semibold">Como posso ajudar?</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Pergunte sobre chamados, repasses, técnicos, peças ou histórico.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['Como está a operação agora?', 'Quais chamados estão agendados?', 'Quem atende em Itabuna?'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => void submit(item)}
                      className="rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((item) => {
                if (item.role === 'user') {
                  return (
                    <div
                      key={item.id}
                      className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm"
                    >
                      {item.text}
                    </div>
                  );
                }

                const uniqueTools = item.used && item.used.length > 0
                  ? [...new Set(item.used.map((name) => TOOL_LABELS[name] || name))]
                  : [];
                const prep = item.prepared;

                return (
                  <div key={item.id} className="space-y-2">
                    {item.text && <Answer text={item.text} onOpenTicket={onOpenTicket} />}
                    {uniqueTools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/70">Consultou:</span>
                        {uniqueTools.map((label) => (
                          <span
                            key={label}
                            className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-normal text-muted-foreground"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    {prep?.tipo === 'agendar' && onPrepareSchedule && (
                      <Button
                        type="button"
                        className="min-h-11 w-full"
                        onClick={() => onPrepareSchedule(prep.chamados, prep.quando)}
                      >
                        Revisar agendamento de {prep.chamados.length}{' '}
                        {prep.chamados.length === 1 ? 'chamado' : 'chamados'}
                      </Button>
                    )}
                    {prep?.tipo === 'whatsapp' && onPrepareMessage && (
                      <Button
                        type="button"
                        className="min-h-11 w-full"
                        onClick={() => onPrepareMessage(prep)}
                      >
                        Revisar mensagem para {prep.nome}
                      </Button>
                    )}
                    {item.error && (
                      <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">
                        {item.error}
                      </p>
                    )}
                  </div>
                );
              })
            )}
            {busy && (
              <div className="flex items-center gap-2 rounded-xl bg-muted/30 p-2.5 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-violet-300" />
                <span>Consultando o sistema...</span>
              </div>
            )}
          </div>

          <form
            className="border-t border-border/70 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="floating-assistant-question" className="sr-only">
              Pergunta para a IA
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 focus-within:border-primary/70">
              <Input
                ref={inputRef}
                id="floating-assistant-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={MAX_QUESTION_LENGTH}
                disabled={busy}
                placeholder="Escreva uma pergunta..."
                className="h-10 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <VoiceInputButton
                disabled={busy}
                className="rounded-xl"
                onText={(text) => { setVoiceError(''); setQuestion((current) => (current.trim() ? `${current.trim()} ${text}` : text).slice(0, MAX_QUESTION_LENGTH)); inputRef.current?.focus(); }}
                onError={setVoiceError}
              />
              <Button
                type="submit"
                size="icon"
                className="size-10 rounded-xl"
                disabled={busy || question.trim().length < 3}
                aria-label="Enviar pergunta"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
              </Button>
            </div>
            {voiceError ? (
              <p role="alert" className="mt-2 px-1 text-[11px] text-danger">{voiceError}</p>
            ) : (
              <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                Enter envia · Microfone dita a pergunta · Clique numa FSA para abrir o chamado.
              </p>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
