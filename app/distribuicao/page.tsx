'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, Loader2, Menu, RefreshCw, Send } from 'lucide-react';
import { AppNavigation } from '@/components/app-navigation';
import { useAuth } from '@/components/auth-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColleaguesPanel } from '@/components/user-menu';

// Painel da distribuição de chamados por WhatsApp (docs/DISPATCH_WHATSAPP.md).
// Mostra cada oferta com a mensagem exatamente como o técnico leria, os
// motivos das retidas e o status dos templates na Meta. Em dry_run é aqui que
// se confere tudo antes de ligar o envio de verdade.

type Offer = {
  id: number; status: 'held' | 'open' | 'assigned' | 'expired' | 'cancelled'; mode: string;
  storeKey: string; storeName: string | null; city: string | null;
  createdAt: string; expiresAt: string; assignedAt: string | null; assignedTo: string | null;
  holdReasons: string[]; tickets: string[]; recipients: { name: string; status: string }[]; preview: string | null;
};
type Template = { name: string; status: string; category?: string; rejected_reason?: string };

const MODE_LABEL: Record<string, string> = {
  off: 'Desligada', dry_run: 'Simulação (nada é enviado)', allowlist: 'Só números de teste', live: 'Enviando aos técnicos',
};
const STATUS: Record<Offer['status'], [string, string]> = {
  held: ['Retida', 'border-warning/30 bg-warning-soft text-warning'],
  open: ['Aberta', 'border-primary/30 text-primary'],
  assigned: ['Aceita', 'border-success/30 bg-success-soft text-success'],
  expired: ['Expirou', 'text-muted-foreground'],
  cancelled: ['Cancelada', 'text-muted-foreground'],
};
// O que aconteceu com a mensagem de cada técnico (status da Meta pelo webhook).
const DELIVERY: Record<string, string> = {
  pending: 'aguardando envio', sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou',
  skipped: 'fora da lista de teste', simulated: 'simulado', clicked: 'aceitou', declined: 'recusou',
};
const TEMPLATE_STATUS: Record<string, string> = { APPROVED: 'Aprovado', PENDING: 'Em análise', REJECTED: 'Recusado', PAUSED: 'Pausado', DISABLED: 'Desativado' };

const when = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

export default function DistribuicaoPage() {
  const { user, role } = useAuth();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<string>('off');
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [expected, setExpected] = useState<string[]>([]);
  const [templatesError, setTemplatesError] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [testing, setTesting] = useState(false);
  const [testNotice, setTestNotice] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [resending, setResending] = useState<number | null>(null);
  const gerencia = role === 'gerencia';

  const load = useCallback(async () => {
    if (!user) return;
    const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
    setError('');
    const [offersRes, templatesRes] = await Promise.all([
      fetch('/api/dispatch/offers', { headers, cache: 'no-store' }),
      gerencia ? fetch('/api/dispatch/templates', { headers, cache: 'no-store' }) : Promise.resolve(null),
    ]);
    const offersBody = await offersRes.json().catch(() => ({})) as { mode?: string; offers?: Offer[]; error?: string };
    if (!offersRes.ok) setError(offersBody.error ?? 'Não foi possível carregar as ofertas.');
    else { setMode(offersBody.mode ?? 'off'); setOffers(offersBody.offers ?? []); }
    if (templatesRes) {
      const body = await templatesRes.json().catch(() => ({})) as { templates?: Template[]; expected?: string[]; error?: string };
      if (templatesRes.ok) { setTemplates(body.templates ?? []); setExpected(body.expected ?? []); setTemplatesError(''); } else setTemplatesError(body.error ?? 'Não foi possível consultar os templates.');
    }
  }, [user, gerencia]);

  useEffect(() => { void load(); }, [load]);

  async function submitTemplates() {
    if (!user || sending) return;
    setSending(true);
    setNotice('');
    try {
      const response = await fetch('/api/dispatch/templates', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const body = await response.json().catch(() => ({})) as { results?: { name: string; status: string; error?: string }[]; error?: string };
      if (!response.ok) setNotice(body.error ?? 'A Meta não aceitou o envio.');
      else setNotice((body.results ?? []).map((r) => `${r.name}: ${r.error ? `erro — ${r.error}` : TEMPLATE_STATUS[r.status] ?? r.status}`).join(' · '));
      await load();
    } finally {
      setSending(false);
    }
  }

  // Oferta fictícia só para os números de teste: confere o caminho inteiro
  // (mensagem, botão, aceite, avisos) sem esperar um chamado novo.
  async function sendTest() {
    if (!user || testing) return;
    setTesting(true);
    setTestNotice('');
    try {
      const response = await fetch('/api/dispatch/test', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const body = await response.json().catch(() => ({})) as { sent?: number; failed?: number; reason?: string; error?: string };
      if (!response.ok) setTestNotice(body.error ?? 'Não foi possível enviar o teste.');
      else if (!body.sent) setTestNotice(`A Meta recusou o envio${body.reason ? `: ${body.reason}` : '.'}`);
      else setTestNotice(`Teste enviado para ${body.sent} ${body.sent === 1 ? 'número' : 'números'}. Toque em "Aceitar" no WhatsApp.`);
      await load();
    } finally {
      setTesting(false);
    }
  }

  // Reenviar: cancela a oferta que ninguém aceitou e manda uma nova para os
  // mesmos chamados, com prazo novo.
  async function resend(offer: Offer) {
    if (!user || resending !== null) return;
    if (!window.confirm(`Reenviar ${offer.tickets.join(', ')}? A oferta atual é cancelada e sai uma nova para os técnicos.`)) return;
    setResending(offer.id);
    setTestNotice('');
    try {
      const response = await fetch(`/api/dispatch/offers/${offer.id}/resend`, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const body = await response.json().catch(() => ({})) as { status?: string; sent?: number; reason?: string; error?: string };
      if (!response.ok) setTestNotice(body.error ?? 'Não foi possível reenviar.');
      else if (body.status === 'held') setTestNotice('Nova oferta criada, mas retida: veja o motivo na lista.');
      else if (mode === 'dry_run') setTestNotice('Nova oferta criada como simulação (nada foi enviado).');
      else if (!body.sent) setTestNotice(`Nova oferta criada, mas nenhuma mensagem saiu${body.reason ? `: ${body.reason}` : ' (ninguém da lista de teste nesta cidade).'}`);
      else setTestNotice(`Reenviado para ${body.sent} ${body.sent === 1 ? 'técnico' : 'técnicos'}.`);
      await load();
    } finally {
      setResending(null);
    }
  }

  const missing = templates === null ? [] : expected.filter((name) => !templates.some((t) => t.name === name));
  const missingTemplates = missing.length > 0;

  return <main className="min-h-screen text-foreground">
    <AppNavigation active="dispatch" open={menu} onOpenChange={setMenu} />
    <ColleaguesPanel />
    <section className="app-content">
      <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><Menu /></Button>
        <a href="/?view=overview" className="hidden items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:flex"><ArrowLeft className="size-4" />Operação</a>
        <div className="ml-auto flex items-center gap-2"><ThemeToggle /></div>
      </header>
      <div id="main-content" tabIndex={-1} className="app-main mx-auto max-w-[1200px] px-4 pt-6 pb-36 sm:px-6 lg:px-8 lg:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-eyebrow">Comunicação</p>
            <h1 className="page-title">Distribuição</h1>
            <p className="page-subtitle">Chamados novos oferecidos pelo WhatsApp aos técnicos da cidade. O primeiro que aceita fica com o atendimento.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={mode === 'live' ? 'border-success/30 text-success' : undefined}>{MODE_LABEL[mode] ?? mode}</Badge>
            {gerencia && <Button size="sm" variant="outline" onClick={() => void sendTest()} disabled={testing}>{testing ? <Loader2 className="animate-spin" /> : <Send />}Enviar oferta de teste</Button>}
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw />Atualizar</Button>
          </div>
        </div>

        {testNotice && <p aria-live="polite" className="mt-4 rounded-xl border border-border p-3 text-sm">{testNotice}</p>}
        {error &&<div role="alert" className="mt-6 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">{error}</div>}

        {gerencia && (
          <article className="surface-panel mt-6 rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Mensagens aprovadas pela Meta</h2>
                <p className="mt-1 text-xs text-muted-foreground">A oferta só pode sair com um modelo aprovado. O texto fica no código do Caju OS.</p>
              </div>
              {(missingTemplates || templates?.some((t) => t.status === 'REJECTED')) && (
                <Button size="sm" onClick={() => void submitTemplates()} disabled={sending}>{sending ? <Loader2 className="animate-spin" /> : <Send />}Enviar para aprovação</Button>
              )}
            </div>
            {templatesError ? <p className="mt-3 text-sm text-danger">{templatesError}</p> : templates === null ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Consultando a Meta…</p>
            ) : templates.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <li key={t.name} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <span className="font-mono text-xs">{t.name}{t.category === 'MARKETING' ? <span className="ml-2 font-sans text-warning">Marketing: entrega limitada</span> : t.category === 'UTILITY' ? <span className="ml-2 font-sans text-muted-foreground">Utilidade</span> : null}</span>
                    <Badge variant="outline" className={t.status === 'APPROVED' ? 'border-success/30 text-success' : t.status === 'REJECTED' ? 'border-danger/30 text-danger' : undefined}>
                      {t.status === 'APPROVED' ? <CheckCircle2 /> : t.status === 'REJECTED' ? <CircleAlert /> : <Clock3 />}{TEMPLATE_STATUS[t.status] ?? t.status}
                    </Badge>
                    {t.rejected_reason && t.rejected_reason !== 'NONE' && <span className="text-xs text-danger">{t.rejected_reason}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-muted-foreground">Nenhum modelo enviado ainda.</p>}
            {missingTemplates && <p className="mt-3 text-xs text-muted-foreground">Ainda não enviados: {missing.join(', ')}</p>}
            {notice && <p aria-live="polite" className="mt-3 text-xs text-muted-foreground">{notice}</p>}
          </article>
        )}

        <h2 className="mt-8 text-[15px] font-semibold">Ofertas recentes</h2>
        {offers === null && !error ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</p>
        ) : offers && !offers.length ? (
          <div className="surface-panel mt-3 rounded-2xl p-6 text-sm text-muted-foreground">
            {mode === 'off' ? 'A distribuição está desligada. Nenhuma oferta é criada.' : 'Nenhum chamado novo entrou desde que a distribuição foi ligada. A rodada passa a cada 10 minutos.'}
          </div>
        ) : (
          <ul className="mt-3 grid gap-3">
            {(offers ?? []).map((o) => {
              const [label, tone] = STATUS[o.status];
              const expanded = open === o.id;
              return (
                <li key={o.id} className="surface-panel rounded-2xl p-4">
                  <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left" onClick={() => setOpen(expanded ? null : o.id)} aria-expanded={expanded}>
                    <Badge variant="outline" className={tone}>{label}</Badge>
                    <span className="font-semibold">{o.storeKey}{o.city ? ` · ${o.city}` : ''}</span>
                    <span className="font-mono text-xs text-primary">{o.tickets.join(', ')}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{when(o.createdAt)}{o.mode === 'dry_run' ? ' · simulação' : o.mode === 'test' ? ' · teste' : ''}</span>
                  </button>
                  {!!o.holdReasons.length && <p className="mt-2 text-xs text-warning">{o.holdReasons.join(' · ')}</p>}
                  {o.assignedTo && <p className="mt-2 text-xs text-success">Aceita por {o.assignedTo}{o.assignedAt ? ` em ${when(o.assignedAt)}` : ''}</p>}
                  {o.status !== 'assigned' && o.status !== 'cancelled' && (
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={() => void resend(o)} disabled={resending !== null}>
                        {resending === o.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}Reenviar
                      </Button>
                    </div>
                  )}
                  {expanded && (
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">Mensagem que o técnico recebe</p>
                        <pre className="whitespace-pre-wrap rounded-xl border border-border bg-card-elevated p-3 font-sans text-sm leading-relaxed">{o.preview ?? '—'}</pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">{o.recipients.length ? `Destinatários (${o.recipients.length})` : 'Destinatários'}</p>
                        {o.recipients.length ? (
                          <ul className="rounded-xl border border-border text-sm">
                            {o.recipients.map((r) => <li key={r.name} className="flex justify-between gap-2 border-b border-border px-3 py-2 last:border-0"><span>{r.name}</span><span className="text-xs text-muted-foreground">{DELIVERY[r.status] ?? r.status}</span></li>)}
                          </ul>
                        ) : <p className="text-sm text-muted-foreground">Ninguém: a oferta está retida.</p>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  </main>;
}
