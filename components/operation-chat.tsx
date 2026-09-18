'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_QUESTION_LENGTH, splitTicketKeys } from '@/lib/assistant';
import { HISTORY_TURNS, type ChatTurn } from '@/lib/assistant-tools';

// Conversa com o assistente, no lugar onde antes havia a busca por padrões
// fixos. A busca antiga só entendia o que estava pré-programado ("quantos
// chamados para amanhã"); esta aceita qualquer pergunta e consulta o sistema
// para responder.
//
// O painel da direita continua o mesmo de antes: os chamados citados viram
// lista com seleção, porque é dela que saem as ações em lote.

type ChatTicket = { id: string; title: string; status: string; schedule?: string; city: string };

type Message = ChatTurn & { used?: string[]; failed?: boolean };

const EXAMPLES = [
  'quantos chamados caíram hoje?',
  'quem atende em Itabuna?',
  'quais chamados estão em campo sem evidência?',
  'como está a operação agora?',
];

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
  const thread = useRef<HTMLDivElement>(null);

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
            className="mt-4 min-h-40 flex-1 space-y-3 overflow-y-auto rounded-xl border border-border bg-background/50 p-3 lg:max-h-96"
          >
            {!messages.length && !busy && (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                Nenhuma pergunta ainda. Comece por uma das sugestões abaixo.
              </p>
            )}
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-primary/15 text-foreground'
                      : message.failed
                        ? 'border border-red-400/25 bg-red-400/10 text-red-200'
                        : 'border border-border bg-card'
                  }`}
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
                          className="inline rounded font-semibold text-violet-300 underline decoration-violet-300/40 underline-offset-2 transition hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >{part.text}</button>
                      : <span key={position}>{part.text}</span>)
                    : message.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />Consultando o sistema...
                </div>
              </div>
            )}
          </div>

          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => { event.preventDefault(); void send(question); }}
          >
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={MAX_QUESTION_LENGTH}
              placeholder='Ex: "quantos chamados caíram hoje?"'
              aria-label="Perguntar sobre a operação"
              className="min-h-11 min-w-0 flex-1 bg-background/80"
              disabled={busy}
            />
            <Button type="submit" className="h-11" disabled={busy || question.trim().length < 3}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Perguntar
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Button
                key={example}
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void send(example)}
                /* Em 375px a pergunta mais longa passava da tela: no celular
                   ela quebra em duas linhas. */
                className="h-auto max-w-full whitespace-normal text-left sm:whitespace-nowrap"
              >
                {example}
              </Button>
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
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${selectedKeys.has(ticket.id) ? 'border-primary/60 bg-primary/15' : 'border-border bg-background/60 hover:border-primary/40 hover:bg-primary/8'}`}
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
