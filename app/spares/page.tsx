'use client';
import { carrierLabel, CLOSED_SPARE_STATUSES } from '@/lib/tracking';
import { copyToClipboard } from '@/lib/clipboard';
import { openExternalUrl } from '@/lib/open-external';
import { AppNavigation } from '@/components/app-navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowDownUp,
  Box,
  CheckCircle2,
  Clock3,
  Cloud,
  CloudOff,
  ExternalLink,
  MapPin,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Truck,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/components/auth-provider';
type S = {
  id?: number;
  status: string;
  fsa: string;
  city: string;
  equipment: string;
  tracking: string;
  delivery: string;
  technician: string;
  service: string;
  note: string;
  address: string;
  supplier: string;
  source?: 'system' | 'spreadsheet' | 'csv';
  syncStatus?: 'pending' | 'synced' | 'failed';
  syncError?: string | null;
  updatedAt?: string;
  sourceOrder?: number;
  trackingStatus?: string;
  trackingCarrier?: string;
  trackingCheckedAt?: string;
};

type SpareForm = {
  ticketKey: string;
  status: string;
  city: string;
  equipment: string;
  trackingCode: string;
  expectedDelivery: string;
  technician: string;
  expectedService: string;
  note: string;
  address: string;
  supplier: string;
};

const EMPTY_FORM: SpareForm = {
  ticketKey: '',
  status: 'PENDENTE',
  city: '',
  equipment: '',
  trackingCode: '',
  expectedDelivery: '',
  technician: '',
  expectedService: '',
  note: '',
  address: '',
  supplier: 'DELFIA',
};
// Status consultado na TrackingMore, que GET /api/spares anexa a cada spare.
function trackingFields(
  value: unknown,
): Pick<S, 'trackingStatus' | 'trackingCarrier' | 'trackingCheckedAt'> {
  if (!value || typeof value !== 'object') return {};
  const tracking = value as Record<string, unknown>;
  return {
    trackingStatus:
      typeof tracking.status === 'string' ? tracking.status : undefined,
    trackingCarrier:
      typeof tracking.carrier === 'string'
        ? carrierLabel(tracking.carrier)
        : undefined,
    trackingCheckedAt:
      typeof tracking.updatedAt === 'string' ? tracking.updatedAt : undefined,
  };
}

const SPARES_COPY_URL =
  'https://cajutechsolucoesemimformati.sharepoint.com/:x:/r/sites/CAJUTECH-SOLUCOESEMIMFORMATICA441/_layouts/15/doc2.aspx?sourcedoc=%7BBA726016-2EAF-40CD-B3E3-50C4D507FBF7%7D&file=CAJU%20TECH%20-%20Envio%20de%20Equipamentos%20-%20AMERICANAS%20-%20Copiar.xlsx&action=default';
type SyncConfiguration = {
  push: boolean;
  pushOriginal: boolean;
  pushTargets: number;
  pull: boolean;
};
function parse(t: string) {
  const a: string[][] = [];
  let r: string[] = [],
    v = '',
    q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') {
      if (q && t[i + 1] === '"') {
        v += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      r.push(v);
      v = '';
    } else if ((c === '\n' || c === '\r') && !q) {
      if (c === '\r' && t[i + 1] === '\n') i++;
      r.push(v);
      if (r.some((x) => x.trim())) a.push(r);
      r = [];
      v = '';
    } else v += c;
  }
  return a;
}
const c = (x = '') => x.trim().replace(/\s+/g, ' '),
  done = [...CLOSED_SPARE_STATUSES] as string[];
export default function Page() {
  const { user } = useAuth();
  const detailRef = useRef<HTMLElement>(null);
  const [all, setAll] = useState<S[]>([]),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('ATIVOS'),
    [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest'),
    [selected, setSelected] = useState<S | null>(null),
    [menu, setMenu] = useState(false);
  const [tab, setTab] = useState('list');
  const [form, setForm] = useState<SpareForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const [sync, setSync] = useState<SyncConfiguration>({
    push: false,
    pushOriginal: false,
    pushTargets: 0,
    pull: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const csvResponse = await fetch('/data/spares.csv', {
          signal: controller.signal,
        });
        if (!csvResponse.ok)
          throw new Error('Não foi possível carregar a lista de spares.');
        const t = await csvResponse.text();
        const csvRows = parse(t)
          .slice(3)
          .map((r, sourceOrder) => ({
            status: c(r[0]) || 'SEM STATUS',
            fsa: c(r[1]),
            city: c(r[2]),
            equipment: c(r[3]),
            tracking: c(r[4]),
            delivery: c(r[5]),
            technician: c(r[6]),
            service: c(r[7]),
            note: c(r[8]),
            address: c(r[9]),
            supplier: c(r[10]),
            source: 'csv' as const,
            sourceOrder,
          }))
          .reverse();
        let databaseRows: S[] = [];
        if (user) {
          const response = await fetch('/api/spares', {
            headers: { Authorization: `Bearer ${await user.getIdToken()}` },
            cache: 'no-store',
            signal: controller.signal,
          });
          if (response.ok) {
            const body = (await response.json()) as {
              items?: Array<Record<string, unknown>>;
              sync?: {
                push?: boolean;
                pushOriginal?: boolean;
                pushTargets?: number;
                pull?: boolean;
              };
            };
            setSync({
              push: Boolean(body.sync?.push),
              pushOriginal: Boolean(body.sync?.pushOriginal),
              pushTargets: Number(body.sync?.pushTargets ?? 0),
              pull: Boolean(body.sync?.pull),
            });
            databaseRows = (body.items ?? []).map((row) => ({
              id: Number(row.id),
              status: String(row.status ?? 'PENDENTE'),
              fsa: String(row.ticketKey ?? '').replace(/^FSA-/i, ''),
              city: String(row.city ?? ''),
              equipment: String(row.equipment ?? ''),
              tracking: String(row.trackingCode ?? ''),
              delivery: String(row.expectedDelivery ?? ''),
              technician: String(row.technician ?? ''),
              service: String(row.expectedService ?? ''),
              note: String(row.note ?? ''),
              address: String(row.address ?? ''),
              supplier: String(row.supplier ?? ''),
              source: row.source === 'spreadsheet' ? 'spreadsheet' : 'system',
              syncStatus: row.syncStatus as S['syncStatus'],
              syncError:
                typeof row.syncError === 'string' ? row.syncError : null,
              updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
              ...trackingFields(row.tracking),
            }));
          }
        }
        if (!controller.signal.aborted) {
          const localKeys = new Set(
            databaseRows.map((row) =>
              `${row.fsa}|${row.equipment}|${row.tracking}`.toUpperCase(),
            ),
          );
          const merged = [
            ...databaseRows,
            ...csvRows.filter(
              (row) =>
                !localKeys.has(
                  `${row.fsa}|${row.equipment}|${row.tracking}`.toUpperCase(),
                ),
            ),
          ];
          setAll(merged);
          setSelected((current) => current ?? merged[0] ?? null);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar os spares.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt, user]);

  async function saveSpare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/spares', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const body = (await response.json()) as {
        item?: Record<string, unknown>;
        error?: string;
        sync?: {
          push?: boolean;
          pushOriginal?: boolean;
          pushTargets?: number;
          pull?: boolean;
        };
        tracking?: {
          configured: boolean;
          status?: string;
          expectedAt?: string | null;
          error?: string;
        } | null;
      };
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível cadastrar o spare.');
      const synced = body.item?.syncStatus === 'synced';
      setSync({
        push: Boolean(body.sync?.push),
        pushOriginal: Boolean(body.sync?.pushOriginal),
        pushTargets: Number(body.sync?.pushTargets ?? 0),
        pull: Boolean(body.sync?.pull),
      });
      const tracking = body.tracking;
      const trackingText = !tracking
        ? ''
        : !tracking.configured
          ? ' A consulta automática de rastreio ainda não foi configurada.'
          : tracking.error
            ? ` Rastreio não consultado: ${tracking.error}`
            : ` Rastreio: ${tracking.status}${tracking.expectedAt ? `, previsão ${tracking.expectedAt.split('-').reverse().join('/')}` : ''}.`;
      setNotice(
        `${
          synced
            ? 'Spare cadastrado e enviado para a planilha.'
            : 'Spare cadastrado no sistema. A sincronização ficará pendente até o conector da planilha ser configurado.'
        }${trackingText}`,
      );
      setForm(EMPTY_FORM);
      setAttempt((value) => value + 1);
      setTab('list');
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível cadastrar o spare.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function synchronize() {
    if (!user || syncing) return;
    setSyncing(true);
    setNotice('');
    try {
      const response = await fetch('/api/spares/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const body = (await response.json()) as {
        imported?: number;
        sent?: number;
        errors?: string[];
        warnings?: string[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          body.error || 'Não foi possível sincronizar a planilha.',
        );
      const summary = `${body.imported ?? 0} registro(s) lido(s) e ${body.sent ?? 0} enviado(s).`;
      // A truncated read used to report "concluída" while half the spreadsheet
      // was missing, which is how FSA-132148 stayed invisible. Say it plainly.
      setNotice(
        body.warnings?.length
          ? `Sincronização incompleta: ${summary} ${body.warnings.join(' ')}`
          : body.errors?.length
            ? `${summary} Pendências: ${body.errors.join(' ')}`
            : `Sincronização concluída: ${summary}`,
      );
      setAttempt((value) => value + 1);
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível sincronizar a planilha.',
      );
    } finally {
      setSyncing(false);
    }
  }

  async function openWorkbook(url: string) {
    if ((await openExternalUrl(url)) === 'opened') return;
    const copied = await copyToClipboard(url).catch(() => false);
    setNotice(
      copied
        ? 'O aplicativo não abre a planilha diretamente. O link foi copiado: cole no navegador.'
        : 'O aplicativo não abre a planilha diretamente. Abra a planilha compartilhada pelo navegador.',
    );
  }
  function openLinkedTicket(spare: S) {
    const ticketKey = spare.fsa.trim().toUpperCase().replace(/^FSA-?/, 'FSA-');
    if (!/^FSA-\d+$/.test(ticketKey)) {
      setNotice('Este spare não possui uma FSA válida para abrir o chamado.');
      return;
    }
    const linkedSpare = {
      ticketKey,
      status: spare.status,
      city: spare.city,
      equipment: spare.equipment,
      tracking: spare.tracking,
      delivery: spare.delivery,
      technician: spare.technician,
      service: spare.service,
      note: spare.note,
      address: spare.address,
      supplier: spare.supplier,
      updatedAt: spare.updatedAt ?? '',
      source: spare.source ?? 'csv',
    };
    sessionStorage.setItem(`caju-linked-spare:${ticketKey}`, JSON.stringify(linkedSpare));
    window.location.assign(`/?view=tickets&ticket=${encodeURIComponent(ticketKey)}`);
  }
  const syncConfigured = sync.push || sync.pull;
  const syncBidirectional = sync.push && sync.pull;
  const active = all.filter((x) => !done.includes(x.status));
  const baseRows =
    filter === 'ATIVOS'
      ? active
      : filter === 'TODOS'
        ? all
        : all.filter((x) => x.status === filter);
  const normalizedQuery = query.toLowerCase();
  const rows = baseRows
    .filter((x) =>
      [x.fsa, x.city, x.equipment, x.technician, x.tracking].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    )
    .sort((a, b) => {
      const stamp = (item: S) => {
        const value = item.updatedAt || item.service || item.delivery;
        const parsed = value ? Date.parse(value) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : item.sourceOrder ?? 0;
      };
      return sortOrder === 'newest' ? stamp(b) - stamp(a) : stamp(a) - stamp(b);
    });
  const n = (s: string[]) => active.filter((x) => s.includes(x.status)).length;
  return (
    <main className="min-h-screen text-foreground">
      <AppNavigation active="spares" open={menu} onOpenChange={setMenu} />
      <section className="app-content">
        <header className="sticky top-0 z-20 flex h-[68px] items-center border-b border-border bg-background/90 px-4 backdrop-blur-xl lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Abrir menu"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <Menu />
          </Button>
          <button
            type="button"
            onClick={() => window.location.assign('/?view=overview')}
            className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"
          >
            <ArrowLeft className="size-4" />
            Operação
          </button>
          <Badge
            variant="outline"
            className="ml-auto border-primary/25 bg-primary/10 text-primary"
          >
            {syncConfigured ? (
              <Cloud aria-hidden="true" className="mr-1 size-3" />
            ) : (
              <CloudOff aria-hidden="true" className="mr-1 size-3" />
            )}
            {all.length} itens
          </Badge>
        </header>
        <div
          id="main-content"
          tabIndex={-1}
          className="app-main mx-auto max-w-[1600px] px-4 pt-4 pb-36 lg:px-8 lg:pt-8"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Peças e equipamentos
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Central de Spares</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhamento do pedido à entrega e ao atendimento técnico.
          </p>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(String(value))}
            className="mt-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList
                aria-label="Seções da Central de Spares"
                className="w-full sm:w-auto"
              >
                <TabsTrigger value="list" className="min-h-11 flex-1 px-3 sm:flex-none sm:px-4">
                  <Box aria-hidden="true" />
                  <span className="sm:hidden">Acompanhar</span>
                  <span className="hidden sm:inline">Acompanhar spares</span>
                </TabsTrigger>
                <TabsTrigger value="create" className="min-h-11 flex-1 px-3 sm:flex-none sm:px-4">
                  <Plus aria-hidden="true" />
                  <span className="sm:hidden">Cadastrar</span>
                  <span className="hidden sm:inline">Cadastrar novo spare</span>
                </TabsTrigger>
              </TabsList>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void openWorkbook(SPARES_COPY_URL)}
                >
                  <ExternalLink aria-hidden="true" /> Abrir planilha compartilhada
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void synchronize()}
                  disabled={syncing || !sync.push}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={syncing ? 'animate-spin' : ''}
                  />
                  {syncing ? 'Sincronizando...' : 'Sincronizar planilha'}
                </Button>
              </div>
            </div>
            {notice && (
              <output className="mt-4 block rounded-xl border border-primary/20 bg-primary/8 p-4 text-sm text-foreground">
                {notice}
              </output>
            )}
            {syncConfigured && !syncBidirectional && (
              <div className="mt-4 flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm text-amber-100">
                <CloudOff
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <p>
                  O envio do sistema para a planilha compartilhada está ativo.
                  A importação automática de alterações feitas diretamente no
                  Excel ainda depende do fluxo HTTP de leitura do Power
                  Automate. O botão de sincronização manual continua disponível
                  para reenviar os cadastros pendentes.
                </p>
              </div>
            )}
            {!syncConfigured && (
              <div className="mt-4 flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm text-amber-100">
                <CloudOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <p>
                  O cadastro no sistema está disponível, mas o conector do
                  Power Automate ainda não foi configurado neste Worker.
                </p>
              </div>
            )}
            <TabsContent value="list">
              <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Card t="Pendentes" v={n(['PENDENTE'])} i={Clock3} />
                <Card
                  t="Em trânsito"
                  v={n(['ENVIADO', 'COMPRADO', 'DIRECIONADO'])}
                  i={Truck}
                />
                <Card
                  t="Recebidos / agendados"
                  v={n(['RECEBIDO', 'AGENDADO'])}
                  i={PackageCheck}
                />
                <Card
                  t="Sem rastreio"
                  v={active.filter((x) => !x.tracking).length}
                  i={Box}
                />
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,.6fr)]">
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="border-b border-border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Buscar spare por chamado, cidade, equipamento ou técnico"
                        placeholder="Buscar FSA, cidade, equipamento ou técnico..."
                      />
                    </div>
                    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-muted-foreground">
                      <ArrowDownUp aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      <span className="sr-only">Ordenar registros</span>
                      <select aria-label="Ordenar spares por data" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none">
                        <option value="newest">Mais recentes</option>
                        <option value="oldest">Mais antigos</option>
                      </select>
                    </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        'ATIVOS',
                        'PENDENTE',
                        'ENVIADO',
                        'RECEBIDO',
                        'AGENDADO',
                        'TODOS',
                      ].map((x) => (
                        <Button
                          size="sm"
                          variant={filter === x ? 'secondary' : 'ghost'}
                          aria-pressed={filter === x}
                          onClick={() => setFilter(x)}
                          key={x}
                        >
                          {x}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-[55dvh] overflow-auto xl:max-h-[610px]">
                    {loading && (
                      <output className="block p-8 text-center text-sm text-muted-foreground">
                        Carregando spares...
                      </output>
                    )}
                    {error && (
                      <div
                        role="alert"
                        className="space-y-3 p-6 text-sm text-amber-200"
                      >
                        <p>{error}</p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setLoading(true);
                            setError('');
                            setAttempt((value) => value + 1);
                          }}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    )}
                    {!loading && !error && !rows.length && (
                      <div className="space-y-3 p-8 text-center">
                        <p className="font-medium">Nenhum spare encontrado</p>
                        <p className="text-sm text-muted-foreground">
                          Tente outro termo ou remova os filtros.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setQuery('');
                            setFilter('TODOS');
                          }}
                        >
                          Limpar filtros
                        </Button>
                      </div>
                    )}
                    {rows.map((x, i) => (
                      <button
                        key={x.fsa + x.equipment + i}
                        aria-label={`Abrir detalhes do spare ${x.fsa ? `FSA-${x.fsa}` : x.equipment}`}
                        aria-pressed={selected === x}
                        onClick={() => {
                          setSelected(x);
                          openLinkedTicket(x);
                        }}
                        className={`grid w-full grid-cols-[1fr_auto] border-b border-border p-4 text-left hover:bg-muted/40 ${selected === x ? 'bg-primary/8' : ''}`}
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <b className="font-mono text-xs text-primary">
                              FSA-{x.fsa}
                            </b>
                            <Badge variant="outline">{x.status}</Badge>
                            {x.syncStatus === 'synced' && (
                              <Badge
                                variant="outline"
                                className="border-emerald-400/20 text-emerald-300"
                              >
                                Planilha atualizada
                              </Badge>
                            )}
                            {x.syncStatus === 'failed' && (
                              <Badge
                                variant="outline"
                                className="border-amber-400/20 text-amber-200"
                              >
                                Sincronização pendente
                              </Badge>
                            )}
                            {x.trackingStatus && (
                              <Badge
                                variant="outline"
                                className="border-sky-400/20 text-sky-200"
                              >
                                <Truck aria-hidden="true" className="size-3" />
                                {x.trackingStatus}
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {x.supplier}
                            </span>
                          </div>
                          <h3 className="mt-2 text-sm font-bold">
                            {x.equipment}
                          </h3>
                          <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                            <span className="flex gap-1">
                              <MapPin className="size-3" />
                              {x.city}
                            </span>
                            <span className="flex gap-1">
                              <UserRound className="size-3" />
                              {x.technician}
                            </span>
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
                <aside
                  ref={detailRef}
                  tabIndex={-1}
                  aria-label="Detalhes do spare"
                  className="scroll-mt-24 h-fit rounded-xl border border-border bg-card p-5 xl:sticky xl:top-[92px]"
                >
                  {selected ? (
                    <>
                      <b className="font-mono text-xs text-primary">
                        FSA-{selected.fsa}
                      </b>
                      <h2 className="mt-2 text-xl font-extrabold">
                        {selected.equipment}
                      </h2>
                      <Badge variant="outline" className="mt-3">
                        {selected.status}
                      </Badge>
                      <Button type="button" className="mt-4 w-full" onClick={() => openLinkedTicket(selected)}>
                        Abrir chamado e dados vinculados
                      </Button>
                      <div className="mt-6 space-y-4">
                        <D l="Cidade" v={selected.city} />
                        {selected.address && (
                          <D l="Endereço" v={selected.address} />
                        )}
                        <D l="Técnico responsável" v={selected.technician} />
                        <D l="Fornecedor" v={selected.supplier} />
                        <D
                          l="Código de rastreio"
                          v={selected.tracking || 'Ainda não informado'}
                        />
                        {selected.trackingStatus && (
                          <D
                            l="Status do rastreio"
                            v={`${selected.trackingStatus}${selected.trackingCarrier ? ` · ${selected.trackingCarrier}` : ''}${selected.trackingCheckedAt ? ` · consultado em ${new Date(selected.trackingCheckedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`}
                          />
                        )}
                        <D
                          l="Previsão de entrega"
                          v={selected.delivery || 'Sem previsão'}
                        />
                        <D
                          l="Atendimento"
                          v={selected.service || 'Sem agendamento'}
                        />
                        {selected.syncStatus && (
                          <D
                            l="Sincronização"
                            v={
                              selected.syncStatus === 'synced'
                                ? 'Atualizado na planilha'
                                : selected.syncStatus === 'failed'
                                  ? 'Pendente — tente sincronizar novamente'
                                  : 'Aguardando envio'
                            }
                          />
                        )}
                        {selected.note && (
                          <div className="rounded-lg border border-amber-400/20 bg-amber-400/8 p-4 text-sm">
                            {selected.note}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <Box aria-hidden="true" className="mx-auto mb-3 size-8" />
                      <p className="text-sm">
                        Selecione um spare para consultar entrega, rastreio e
                        responsável.
                      </p>
                    </div>
                  )}
                </aside>
              </div>
            </TabsContent>
            <TabsContent value="create">
              <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
                <div className="border-b border-border p-5 sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">
                    Novo registro
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Cadastrar spare
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Os campos seguem a mesma estrutura da planilha de envio de
                    equipamentos.
                  </p>
                </div>
                <form onSubmit={saveSpare} className="space-y-6 p-5 sm:p-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    <FormField
                      label="Chamado no Jira"
                      required
                      hint="Exemplo: FSA-132294"
                    >
                      <Input
                        value={form.ticketKey}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            ticketKey: event.target.value,
                          }))
                        }
                        placeholder="FSA-000000"
                        required
                        autoComplete="off"
                      />
                    </FormField>
                    <FormField label="Status" required>
                      <select
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={form.status}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            status: event.target.value,
                          }))
                        }
                      >
                        {[
                          'PENDENTE',
                          'COMPRADO',
                          'DIRECIONADO',
                          'ENVIADO',
                          'RECEBIDO',
                          'AGENDADO',
                          'FINALIZADO',
                          'INDISPONÍVEL',
                        ].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Cidade / UF" required>
                      <Input
                        value={form.city}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            city: event.target.value,
                          }))
                        }
                        placeholder="Salvador/BA"
                        required
                      />
                    </FormField>
                    <FormField label="Peça ou equipamento" required>
                      <Input
                        value={form.equipment}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            equipment: event.target.value,
                          }))
                        }
                        placeholder="SSD 240 GB"
                        required
                      />
                    </FormField>
                    <FormField label="Fornecedor" required>
                      <select
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={form.supplier}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            supplier: event.target.value,
                          }))
                        }
                      >
                        <option value="DELFIA">DELFIA</option>
                        <option value="CAJU TECH">CAJU TECH</option>
                        <option value="OUTRO">OUTRO</option>
                      </select>
                    </FormField>
                    <FormField label="Código de rastreio">
                      <Input
                        value={form.trackingCode}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            trackingCode: event.target.value,
                          }))
                        }
                        placeholder="AD000000000BR"
                      />
                    </FormField>
                    <FormField label="Previsão de entrega">
                      <Input
                        type="date"
                        value={form.expectedDelivery}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            expectedDelivery: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="Previsão de atendimento">
                      <Input
                        type="date"
                        value={form.expectedService}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            expectedService: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="Técnico responsável">
                      <Input
                        value={form.technician}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            technician: event.target.value,
                          }))
                        }
                        placeholder="Nome do técnico"
                      />
                    </FormField>
                    <FormField label="Endereço de entrega">
                      <Input
                        value={form.address}
                        onChange={(event) =>
                          setForm((value) => ({
                            ...value,
                            address: event.target.value,
                          }))
                        }
                        placeholder="Rua, número, bairro e CEP"
                      />
                    </FormField>
                  </div>
                  <FormField label="Observação">
                    <Textarea
                      className="min-h-24"
                      value={form.note}
                      onChange={(event) =>
                        setForm((value) => ({
                          ...value,
                          note: event.target.value,
                        }))
                      }
                      placeholder="Detalhes úteis para envio, recebimento ou atendimento"
                    />
                  </FormField>
                  <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setForm(EMPTY_FORM);
                        setTab('list');
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={saving || !user}>
                      {saving ? (
                        <RefreshCw
                          aria-hidden="true"
                          className="animate-spin"
                        />
                      ) : (
                        <CheckCircle2 aria-hidden="true" />
                      )}
                      {saving ? 'Salvando...' : 'Cadastrar spare'}
                    </Button>
                  </div>
                </form>
              </section>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </main>
  );
}
function Card({ t, v, i: I }: { t: string; v: number; i: typeof Box }) {
  return (
    <div className="cockpit-stat metric-glow rounded-2xl p-4">
      <div className="flex justify-between text-sm text-muted-foreground">
        {t}
        <I className="size-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{v}</p>
    </div>
  );
}
function D({ l, v }: { l: string; v: string }) {
  return (
    <div className="border-b border-border pb-3">
      <p className="text-xs font-bold uppercase text-muted-foreground">{l}</p>
      <p className="mt-1 text-sm font-semibold">{v}</p>
    </div>
  );
}

function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-baseline justify-between gap-3 text-sm font-semibold">
        <span>
          {label}
          {required && (
            <span className="ml-1 text-primary" aria-hidden="true">
              *
            </span>
          )}
        </span>
        {hint && (
          <span className="text-xs font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
