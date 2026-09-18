import { and, desc, eq, gte, inArray, like, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { activeAttendances, activeAttendanceTickets, operationalAudit, operationalTasks, operationalWorkflows, shipmentTracking, spares, technicianReviews, technicians, whatsappConversations, whatsappMessages } from '@/db/schema';
import { onlyDate, operationDateTime, queueContext, redact, statusLabel, ticketContext } from '@/lib/assistant';
import { MAX_ROWS, parseSchedule } from '@/lib/assistant-tools';
import { COVERAGE_RADIUS_KM, coverageFor, coverageText } from '@/lib/coverage';
import { geocodeCity } from '@/lib/server/geocode';
import { loadTechnicianDirectory } from '@/lib/server/technician-directory';
import { bulkIneligibleReason, isBulkEligible, MAX_BULK_TICKETS } from '@/lib/bulk-actions';
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
      ? history.map((row) => `${operationDateTime(row.createdAt)} · ${redact(row.actorEmail)}: ${row.action}`)
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
    historico: rows.map((row) => redact(`${operationDateTime(row.createdAt)} · ${row.ticketKey} · ${row.actorEmail}: ${row.action}`)),
  };
}

const WHATSAPP_ROWS = 30;
// Mensagem longa vira parágrafo inteiro no contexto; o que importa é o teor.
const WHATSAPP_CHARS = 400;

// Conversa de WhatsApp. É o dado mais sensível que sai daqui: mensagem de
// cliente e de técnico, indo para um serviço externo. Por isso entra com três
// cortes — janela de tempo, quantidade e tamanho — e tudo passa por `redact()`,
// que mascara telefone, documento e e-mail. Mídia não vai: só o tipo.
async function consultarWhatsapp(args: Args) {
  const ticket = text(args, 'chamado')?.toUpperCase();
  const contact = text(args, 'contato')?.toLowerCase();
  const hours = count(args, 'horas', 24, 24 * 30);
  const limit = count(args, 'quantidade', 20, WHATSAPP_ROWS);
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const db = getDb();

  // A FSA não fica na mensagem, e sim na conversa: primeiro descobre de quem
  // é a conversa daquele chamado.
  let phones: string[] = [];
  if (ticket) {
    const conversas = await db.select({ contactPhone: whatsappConversations.contactPhone })
      .from(whatsappConversations).where(eq(whatsappConversations.ticketKey, ticket)).limit(10).all();
    if (!conversas.length) return { total: 0, mensagens: `Nenhuma conversa de WhatsApp ligada a ${ticket}.` };
    phones = conversas.map((row) => row.contactPhone);
  }

  const conditions = [
    gte(whatsappMessages.occurredAt, since),
    phones.length ? inArray(whatsappMessages.contactPhone, phones) : undefined,
    contact ? like(whatsappMessages.contactName, `%${contact}%`) : undefined,
    // "status" é recibo de entrega, não conversa.
    inArray(whatsappMessages.direction, ['incoming', 'outgoing']),
  ].filter(Boolean);

  const rows = await db.select({
    contactName: whatsappMessages.contactName, direction: whatsappMessages.direction,
    messageType: whatsappMessages.messageType, body: whatsappMessages.body,
    senderEmail: whatsappMessages.senderEmail, occurredAt: whatsappMessages.occurredAt,
    deletedAt: whatsappMessages.deletedAt,
  }).from(whatsappMessages).where(and(...conditions))
    .orderBy(desc(whatsappMessages.occurredAt)).limit(limit).all();
  if (!rows.length) return { total: 0, mensagens: `Nenhuma mensagem nas últimas ${hours} horas com esse filtro.` };

  return {
    total: rows.length,
    periodo: `últimas ${hours} horas`,
    // Da mais antiga para a mais nova, que é como se lê uma conversa.
    mensagens: rows.reverse().map((row) => {
      const quem = row.direction === 'outgoing'
        ? `nós${row.senderEmail ? ` (${row.senderEmail.split('@')[0]})` : ''}`
        : row.contactName || 'contato';
      const conteudo = row.deletedAt ? '[apagada]'
        : row.messageType !== 'text' ? `[${row.messageType}]`
        : (row.body ?? '').slice(0, WHATSAPP_CHARS);
      return redact(`${operationDateTime(row.occurredAt)} · ${quem}: ${conteudo}`);
    }),
  };
}

const ATTENDANCE_ROWS = 30;

// "Quais FSAs já têm grupo criado no WhatsApp?" não tinha resposta: o grupo
// nasce com o atendimento (`active_attendances.whatsapp_group_name`), e as FSAs
// ficam na tabela de tickets do atendimento — nenhuma consulta olhava ali.
async function consultarAtendimentos(args: Args) {
  const ticket = text(args, 'chamado')?.toUpperCase();
  const situation = text(args, 'situacao') ?? 'em_andamento';
  const onlyWithGroup = args.com_grupo === true;
  const db = getDb();

  const attendances = await db.select({
    id: activeAttendances.id, ownerEmail: activeAttendances.ownerEmail,
    whatsappGroupName: activeAttendances.whatsappGroupName, phase: activeAttendances.phase,
    startedAt: activeAttendances.startedAt, endedAt: activeAttendances.endedAt,
  }).from(activeAttendances).orderBy(desc(activeAttendances.startedAt)).limit(120).all();

  const tickets = await db.select({
    attendanceId: activeAttendanceTickets.attendanceId, ticketKey: activeAttendanceTickets.ticketKey,
    city: activeAttendanceTickets.city,
  }).from(activeAttendanceTickets).all();
  const byAttendance = new Map<number, string[]>();
  for (const row of tickets) {
    byAttendance.set(row.attendanceId, [...(byAttendance.get(row.attendanceId) ?? []), row.ticketKey]);
  }

  const filtradas = attendances
    .filter((row) => situation === 'todos' || (situation === 'encerrados' ? row.endedAt : !row.endedAt))
    .filter((row) => !onlyWithGroup || Boolean(row.whatsappGroupName?.trim()))
    .filter((row) => !ticket || (byAttendance.get(row.id) ?? []).includes(ticket));
  if (!filtradas.length) return { total: 0, atendimentos: 'Nenhum atendimento encontrado com esse filtro.' };

  const comGrupo = filtradas.filter((row) => row.whatsappGroupName?.trim());
  return {
    total: filtradas.length,
    com_grupo_de_whatsapp: comGrupo.length,
    fsas_com_grupo: [...new Set(comGrupo.flatMap((row) => byAttendance.get(row.id) ?? []))],
    atendimentos: filtradas.slice(0, ATTENDANCE_ROWS).map((row) => redact([
      (byAttendance.get(row.id) ?? []).join(', ') || 'sem FSA',
      row.whatsappGroupName?.trim() ? `grupo "${row.whatsappGroupName.trim()}"` : 'sem grupo de WhatsApp',
      `com ${row.ownerEmail}`,
      `início ${operationDateTime(row.startedAt) ?? '-'}`,
      row.endedAt ? `encerrado ${operationDateTime(row.endedAt)}` : 'em andamento',
    ].join(' · '))),
  };
}

// Prepara o agendamento — e só. Nada aqui escreve no Jira: a confirmação, com
// a escolha do técnico, acontece na tela, no mesmo diálogo de sempre. Quem
// agenda continua sendo uma pessoa (WORKFLOW_RULES, regras 1 e 2).
async function prepararAgendamento(args: Args) {
  const when = parseSchedule(args.data_hora, new Date());
  if ('erro' in when) return when;
  const asked = keys(args);
  if (!asked.length) return { erro: 'Diga quais chamados agendar.' };

  const found = await searchJiraIssues({ keys: asked, maxResults: asked.length });
  const byKey = new Map(found.issues.map((issue) => [issue.key, issue]));
  const prontos: string[] = [];
  const recusados: string[] = [];
  for (const key of asked) {
    const issue = byKey.get(key);
    if (!issue) { recusados.push(`${key}: não encontrado no Jira`); continue; }
    if (isBulkEligible(issue.status, 'scheduled')) prontos.push(key);
    else recusados.push(`${key}: ${bulkIneligibleReason(issue.status, 'scheduled')} (está em ${statusLabel(issue.status)})`);
  }
  // O lote da tela tem teto próprio; avisar antes evita a pessoa confirmar e
  // receber o corte só depois.
  const acima = prontos.length > MAX_BULK_TICKETS;
  return {
    quando: when.at.replace('T', ' '),
    prontos,
    total_pronto: prontos.length,
    recusados: recusados.length ? recusados : 'nenhum',
    // A tela lê isto para abrir o diálogo já preenchido.
    acao: prontos.length ? { tipo: 'agendar', chamados: prontos.slice(0, MAX_BULK_TICKETS), quando: when.at } : null,
    aviso: acima ? `A tela agenda no máximo ${MAX_BULK_TICKETS} por vez; os primeiros ${MAX_BULK_TICKETS} vão no lote.` : undefined,
    instrucao_para_voce: prontos.length
      ? 'Diga quantos estão prontos e quais foram recusados e por quê. Avise que a pessoa confirma na tela, escolhendo o técnico — você não agenda.'
      : 'Nenhum pode ser agendado. Explique o motivo de cada um.',
  };
}

// Quantas cidades por pergunta. Cada uma que ainda não esteja em cache custa
// uma ida ao Nominatim, cuja política pede parcimônia.
const COVERAGE_CITIES = 10;

// Cobertura por cidade: a mesma conta da tela do mapa, para várias cidades de
// uma vez. O trabalho que isso substitui era abrir a busca uma vez por cidade
// e mandar um print de cada no WhatsApp.
async function consultarCobertura(args: Args, origin: string) {
  const pedidas = Array.isArray(args.cidades)
    ? [...new Set(args.cidades.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, COVERAGE_CITIES)
    : [];
  if (!pedidas.length) return { erro: 'Diga quais cidades conferir.' };
  const radius = count(args, 'raio_km', COVERAGE_RADIUS_KM, 300);

  const technicians = await loadTechnicianDirectory(origin);
  const blocos: string[] = [];
  const naoEncontradas: string[] = [];
  // Sequencial de propósito: o Nominatim pede uma consulta por vez.
  for (const cidade of pedidas) {
    const place = await geocodeCity(cidade).catch(() => null);
    if (!place) { naoEncontradas.push(cidade); continue; }
    // O rótulo do geocode vem como "Cidade, Estado"; o estado importa para
    // separar quem está na cidade de quem está numa homônima.
    const [nome, estado] = place.label.split(',').map((part) => part.trim());
    const coverage = coverageFor(
      { city: nome || cidade, uf: (estado ?? '').slice(0, 2).toUpperCase(), lat: place.lat, lng: place.lng },
      technicians,
      radius,
    );
    blocos.push(coverageText(coverage, radius));
  }
  if (!blocos.length) return { erro: `Nenhuma cidade encontrada: ${naoEncontradas.join(', ')}.` };
  return {
    raio_km: radius,
    cobertura: blocos,
    cidades_nao_encontradas: naoEncontradas.length ? naoEncontradas : 'nenhuma',
    instrucao_para_voce: 'Repasse a cobertura cidade por cidade, com os nomes e as distâncias como vieram. Não invente técnico nem distância.',
  };
}

const TOOLS: Record<string, (args: Args) => Promise<unknown>> = {
  consultar_chamados: consultarChamados,
  detalhar_chamado: detalharChamado,
  consultar_tecnicos: consultarTecnicos,
  resumo_operacao: resumoOperacao,
  consultar_spares: consultarSpares,
  consultar_whatsapp: consultarWhatsapp,
  consultar_atendimentos: consultarAtendimentos,
  preparar_agendamento: prepararAgendamento,
  consultar_historico: consultarHistorico,
};

// `canReadWhatsapp` é checado aqui também, e não só na hora de declarar as
// consultas: se o modelo pedir a conversa mesmo assim, a porta continua
// fechada.
export function assistantToolRunner(options: { canReadWhatsapp: boolean; origin: string }) {
  return async function runAssistantTool(name: string, args: Args): Promise<unknown> {
    if (name === 'consultar_whatsapp' && !options.canReadWhatsapp) {
      return { erro: 'Quem perguntou não tem acesso ao WhatsApp no Caju OS.' };
    }
    // A cobertura precisa saber de onde buscar o diretório de técnicos, que é
    // um arquivo servido pelo próprio app.
    if (name === 'consultar_cobertura') return consultarCobertura(args, options.origin);
    const tool = TOOLS[name];
    if (!tool) return { erro: `Consulta desconhecida: ${name}.` };
    return tool(args);
  };
}

