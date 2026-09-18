import { and, desc, eq, gte, inArray, like, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { operationalAudit, operationalTasks, operationalWorkflows, shipmentTracking, spares, technicianReviews, technicians } from '@/db/schema';
import { onlyDate, queueContext, redact, ticketContext } from '@/lib/assistant';
import { MAX_ROWS } from '@/lib/assistant-tools';
import { toAssistantIssue } from '@/lib/server/assistant-issue';
import { getJiraIssue, searchJiraIssues } from '@/lib/server/jira';

// Executa o que o assistente geral pediu. Cada função aqui é SOMENTE LEITURA.
//
// Duas regras valem para tudo que sai daqui, porque este texto vai para o
// Google:
// 1. Nada de dado pessoal. As consultas nem selecionam documento, telefone,
//    endereço ou chave PIX (WORKFLOW_RULES, regra 9), e o que sobra ainda
//    passa por `redact()`.
// 2. Nada de lista infinita. Resultado grande enche o contexto e o modelo
//    volta a errar contagem, que foi o problema da fila de 60.

const AUDIT_ROWS = 40;
const TECHNICIAN_ROWS = 40;
const TASK_ROWS = 20;

type Args = Record<string, unknown>;

function text(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function count(args: Args, key: string, fallback: number, max: number): number {
  const value = Number(args[key]);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), max) : fallback;
}

function keys(args: Args): string[] {
  const value = args.chamados;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.toUpperCase().trim()))].slice(0, 30);
}

async function consultarChamados(args: Args) {
  const asked = keys(args);
  const limit = count(args, 'quantidade', MAX_ROWS, MAX_ROWS);
  const result = asked.length
    ? await searchJiraIssues({ keys: asked, maxResults: Math.max(asked.length, 1), withAttachments: true })
    : await searchJiraIssues({ status: text(args, 'status'), query: text(args, 'busca'), maxResults: limit, withAttachments: true });
  if (!result.issues.length) return { total: 0, chamados: 'Nenhum chamado encontrado com esse filtro.' };
  // `queueContext` já é o formato validado em produção: tabela, rótulo de
  // status da tela e as contagens de hoje e ontem prontas.
  return { total: result.issues.length, chamados: queueContext(result.issues, limit) };
}

async function detalharChamado(args: Args) {
  const key = text(args, 'chamado');
  if (!key) return { erro: 'Informe a FSA do chamado.' };
  const issue = await getJiraIssue(key);
  const history = await getDb().select({ action: operationalAudit.action, actorEmail: operationalAudit.actorEmail, createdAt: operationalAudit.createdAt })
    .from(operationalAudit).where(eq(operationalAudit.ticketKey, issue.key))
    .orderBy(desc(operationalAudit.createdAt)).limit(10).all();
  return {
    chamado: ticketContext(toAssistantIssue(issue)),
    historico: history.length
      ? history.map((row) => `${row.createdAt} · ${redact(row.actorEmail)}: ${row.action}`)
      : 'Sem registro de auditoria para este chamado.',
  };
}

async function consultarTecnicos(args: Args) {
  const city = text(args, 'cidade');
  const state = text(args, 'estado');
  const search = text(args, 'busca');
  const db = getDb();
  // Só colunas que a operação pode ver: nome, base, disponibilidade e
  // habilidades. Documento, telefone, endereço e PIX não entram na consulta.
  const conditions = [
    city ? or(like(technicians.baseCity, `%${city}%`), like(technicians.extraCities, `%${city}%`)) : undefined,
    state ? eq(technicians.baseState, state.toUpperCase()) : undefined,
    search ? or(like(technicians.name, `%${search}%`), like(technicians.specialties, `%${search}%`)) : undefined,
  ].filter(Boolean);
  const rows = await db.select({
    id: technicians.id, name: technicians.name, baseCity: technicians.baseCity, baseState: technicians.baseState,
    extraCities: technicians.extraCities, status: technicians.status, approved: technicians.approved,
    specialties: technicians.specialties, availableTools: technicians.availableTools,
    hasVehicle: technicians.hasVehicle, vehicleType: technicians.vehicleType,
  }).from(technicians).where(conditions.length ? and(...conditions) : undefined).limit(TECHNICIAN_ROWS).all();
  if (!rows.length) return { total: 0, tecnicos: 'Nenhum técnico encontrado com esse filtro.' };

  const ratings = await db.select({
    technicianId: technicianReviews.technicianId,
    media: sql<number>`avg(${technicianReviews.rating})`,
    avaliacoes: sql<number>`count(*)`,
  }).from(technicianReviews).where(inArray(technicianReviews.technicianId, rows.map((row) => row.id)))
    .groupBy(technicianReviews.technicianId).all().catch(() => []);
  const byTechnician = new Map(ratings.map((row) => [row.technicianId, row]));

  return {
    total: rows.length,
    tecnicos: rows.map((row) => {
      const rating = byTechnician.get(row.id);
      return redact([
        row.name,
        `${row.baseCity}/${row.baseState}`,
        row.extraCities ? `também atende: ${row.extraCities}` : '',
        row.approved ? row.status : 'não aprovado',
        row.specialties ? `especialidades: ${row.specialties}` : '',
        row.availableTools ? `ferramentas: ${row.availableTools}` : '',
        row.hasVehicle ? `veículo: ${row.vehicleType || row.hasVehicle}` : '',
        rating ? `nota ${rating.media.toFixed(1)} em ${rating.avaliacoes} avaliações` : 'sem avaliação',
      ].filter(Boolean).join(' · '));
    }),
  };
}

const CLOSED = ['archived', 'resolved', 'cancelled', 'validated'];

async function resumoOperacao() {
  const db = getDb();
  const now = Date.now();
  const [workflows, tasks, shipments] = await Promise.all([
    db.select({ status: operationalWorkflows.status, clientValueCents: operationalWorkflows.clientValueCents, payoutCents: operationalWorkflows.payoutCents, partsValueCents: operationalWorkflows.partsValueCents }).from(operationalWorkflows).all(),
    db.select({ title: operationalTasks.title, status: operationalTasks.status, assignedTo: operationalTasks.assignedTo, acceptedBy: operationalTasks.acceptedBy, dueAt: operationalTasks.dueAt, ticketKey: operationalTasks.ticketKey }).from(operationalTasks)
      .where(inArray(operationalTasks.status, ['open', 'accepted', 'in_progress'])).limit(TASK_ROWS).all(),
    db.select({ ticketKey: shipmentTracking.ticketKey, trackingCode: shipmentTracking.trackingCode, status: shipmentTracking.status, expectedAt: shipmentTracking.expectedAt }).from(shipmentTracking).all(),
  ]);

  const open = workflows.filter((row) => !CLOSED.includes(row.status));
  const byStage = new Map<string, number>();
  for (const row of open) byStage.set(row.status, (byStage.get(row.status) ?? 0) + 1);
  const money = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const late = shipments.filter((row) => {
    const expected = Date.parse(row.expectedAt ?? '');
    return Number.isFinite(expected) && expected < now && !/entregue|recebido/i.test(row.status);
  });

  return {
    chamados_em_operacao: open.length,
    por_etapa: [...byStage].map(([stage, total]) => `${stage}: ${total}`),
    valor_cliente_em_aberto: money(open.reduce((sum, row) => sum + (row.clientValueCents ?? 0), 0)),
    custo_em_aberto: money(open.reduce((sum, row) => sum + (row.payoutCents ?? 0) + (row.partsValueCents ?? 0), 0)),
    tarefas_em_aberto: tasks.length,
    tarefas: tasks.map((task) => redact([
      task.ticketKey ? `${task.ticketKey}:` : '',
      task.title,
      `(${task.status})`,
      task.acceptedBy || task.assignedTo ? `com ${task.acceptedBy || task.assignedTo}` : 'sem responsável',
      task.dueAt && Date.parse(task.dueAt) < now ? 'VENCIDA' : '',
    ].filter(Boolean).join(' '))),
    spares_a_caminho: shipments.length - late.length,
    spares_atrasados: late.map((row) => `${row.ticketKey} · ${row.trackingCode} · previsto ${onlyDate(row.expectedAt) ?? '-'} · ${row.status}`),
  };
}

const SPARE_ROWS = 40;

// Peça pedida e entrega são duas tabelas: `spares` guarda o pedido (equipamento,
// fornecedor, previsão) e `shipment_tracking` guarda o que a transportadora
// respondeu. Quem pergunta "esse spare chegou?" quer as duas coisas juntas.
async function consultarSpares(args: Args) {
  const ticket = text(args, 'chamado')?.toUpperCase();
  const search = text(args, 'busca')?.toLowerCase();
  const situation = text(args, 'situacao') ?? 'todos';
  const db = getDb();
  const now = Date.now();
  const [pedidos, entregas] = await Promise.all([
    db.select({
      ticketKey: spares.ticketKey, equipment: spares.equipment, supplier: spares.supplier,
      status: spares.status, trackingCode: spares.trackingCode, expectedDelivery: spares.expectedDelivery,
      city: spares.city, expectedService: spares.expectedService,
    }).from(spares).where(ticket ? eq(spares.ticketKey, ticket) : undefined).limit(200).all(),
    db.select({
      ticketKey: shipmentTracking.ticketKey, trackingCode: shipmentTracking.trackingCode,
      carrier: shipmentTracking.carrier, status: shipmentTracking.status,
      lastEvent: shipmentTracking.lastEvent, expectedAt: shipmentTracking.expectedAt,
    }).from(shipmentTracking).where(ticket ? eq(shipmentTracking.ticketKey, ticket) : undefined).limit(200).all(),
  ]);

  const byTracking = new Map(entregas.filter((row) => row.trackingCode).map((row) => [row.trackingCode, row]));
  const byTicket = new Map(entregas.map((row) => [row.ticketKey, row]));
  const delivered = (status: string) => /entregue|recebido/i.test(status);

  const linhas = pedidos.map((pedido) => {
    const entrega = (pedido.trackingCode && byTracking.get(pedido.trackingCode)) || byTicket.get(pedido.ticketKey);
    const previsto = entrega?.expectedAt ?? pedido.expectedDelivery;
    const prazo = Date.parse(previsto ?? '');
    const situacaoReal = entrega && delivered(entrega.status) ? 'entregue'
      : Number.isFinite(prazo) && prazo < now ? 'atrasado'
      : 'a caminho';
    return {
      situacaoReal,
      texto: redact([
        pedido.ticketKey,
        pedido.equipment,
        pedido.city,
        `fornecedor ${pedido.supplier}`,
        `pedido ${pedido.status}`,
        pedido.trackingCode ? `rastreio ${pedido.trackingCode}` : 'sem rastreio',
        entrega?.carrier ? `por ${entrega.carrier}` : '',
        previsto ? `previsto ${onlyDate(previsto)}` : 'sem previsão',
        entrega ? `transportadora diz "${entrega.status}"` : '',
        entrega?.lastEvent ? `último evento: ${entrega.lastEvent}` : '',
        situacaoReal === 'atrasado' ? 'ATRASADO' : '',
      ].filter(Boolean).join(' · ')),
    };
  });

  const alvo = situation === 'entregues' ? ['entregue']
    : situation === 'a_caminho' ? ['a caminho']
    : situation === 'atrasados' ? ['atrasado']
    : ['entregue', 'a caminho', 'atrasado'];
  const filtradas = linhas
    .filter((linha) => alvo.includes(linha.situacaoReal))
    .filter((linha) => !search || linha.texto.toLowerCase().includes(search));
  if (!filtradas.length) return { total: 0, spares: 'Nenhuma peça encontrada com esse filtro.' };
  return {
    total: filtradas.length,
    entregues: linhas.filter((linha) => linha.situacaoReal === 'entregue').length,
    a_caminho: linhas.filter((linha) => linha.situacaoReal === 'a caminho').length,
    atrasados: linhas.filter((linha) => linha.situacaoReal === 'atrasado').length,
    spares: filtradas.slice(0, SPARE_ROWS).map((linha) => linha.texto),
  };
}

async function consultarHistorico(args: Args) {
  const ticket = text(args, 'chamado');
  const person = text(args, 'pessoa');
  const hours = count(args, 'horas', 24, 24 * 30);
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const conditions = [
    gte(operationalAudit.createdAt, since),
    ticket ? eq(operationalAudit.ticketKey, ticket.toUpperCase()) : undefined,
    person ? like(operationalAudit.actorEmail, `%${person}%`) : undefined,
  ].filter(Boolean);
  const rows = await getDb().select({
    ticketKey: operationalAudit.ticketKey, action: operationalAudit.action,
    actorEmail: operationalAudit.actorEmail, createdAt: operationalAudit.createdAt,
  }).from(operationalAudit).where(and(...conditions))
    .orderBy(desc(operationalAudit.createdAt)).limit(AUDIT_ROWS).all();
  if (!rows.length) return { total: 0, historico: `Nenhuma ação registrada nas últimas ${hours} horas com esse filtro.` };
  return {
    total: rows.length,
    periodo: `últimas ${hours} horas`,
    historico: rows.map((row) => redact(`${row.createdAt} · ${row.ticketKey} · ${row.actorEmail}: ${row.action}`)),
  };
}

const TOOLS: Record<string, (args: Args) => Promise<unknown>> = {
  consultar_chamados: consultarChamados,
  detalhar_chamado: detalharChamado,
  consultar_tecnicos: consultarTecnicos,
  resumo_operacao: resumoOperacao,
  consultar_spares: consultarSpares,
  consultar_historico: consultarHistorico,
};

export async function runAssistantTool(name: string, args: Args): Promise<unknown> {
  const tool = TOOLS[name];
  if (!tool) return { erro: `Consulta desconhecida: ${name}.` };
  return tool(args);
}

