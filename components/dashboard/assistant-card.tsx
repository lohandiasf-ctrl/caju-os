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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Assistente Caju IA</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${busy ? 'animate-pulse bg-primary' : 'bg-success'}`} />
          {busy ? 'Pensando…' : 'Disponível'}
        </span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-5 text-center">
        <span aria-hidden="true" className={`assistant-orb ${busy ? 'assistant-orb--thinking' : ''}`}><span className="assistant-orb__glint" /></span>
        <p className="mt-5 text-sm font-semibold text-primary">Como posso ajudar?</p>
        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">Pergunte sobre chamados, técnicos, peças ou repasses.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {suggestions.map(([Icon, label]) => (
            <button key={label} type="button" onClick={() => setQuestion(label)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground hover:border-primary/40 hover:bg-primary-soft hover:text-foreground max-sm:min-h-11">
              <Icon aria-hidden="true" className="size-3" strokeWidth={2} />{label}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 rounded-full border border-border bg-muted/60 p-1.5 pl-4 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/25">
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
        <button type="submit" disabled={question.trim().length < 3} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 text-xs font-semibold text-brand-foreground hover:brightness-110 disabled:opacity-50 max-sm:h-11">
          Enviar<ArrowUp aria-hidden="true" className="size-3.5" />
        </button>
      </form>
      {voiceError && <p role="alert" className="mt-2 px-2 text-xs text-danger">{voiceError}</p>}
    </div>
  );
}
