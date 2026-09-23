'use client';

import { useEffect, useState } from 'react';
import { Loader2, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Confirmação de envio de mensagem que o assistente escreveu.
//
// O texto aparece inteiro e editável: mensagem que sai para cliente ou técnico
// não deve depender de uma leitura de texto que ninguém conferiu. A pessoa lê,
// corrige se quiser, e envia — pela mesma rota da tela de conversas, que assina
// com o nome de quem enviou.
export type WhatsappDraft = { contato: string; nome: string; texto: string };

const MAX_CHARS = 4096;

export function WhatsappSendDialog({ draft, user, onClose, onSent }: {
  draft: WhatsappDraft | null;
  user: { getIdToken: () => Promise<string> } | null;
  onClose: () => void;
  onSent?: (nome: string) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setText(draft?.texto ?? '');
    setError('');
  }, [draft]);

  async function send() {
    if (!draft || !user || sending || !text.trim()) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/whatsapp/conversations/${encodeURIComponent(draft.contato)}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'O WhatsApp recusou o envio.');
      onSent?.(draft.nome);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar para {draft?.nome}</DialogTitle>
          <DialogDescription>
            Escrita pelo assistente. Leia antes de enviar — e corrija o que quiser. A mensagem sai assinada com o seu nome.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_CHARS}
          rows={9}
          aria-label="Mensagem que será enviada"
          disabled={sending}
          className="field min-h-44 w-full text-sm text-foreground"
        />
        <p className="text-xs text-muted-foreground">{text.length}/{MAX_CHARS} caracteres</p>

        {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft p-3 text-sm text-danger">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button type="button" onClick={() => void send()} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}Enviar no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
