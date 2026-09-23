'use client';

import { useId, useState, type FormEvent } from 'react';
import { Loader2, MessageSquareText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TICKET_UPDATE_MAX, ticketUpdateError } from '@/lib/ticket-update';

/**
 * "Atualizar chamado": uma nota curta sobre o que aconteceu no atendimento
 * (ex.: o técnico adoeceu). Vai para os comentários internos do Jira,
 * assinada com o nome e sobrenome de quem escreveu.
 */
export function TicketUpdateNote({ ticketKey, user }: {
  ticketKey: string;
  user: { getIdToken: () => Promise<string> } | null;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ author: string; at: string } | null>(null);
  const fieldId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = ticketUpdateError(text);
    setError(problem ?? '');
    setSent(null);
    if (problem || !user) return;
    setSending(true);
    try {
      const response = await fetch(`/api/jira/issues/${encodeURIComponent(ticketKey)}/updates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; author?: string; createdAt?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar a atualização no Jira.');
      setText('');
      setSent({ author: payload.author ?? '', at: payload.createdAt ?? new Date().toISOString() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a atualização no Jira.');
    } finally {
      setSending(false);
    }
  }

  const remaining = TICKET_UPDATE_MAX - text.length;
  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-xl border border-border bg-card-elevated p-3" noValidate>
      <label htmlFor={fieldId} className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareText aria-hidden="true" className="size-4 text-muted-foreground" />
        Atualizar chamado
      </label>
      <p id={`${fieldId}-hint`} className="mt-0.5 text-xs text-muted-foreground">
        Conte o que aconteceu no atendimento. Vai para os comentários internos do Jira, assinado com seu nome e sobrenome.
      </p>
      <Textarea
        id={fieldId}
        value={text}
        onChange={(event) => { setText(event.target.value); if (error) setError(''); if (sent) setSent(null); }}
        placeholder="Ex.: técnico adoeceu e não vai ao atendimento hoje; reagendar com a loja para amanhã."
        maxLength={TICKET_UPDATE_MAX}
        rows={3}
        aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ''}`}
        aria-invalid={Boolean(error)}
        className="mt-2 min-h-20 resize-y text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs tabular-nums ${remaining < 100 ? 'text-warning' : 'text-muted-foreground'}`}>{remaining} caracteres restantes</span>
        <Button type="submit" size="sm" disabled={sending || !text.trim()} aria-busy={sending || undefined}>
          {sending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
          {sending ? 'Enviando…' : 'Enviar atualização'}
        </Button>
      </div>
      {error && <p id={`${fieldId}-error`} role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      {sent && (
        <output className="mt-2 block text-xs text-success">
          Atualização registrada nos comentários internos do Jira{sent.author ? `, assinada por ${sent.author}` : ''}.
        </output>
      )}
    </form>
  );
}
