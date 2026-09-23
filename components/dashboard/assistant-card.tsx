'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUp, CalendarClock, CircleDollarSign, Sparkles, TriangleAlert } from 'lucide-react';
import { VoiceInputButton } from '@/components/voice-input-button';
import { ASSISTANT_ASK_EVENT, ASSISTANT_BUSY_EVENT } from '@/lib/assistant-events';

const suggestions = [
  [TriangleAlert, 'Chamados atrasados hoje'],
  [CalendarClock, 'Agenda de amanhã'],
  [CircleDollarSign, 'Pendências financeiras'],
] as const;

/**
 * Porta de entrada compacta para o assistente que já existe (FloatingAssistant).
 * Não tem lógica própria: a pergunta vai por evento e a conversa abre na
 * janela do assistente, com o mesmo histórico, ferramentas e erros.
 */
export function AssistantCard() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  useEffect(() => {
    const onBusy = (event: Event) => setBusy(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(ASSISTANT_BUSY_EVENT, onBusy);
    return () => window.removeEventListener(ASSISTANT_BUSY_EVENT, onBusy);
  }, []);

  function ask(text: string) {
    const clean = text.trim();
    if (clean.length < 3) return;
    window.dispatchEvent(new CustomEvent(ASSISTANT_ASK_EVENT, { detail: clean }));
    setQuestion('');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(question);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`assistant-mark ${busy ? 'assistant-mark--thinking' : ''}`}><Sparkles className="size-[18px]" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug">Assistente Caju IA</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Pergunte sobre chamados, técnicos, peças ou repasses.</p>
        </div>
        <output className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${busy ? 'bg-primary' : 'bg-success'}`} />
          {busy ? 'Pensando…' : 'Disponível'}
        </output>
      </div>
      <div className="flex-1 py-4">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sugestões</p>
        <ul className="-mx-2 space-y-0.5">
          {suggestions.map(([Icon, label]) => (
            <li key={label}>
              <button type="button" onClick={() => setQuestion(label)} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-foreground transition-colors hover:bg-muted max-sm:min-h-11">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />{label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 rounded-lg border border-input bg-(--surface-field) p-1 pl-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <label htmlFor="bento-assistant-question" className="sr-only">Pergunta para a IA</label>
        <input
          id="bento-assistant-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Pergunte algo…"
          maxLength={400}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <VoiceInputButton
          onText={(text) => { setVoiceError(''); setQuestion((current) => (current.trim() ? `${current.trim()} ${text}` : text).slice(0, 400)); }}
          onError={setVoiceError}
        />
        <button type="submit" disabled={question.trim().length < 3} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground transition-colors hover:bg-(--brand-strong) disabled:opacity-50 max-sm:h-11">
          Enviar<ArrowUp aria-hidden="true" className="size-3.5" />
        </button>
      </form>
      {voiceError && <p role="alert" className="mt-2 px-2 text-xs text-danger">{voiceError}</p>}
    </div>
  );
}
