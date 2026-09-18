'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CornerDownLeft, Loader2, Search, SendHorizontal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_QUESTION_LENGTH, splitTicketKeys } from '@/lib/assistant';
import { HISTORY_TURNS, type ChatTurn } from '@/lib/assistant-tools';
import { cn } from '@/lib/utils';

// Conversa com o assistente, no lugar onde antes havia a busca por padrões
// fixos. A busca antiga só entendia o que estava pré-programado ("quantos
// chamados para amanhã"); esta aceita qualquer pergunta e consulta o sistema.
//
// O painel da direita continua o mesmo: os chamados citados viram lista com
// seleção, porque é dela que saem as ações em lote.

type ChatTicket = { id: string; title: string; status: string; schedule?: string; city: string };

type Message = ChatTurn & { used?: string[]; failed?: boolean };

const EXAMPLES = [
  'quantos chamados caíram hoje?',
  'quem atende em Itabuna?',
  'quais chamados estão em campo sem evidência?',
  'como está a operação agora?',
];

// A caixa cresce com a pergunta em vez de rolar dentro de uma linha só: quem
// pergunta precisa enxergar o que escreveu antes de enviar.
function useGrowingTextarea(minHeight: number, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback((reset?: boolean) => {
    const field = ref.current;
    if (!field) return;
    field.style.height = `${minHeight}px`;
    if (reset) return;
    field.style.height = `${Math.max(minHeight, Math.min(field.scrollHeight, maxHeight))}px`;
  }, [minHeight, maxHeight]);
  useEffect(() => { resize(); }, [resize]);
  return { ref, resize };
}

// Os três pontos do "Consultando o sistema". A resposta demora alguns segundos
// porque o assistente vai ao Jira e ao banco; sem movimento, a tela parece
// travada.
function TypingDots() {
  return (
    <span className="ml-0.5 inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="size-1.5 rounded-full bg-primary/80"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

export function OperationChat<T extends ChatTicket>({
  tickets,
  user,
  selectedKeys,
  onToggleSelected,
  onToggleAll,
  onOpenTicket,
}: {
  tickets: T[];
  user: { getIdToken: () => Promise<string> } | null;
  selectedKeys: Set<string>;
  onToggleSelected: (ticketKey: string) => void;
  onToggleAll: (ticketKeys: string[]) => void;
  onOpenTicket: (ticket: T) => void;
}) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const { ref: field, resize } = useGrowingTextarea(56, 160);

  // A resposta nova precisa aparecer sem ninguém rolar atrás dela.
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Os chamados citados na última resposta, na ordem em que ela os citou.
  const answered = [...messages].reverse().find((message) => message.role === 'assistant' && !message.failed);
  const citedKeys = [...new Set((answered?.text.toUpperCase().match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? []))];
  const cited = citedKeys.flatMap((key) => tickets.filter((ticket) => ticket.id === key));

  async function send(text: string) {
    const asked = text.trim();
    if (busy || asked.length < 3) return;
    if (!user) {
      setMessages((current) => [...current, { role: 'assistant', text: 'Sessão expirada. Entre de novo.', failed: true }]);
      return;
    }
    // A conversa que vai junto é a que já está na tela, sem a pergunta de
    // agora — o servidor corta o resto.
    const history = messages.filter((message) => !message.failed).slice(-HISTORY_TURNS).map(({ role, text: body }) => ({ role, text: body }));
    setMessages((current) => [...current, { role: 'user', text: asked }]);
    setQuestion('');
    resize(true);
    setBusy(true);
    try {
      const response = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: asked, history }),
      });
      const payload = await response.json() as { answer?: string; error?: string; used?: string[] };
      if (!response.ok || !payload.answer) throw new Error(payload.error || 'O assistente não respondeu.');
      setMessages((current) => [...current, { role: 'assistant', text: payload.answer!, used: payload.used }]);
    } catch (reason) {
      setMessages((current) => [...current, { role: 'assistant', text: reason instanceof Error ? reason.message : 'O assistente falhou.', failed: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-panel mt-6 rounded-2xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Search className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">Pesquisar operação</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Pergunte o que quiser sobre chamados, técnicos, prazos e histórico. Ele consulta o sistema para responder.
              </p>
            </div>
          </div>

          <div
            ref={thread}
            role="log"
            aria-label="Conversa com o assistente"
            aria-live="polite"
            className="mt-4 min-h-40 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-background/40 p-3 lg:max-h-80"
          >
            {!messages.length && !busy && (
              <div className="grid h-full min-h-32 place-items-center px-4 text-center">
                <div>
                  <Sparkles className="mx-auto size-5 text-primary/60" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium">Como posso ajudar?</p>
                  <p className="mt-1 text-xs text-muted-foreground">Pergunte abaixo ou use uma das sugestões.</p>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={cn(
                      'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'bg-primary/15 text-foreground'
                        : message.failed
                          ? 'border border-red-400/25 bg-red-400/10 text-red-200'
                          : 'border border-border bg-card',
                    )}
                  >
                    {message.role === 'assistant' && !message.failed
                      ? splitTicketKeys(message.text).map((part, position) => part.ticketKey
                        ? <button
                            key={position}
                            type="button"
                            onClick={() => {
                              const ticket = tickets.find((item) => item.id === part.ticketKey);
                              if (ticket) onOpenTicket(ticket);
                            }}
                            aria-label={`Abrir chamado ${part.ticketKey}`}
                            className="inline rounded font-semibold text-primary underline decoration-primary/40 underline-offset-2 transition hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >{part.text}</button>
                        : <span key={position}>{part.text}</span>)
                      : message.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                  Consultando o sistema<TypingDots />
                </div>
              </motion.div>
            )}
          </div>

          {/* Caixa de composição: a borda acende no foco, e a barra de baixo
              separa o atalho do botão de enviar. */}
          <form
            className={cn(
              'mt-3 rounded-2xl border bg-card/60 transition-colors',
              focused ? 'border-primary/50' : 'border-border',
            )}
            onSubmit={(event) => { event.preventDefault(); void send(question); }}
          >
            <textarea
              ref={field}
              value={question}
              onChange={(event) => { setQuestion(event.target.value); resize(); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                // Enter envia; Shift+Enter quebra linha, como em qualquer chat.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(question);
                }
              }}
              maxLength={MAX_QUESTION_LENGTH}
              placeholder='Ex: "quantos chamados caíram hoje?"'
              aria-label="Perguntar sobre a operação"
              rows={1}
              disabled={busy}
              className="max-h-40 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3 py-2">
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                <CornerDownLeft className="size-3" aria-hidden="true" />
                Enter envia · Shift+Enter quebra linha
              </span>
              <span className="text-xs text-muted-foreground sm:hidden">
                {question.length ? `${question.length}/${MAX_QUESTION_LENGTH}` : 'Toque em Perguntar'}
              </span>
              <Button type="submit" size="sm" className="h-9" disabled={busy || question.trim().length < 3}>
                {busy ? <Loader2 className="animate-spin" /> : <SendHorizontal />}Perguntar
              </Button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example, index) => (
              <motion.button
                key={example}
                type="button"
                disabled={busy}
                onClick={() => void send(example)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
                /* Em 375px a pergunta mais longa passava da tela: no celular
                   ela quebra em duas linhas. */
                className="max-w-full rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:whitespace-nowrap"
              >
                {example}
              </motion.button>
            ))}
          </div>
          {answered?.used?.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Consultou: {[...new Set(answered.used)].map((name) => name.replace(/_/g, ' ')).join(', ')}. Resposta gerada por IA — confira antes de agir.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary/8 p-4 lg:w-[360px]">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Chamados citados</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">{cited.length}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {cited.length
              ? 'Da última resposta. Marque para usar nas ações em lote.'
              : citedKeys.length
                ? 'A resposta citou chamados que não estão na lista carregada desta tela.'
                : 'Os chamados que a resposta citar aparecem aqui, prontos para seleção.'}
          </p>
          {cited.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onToggleAll(cited.map((ticket) => ticket.id))}
              >
                {cited.every((ticket) => selectedKeys.has(ticket.id)) ? 'Desmarcar tudo' : 'Selecionar tudo'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {cited.filter((ticket) => selectedKeys.has(ticket.id)).length} de {cited.length} selecionados
              </span>
            </div>
          )}
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {cited.map((ticket) => (
              <div
                key={ticket.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition',
                  selectedKeys.has(ticket.id)
                    ? 'border-primary/60 bg-primary/15'
                    : 'border-border bg-background/60 hover:border-primary/40 hover:bg-primary/8',
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.has(ticket.id)}
                  onChange={() => onToggleSelected(ticket.id)}
                  aria-label={`Selecionar ${ticket.id}`}
                  className="mt-1 size-4 rounded border-border accent-primary"
                />
                <button type="button" onClick={() => onOpenTicket(ticket)} className="min-w-0 flex-1 text-left">
                  <b className="font-mono text-primary">{ticket.id}</b>
                  <span className="mt-1 block truncate">{ticket.title}</span>
                  <span className="mt-1 block truncate text-muted-foreground">
                    {[ticket.status, ticket.schedule, ticket.city].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
