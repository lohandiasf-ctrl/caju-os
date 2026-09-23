import { and, desc, eq, gte, inArray, like, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { activeAttendances, activeAttendanceTickets, appUsers, bulletinNotes, employeePresence, feedback, fsaClassifications, fsaGroups, n1TicketAssignments, operationalAudit, operationalStores, operationalTasks, operationalVisits, operationalWorkflows, partsCatalog, projects, shipmentTracking, spares, stores, technicianReviews, technicians, ticketArchives, ticketEvidence, whatsappConversations, whatsappMessages } from '@/db/schema';
import { onlyDate, operationDateTime, queueContext, redact, statusLabel, ticketContext } from '@/lib/assistant';
import { MAX_ROWS, parseSchedule } from '@/lib/assistant-tools';
import { COVERAGE_RADIUS_KM, coverageFor, coverageText } from '@/lib/coverage';
import { geocodeCity } from '@/lib/server/geocode';
import { technicianDirectory } from '@/lib/server/technician-directory';
import { bulkIneligibleReason, isBulkEligible, MAX_BULK_TICKETS } from '@/lib/bulk-actions';
import { toAssistantIssue } from '@/lib/server/assistant-issue';
import { getFinancialIssues, getJiraIssue, searchJiraIssues } from '@/lib/server/jira';
import { calcularRepasse, type Fsa } from '@/lib/fsa-payment';
import { carregarGrupo } from '@/lib/server/fsa-payment';

// Executa o que o assistente geral pediu. Cada função aqui é SOMENTE LEITURA.
//
// Duas regras valem para tudo que sai daqui, porque este texto vai para o
// modelo de IA no Workers AI:
// 1. Nada de dado pessoal. As consultas nem selecionam documento, telefone,
//    endereço ou chave PIX (WORKFLOW_RULES, regra 9), e o que sobra ainda
//    passa por `redact()`.
// 2. Nada de lista infinita. Resultado grande enche o contexto e o modelo
//    volta a errar contagem, que foi o problema da fila de 60.

const AUDIT_ROWS = 40;
const TECHNICIAN_ROWS = 40;
const TASK_ROWS = 20;

type Args = Record<string, unknown>;
type AssistantAccess = { role: string; email: string; canReadWhatsapp: boolean };

const currency = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

function validQuantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

async function simularRepasse(args: Args) {
  const atuacoes = validQuantity(args.atuacoes);
  const evidencias = validQuantity(args.evidencias);
  const improdutivas = args.improdutivas === undefined ? 0 : validQuantity(args.improdutivas);
  if (atuacoes === null || evidencias === null || improdutivas === null || improdutivas > atuacoes || atuacoes + evidencias > 100) {
    return { erro: 'Informe quantidades inteiras válidas de FSAs (0 a 100); improdutivas não podem superar atuações.' };
  }
  const fsas: Fsa[] = [
    ...Array.from({ length: atuacoes }, (_, index): Fsa => index < improdutivas
      ? { tipo: 'servico', improdutiva: true, motivo: 'problema-impeditivo' }
      : { tipo: 'servico' }),
    ...Array.from({ length: evidencias }, (): Fsa => ({ tipo: 'evidencia' })),
  ];
  const resultado = calcularRepasse(fsas);
  return {
    hipotetico: true,
    regra: 'Mesmo grupo/visita; evidência conta por FSA, não por foto. Nenhuma atuação descoberta na loja foi presumida.',
    atuacoes, evidencias, improdutivas,
    atuacoes_valor: currency(resultado.servicos.totalCents),
    evidencias_valor: currency(resultado.evidencias.totalCents),
    total: currency(resultado.totalCents),
    total_cents: resultado.totalCents,
  };
}

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

async function consultarValores(args: Args) {
  const key = text(args, 'chamado')?.toUpperCase();
  if (!key) return { erro: 'Informe a FSA do chamado.' };
  const issue = await getJiraIssue(key);
  const op = issue.operationalFields;
  return {
    chamado: key,
    titulo: issue.summary,
    loja: issue.store,
    status: issue.status,
    valor_reais: op.valorReais ?? op.valueR$ ?? 'não informado',
    valor_total_equipamentos: op.equipmentTotal ?? 'não informado',
    custo_total: op.custoTotal ?? op.cost ?? 'não informado',
    custo_visita_1: op.visitCost1 ?? 'não informado',
    custo_visita_2: op.visitCost2 ?? 'não informado',
    custos_adicionais: op.custosAdicionais ?? op.additionalCosts ?? 'não informado',
    custo_auxiliar: op.custoAuxiliar ?? 'não informado',
    total_ticket: op.ticketTotal ?? 'não informado',
    orcamento: op.orcamento ?? op.budget ?? 'não informado',
    sub_total: op.subTotal ?? 'não informado',
    detalhes_custos: op.detalhesCustos ?? 'não informado',
  };
}

async function consultarEquipamento(args: Args) {
  const key = text(args, 'chamado')?.toUpperCase();
  if (!key) return { erro: 'Informe a FSA do chamado.' };
  const issue = await getJiraIssue(key);
  const op = issue.operationalFields;

  const pecas: Record<string, number> = {};
  const pecaFields: Array<[string, string | null | undefined]> = [
    ['HD', op.hd], ['Cabo Scanner Zebra', op.caboScannerZebra],
    ['Cabo USB', op.caboUsb], ['Cabo HDMI', op.caboHdmi],
    ['Fonte Interna', op.fonteInterna], ['Tela PDV Touch', op.telaPdvTouch],
    ['Monitor Touch', op.monitorTouch], ['Bateria CMOS', op.bateriaCmos],
    ['Gabinete', op.gabinete], ['FAN', op.fan],
    ['Cabeça Impressão', op.cabecaImpressao],
  ];
  for (const [nome, valor] of pecaFields) {
    const num = Number(valor);
    if (num > 0) pecas[nome] = num;
  }

  return {
    chamado: key,
    equipamento_modelo: op.equipmentModel ?? op.equipamentoModelo ?? 'não informado',
    tipo_equipamento: op.tipoEquipamento ?? 'não informado',
    marca: op.marca ?? 'não informado',
    serial_spare_number: op.serialSpareNumber ?? op.serialNumber ?? 'não informado',
    patrimonio: op.patrimonio ?? 'não informado',
    troca_realizada: op.trocaEquipamento ?? 'não informado',
    equipamento_cmdb: op.equipamentoCmdb ?? 'não vinculado ao Assets',
    causa_raiz: op.causaRaiz ?? 'não informado',
    pecas_usadas: Object.keys(pecas).length ? pecas : 'nenhuma peça registrada',
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

async function resumoOperacao(access: AssistantAccess) {
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
  const visibleTasks = access.role === 'gerencia' || access.role === 'coordenador'
    ? tasks
    : tasks.filter((row) => [row.assignedTo, row.acceptedBy].some((email) => email?.toLowerCase() === access.email.toLowerCase()));
  const late = shipments.filter((row) => {
    const expected = Date.parse(row.expectedAt ?? '');
    return Number.isFinite(expected) && expected < now && !/entregue|recebido/i.test(row.status);
  });

  return {
    chamados_em_operacao: open.length,
    por_etapa: [...byStage].map(([stage, total]) => `${stage}: ${total}`),
    ...(access.role === 'gerencia' ? {
      valor_cliente_em_aberto: currency(open.reduce((sum, row) => sum + (row.clientValueCents ?? 0), 0)),
      custo_em_aberto: currency(open.reduce((sum, row) => sum + (row.payoutCents ?? 0) + (row.partsValueCents ?? 0), 0)),
    } : {}),
    tarefas_em_aberto: visibleTasks.length,
    tarefas: visibleTasks.map((task) => redact([
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

async function consultarRepasses(args: Args, access: AssistantAccess) {
  const groupId = args.grupo_id === undefined ? null : validQuantity(args.grupo_id);
  if (args.grupo_id !== undefined && (!groupId || groupId < 1)) return { erro: 'Identificador do grupo inválido.' };
  const ticket = text(args, 'chamado')?.toUpperCase();
  if (ticket && !/^FSA-\d+$/.test(ticket)) return { erro: 'Informe uma FSA válida.' };
  const status = text(args, 'status');
  if (status && !['aberto', 'pronto', 'aprovado', 'pago', 'bloqueado'].includes(status)) return { erro: 'Status de repasse inválido.' };
  const db = getDb();
  const groupIds = ticket
    ? await db.select({ id: fsaClassifications.groupId }).from(fsaClassifications)
      .where(eq(fsaClassifications.ticketKey, ticket)).limit(40).all()
    : [];
  if (ticket && !groupIds.length) return { total: 0, grupos: 'Nenhum grupo de repasse para essa FSA.' };
  const conditions = [
    groupId ? eq(fsaGroups.id, groupId) : undefined,
    ticket ? inArray(fsaGroups.id, groupIds.map((row) => row.id)) : undefined,
    status ? eq(fsaGroups.status, status as typeof fsaGroups.status.enumValues[number]) : undefined,
    access.role === 'gerencia' ? undefined : eq(fsaGroups.createdBy, access.email),
  ].filter(Boolean);
  const ids = await db.select({ id: fsaGroups.id }).from(fsaGroups).where(and(...conditions))
    .orderBy(desc(fsaGroups.dia), desc(fsaGroups.id)).limit(20).all();
  const loaded = await Promise.all(ids.map((row) => carregarGrupo(row.id)));
  const groups = loaded.filter((group): group is NonNullable<typeof group> => group !== null && (access.role === 'gerencia' || group.createdBy.toLowerCase() === access.email.toLowerCase()));
  return {
    total: groups.length,
    grupos: groups.length ? groups.map((group) => ({
      id: group.id, nome: group.nome, dia: group.dia, tecnico: group.tecnico, status: group.status,
      fsas: group.fsas.map((fsa) => ({ chamado: fsa.ticketKey, tipo: fsa.tipo ?? 'não classificada', improdutiva: fsa.improdutiva, revisao: fsa.revisao })),
      pendentes_de_classificacao: group.naoClassificadas,
      aguardando_revisao: group.aguardandoRevisao,
      atuacoes: group.repasse.servicos.quantidade,
      evidencias: group.repasse.evidencias.quantidade,
      valor_atuacoes: currency(group.repasse.servicos.totalCents),
      valor_evidencias: currency(group.repasse.evidencias.totalCents),
      valor_total_calculado: currency(group.repasse.totalCents),
      data_pagamento: group.dataPagamento,
    })) : 'Nenhum grupo visível para você com esse filtro.',
  };
}

async function consultarHistoricoLocal(args: Args) {
  const ticket = text(args, 'chamado')?.toUpperCase();
  if (!ticket || !/^FSA-\d+$/.test(ticket)) return { erro: 'Informe uma FSA válida.' };
  const db = getDb();
  const [archive, workflow, evidence, tasks, n1] = await Promise.all([
    db.select({ title: ticketArchives.title, jiraStatus: ticketArchives.jiraStatus, operationalStatus: ticketArchives.operationalStatus, city: ticketArchives.city, capturedAt: ticketArchives.capturedAt }).from(ticketArchives).where(eq(ticketArchives.ticketKey, ticket)).get(),
    db.select({ id: operationalWorkflows.id, status: operationalWorkflows.status, category: operationalWorkflows.category, description: operationalWorkflows.description, scheduledAt: operationalWorkflows.scheduledAt, validationStatus: operationalWorkflows.validationStatus, archivedAt: operationalWorkflows.archivedAt }).from(operationalWorkflows).where(eq(operationalWorkflows.ticketKey, ticket)).get(),
    db.select({ kind: ticketEvidence.kind, name: ticketEvidence.name, createdAt: ticketEvidence.createdAt }).from(ticketEvidence).where(eq(ticketEvidence.ticketKey, ticket)).orderBy(desc(ticketEvidence.createdAt)).limit(30).all(),
    db.select({ title: operationalTasks.title, status: operationalTasks.status, assignedTo: operationalTasks.assignedTo, dueAt: operationalTasks.dueAt, progressNote: operationalTasks.progressNote }).from(operationalTasks).where(eq(operationalTasks.ticketKey, ticket)).orderBy(desc(operationalTasks.updatedAt)).limit(20).all(),
    db.select({ n1Email: n1TicketAssignments.n1Email, participantN1Email: n1TicketAssignments.participantN1Email, status: n1TicketAssignments.status }).from(n1TicketAssignments).where(eq(n1TicketAssignments.ticketKey, ticket)).get(),
  ]);
  if (!archive && !workflow && !evidence.length && !tasks.length && !n1) return { erro: 'Nenhum registro local encontrado para esta FSA.' };
  const visits = workflow ? await db.select({ visitNumber: operationalVisits.visitNumber, scheduledAt: operationalVisits.scheduledAt, completedAt: operationalVisits.completedAt, status: operationalVisits.status, note: operationalVisits.note }).from(operationalVisits).where(eq(operationalVisits.workflowId, workflow.id)).limit(30).all() : [];
  return {
    chamado: ticket,
    arquivo_permanente: archive ?? 'Sem fotografia histórica local.',
    fluxo: workflow ? { status: workflow.status, category: workflow.category, description: redact(workflow.description ?? ''), scheduledAt: workflow.scheduledAt, validationStatus: workflow.validationStatus, archivedAt: workflow.archivedAt } : null,
    visitas: visits.map((row) => ({ ...row, note: redact(row.note ?? '') })),
    evidencias: evidence,
    tarefas: tasks.map((row) => ({ ...row, progressNote: redact(row.progressNote ?? '') })),
    n1: n1 ? { principal: n1.n1Email, participante: n1.participantN1Email, status: n1.status } : null,
  };
}

async function consultarCatalogoPecas(args: Args) {
  const search = text(args, 'busca');
  const rows = await getDb().select({ name: partsCatalog.name, salePriceCents: partsCatalog.salePriceCents }).from(partsCatalog)
    .where(and(eq(partsCatalog.active, true), search ? like(partsCatalog.name, `%${search}%`) : undefined))
    .orderBy(partsCatalog.name).limit(40).all();
  return { total_exibido: rows.length, pecas: rows.map((row) => ({ nome: row.name, preco_venda: currency(row.salePriceCents) })) };
}

async function consultarTarefas(args: Args, access: AssistantAccess) {
  const ticket = text(args, 'chamado')?.toUpperCase();
  const owner = text(args, 'responsavel');
  const status = text(args, 'status');
  if (status && !['open', 'accepted', 'in_progress', 'done', 'cancelled'].includes(status)) return { erro: 'Status de tarefa inválido.' };
  const conditions = [
    ticket ? eq(operationalTasks.ticketKey, ticket) : undefined,
    owner ? or(like(operationalTasks.assignedTo, `%${owner}%`), like(operationalTasks.acceptedBy, `%${owner}%`)) : undefined,
    status ? eq(operationalTasks.status, status as typeof operationalTasks.status.enumValues[number]) : undefined,
    access.role === 'gerencia' || access.role === 'coordenador' ? undefined : or(eq(operationalTasks.assignedTo, access.email), eq(operationalTasks.acceptedBy, access.email), eq(operationalTasks.createdBy, access.email)),
  ].filter(Boolean);
  const rows = await getDb().select({ ticketKey: operationalTasks.ticketKey, title: operationalTasks.title, status: operationalTasks.status, assignedTo: operationalTasks.assignedTo, acceptedBy: operationalTasks.acceptedBy, dueAt: operationalTasks.dueAt, progressNote: operationalTasks.progressNote }).from(operationalTasks)
    .where(and(...conditions)).orderBy(desc(operationalTasks.updatedAt)).limit(40).all();
  return { total_exibido: rows.length, tarefas: rows.map((row) => ({ ...row, progressNote: redact(row.progressNote ?? '') })) };
}

async function consultarFinancas(_args: Args, access: AssistantAccess) {
  if (access.role !== 'gerencia') return { erro: 'Somente a gerência consulta o financeiro.' };
  const db = getDb();
  const [workflows, groups] = await Promise.all([
    db.select({ status: operationalWorkflows.status, clientValueCents: operationalWorkflows.clientValueCents, payoutCents: operationalWorkflows.payoutCents, partsValueCents: operationalWorkflows.partsValueCents }).from(operationalWorkflows).all(),
    db.select({ status: fsaGroups.status, totalCents: fsaGroups.totalCents }).from(fsaGroups).all(),
  ]);
  const open = workflows.filter((row) => !CLOSED.includes(row.status));
  const sum = (values: number[]) => currency(values.reduce((a, b) => a + b, 0));
  return {
    nota: 'Valores registrados, não simulação de tabela. Repasses aprovados/pagos usam a fotografia de fechamento do grupo.',
    receita_cliente_em_aberto: sum(open.map((row) => row.clientValueCents ?? 0)),
    custo_previsto_em_aberto: sum(open.map((row) => (row.payoutCents ?? 0) + (row.partsValueCents ?? 0))),
    repasses_aprovados: sum(groups.filter((row) => row.status === 'aprovado').map((row) => row.totalCents)),
    repasses_pagos: sum(groups.filter((row) => row.status === 'pago').map((row) => row.totalCents)),
    repasses_pendentes: sum(groups.filter((row) => row.status === 'pronto' || row.status === 'bloqueado').map((row) => row.totalCents)),
  };
}

async function consultarFinanceiroJira(args: Args, access: AssistantAccess) {
  if (access.role !== 'gerencia') return { erro: 'Somente a gerência consulta o financeiro.' };
  const days = count(args, 'dias', 90, 365);
  const ticket = text(args, 'chamado')?.toUpperCase();
  if (ticket && !/^FSA-\d+$/.test(ticket)) return { erro: 'Informe uma FSA válida.' };
  const rows = await getFinancialIssues(Math.max(7, days));
  const selected = ticket ? rows.filter((row) => row.key === ticket) : rows;
  return {
    periodo_dias: days,
    total_chamados: selected.length,
    valor_total: currency(selected.reduce((sum, row) => sum + row.totalValue, 0) * 100),
    valor_servicos: currency(selected.reduce((sum, row) => sum + row.serviceValue, 0) * 100),
    valor_pecas: currency(selected.reduce((sum, row) => sum + row.spareValue, 0) * 100),
    faturados: selected.filter((row) => row.billed).length,
    nao_faturados: selected.filter((row) => !row.billed).length,
    chamados: selected.slice(0, 30).map((row) => ({ chamado: row.key, status: row.status, tecnico: row.technician, loja: row.store, cidade: row.city, total: currency(row.totalValue * 100), faturado: row.billed })),
    lista_cortada: selected.length > 30,
  };
}

async function consultarLojas(args: Args) {
  const search = text(args, 'busca');
  const conditions = search ? or(like(operationalStores.code, `%${search}%`), like(operationalStores.name, `%${search}%`), like(operationalStores.city, `%${search}%`)) : undefined;
  const rows = await getDb().select({ code: operationalStores.code, name: operationalStores.name, city: operationalStores.city, state: operationalStores.state }).from(operationalStores)
    .where(conditions).orderBy(operationalStores.code).limit(40).all();
  return { total_exibido: rows.length, lojas: rows };
}

async function consultarProjetos(args: Args, access: AssistantAccess) {
  if (access.role !== 'gerencia' && access.role !== 'coordenador') return { erro: 'Seu cargo não acessa projetos.' };
  const search = text(args, 'busca');
  const db = getDb();
  const rows = await db.select({ id: projects.id, name: projects.name, clientName: projects.clientName, active: projects.active }).from(projects)
    .where(search ? or(like(projects.name, `%${search}%`), like(projects.clientName, `%${search}%`)) : undefined)
    .orderBy(projects.name).limit(30).all();
  const counts = rows.length ? await db.select({ projectId: stores.projectId, total: sql<number>`count(*)` }).from(stores).where(inArray(stores.projectId, rows.map((row) => row.id))).groupBy(stores.projectId).all() : [];
  const byId = new Map(counts.map((row) => [row.projectId, Number(row.total)]));
  return { total_exibido: rows.length, projetos: rows.map((row) => ({ nome: row.name, cliente: row.clientName, ativo: row.active, lojas: byId.get(row.id) ?? 0 })) };
}

async function consultarColaboradores(args: Args) {
  const search = text(args, 'busca');
  const rows = await getDb().select({ email: appUsers.email, role: appUsers.role, displayName: employeePresence.displayName, status: employeePresence.status, updatedAt: employeePresence.updatedAt })
    .from(appUsers).leftJoin(employeePresence, eq(appUsers.email, employeePresence.email))
    .where(and(eq(appUsers.active, true), search ? or(like(appUsers.email, `%${search}%`), like(employeePresence.displayName, `%${search}%`)) : undefined))
    .limit(40).all();
  const staleBefore = Date.now() - 2 * 60_000;
  return { total_exibido: rows.length, colaboradores: rows.map((row) => ({
    nome: row.displayName || row.email.split('@')[0], cargo: row.role,
    disponibilidade: row.status === 'Offline' || !row.updatedAt || Date.parse(row.updatedAt) < staleBefore ? 'Offline' : row.status ?? 'Offline',
  })) };
}

async function consultarFeedback(args: Args) {
  const search = text(args, 'busca');
  const rows = await getDb().select({ id: feedback.id, title: feedback.title, body: feedback.body, kind: feedback.kind, status: feedback.status, createdAt: feedback.createdAt }).from(feedback)
    .where(search ? or(like(feedback.title, `%${search}%`), like(feedback.body, `%${search}%`)) : undefined)
    .orderBy(desc(feedback.createdAt)).limit(30).all();
  return { total_exibido: rows.length, feedbacks: rows.map((row) => ({ ...row, body: redact(row.body.slice(0, 500)) })) };
}

async function consultarBilhetes(args: Args) {
  const search = text(args, 'busca');
  const conditions = [
    sql`${bulletinNotes.archivedAt} is null`,
    search ? or(like(bulletinNotes.title, `%${search}%`), like(bulletinNotes.targetName, `%${search}%`)) : undefined,
  ].filter(Boolean);
  const rows = await getDb().select({ title: bulletinNotes.title, targetName: bulletinNotes.targetName, body: bulletinNotes.body, createdAt: bulletinNotes.createdAt }).from(bulletinNotes)
    .where(and(...conditions)).orderBy(desc(bulletinNotes.createdAt)).limit(20).all();
  return { total_exibido: rows.length, bilhetes: rows.map((row) => ({ ...row, body: redact(row.body) })) };
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
async function consultarCobertura(args: Args) {
  const pedidas = Array.isArray(args.cidades)
    ? [...new Set(args.cidades.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, COVERAGE_CITIES)
    : [];
  if (!pedidas.length) return { erro: 'Diga quais cidades conferir.' };
  const radius = count(args, 'raio_km', COVERAGE_RADIUS_KM, 300);

  const technicians = technicianDirectory();
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

// Prepara a mensagem — e só. O envio acontece na tela, com o texto à vista e
// editável, pela mesma rota de sempre, que assina com o nome de quem enviou.
// Mensagem para fora não sai de um texto interpretado sem alguém ler antes.
const MESSAGE_CHARS = 4096;

async function prepararMensagemWhatsapp(args: Args) {
  const texto = text(args, 'texto')?.slice(0, MESSAGE_CHARS);
  if (!texto) return { erro: 'Escreva o texto da mensagem.' };
  const ticket = text(args, 'chamado')?.toUpperCase();
  const contato = text(args, 'contato')?.toLowerCase();
  if (!ticket && !contato) return { erro: 'Diga para quem enviar: o nome do contato ou a FSA da conversa.' };

  const db = getDb();
  const conversas = await db.select({
    contactPhone: whatsappConversations.contactPhone, contactName: whatsappConversations.contactName,
    ticketKey: whatsappConversations.ticketKey, lastMessageAt: whatsappConversations.lastMessageAt,
  }).from(whatsappConversations)
    .where(ticket ? eq(whatsappConversations.ticketKey, ticket) : like(whatsappConversations.contactName, `%${contato}%`))
    .orderBy(desc(whatsappConversations.lastMessageAt)).limit(5).all();

  if (!conversas.length) {
    return { erro: ticket ? `Nenhuma conversa de WhatsApp ligada a ${ticket}.` : `Nenhuma conversa encontrada para "${contato}".` };
  }
  // Duas conversas parecidas viram pergunta, não escolha minha: mandar para o
  // contato errado é pior do que perguntar.
  if (conversas.length > 1) {
    return {
      erro: 'Mais de uma conversa combina com isso.',
      conversas: conversas.map((row) => redact(`${row.contactName || 'sem nome'}${row.ticketKey ? ` · ${row.ticketKey}` : ''} · última mensagem ${operationDateTime(row.lastMessageAt)}`)),
      instrucao_para_voce: 'Liste as conversas e pergunte para qual delas enviar.',
    };
  }

  const alvo = conversas[0];
  return {
    para: redact(alvo.contactName || 'contato'),
    texto,
    // A tela lê isto para abrir a confirmação de envio.
    acao: { tipo: 'whatsapp', contato: alvo.contactPhone, nome: alvo.contactName || 'contato', texto },
    instrucao_para_voce: 'Diga para quem a mensagem vai e mostre o texto. Avise que ela só sai depois de a pessoa revisar e enviar na tela — você não envia.',
  };
}

const TOOLS: Record<string, (args: Args, access: AssistantAccess) => Promise<unknown>> = {
  simular_repasse: simularRepasse,
  consultar_repasses: consultarRepasses,
  consultar_historico_local: consultarHistoricoLocal,
  consultar_catalogo_pecas: consultarCatalogoPecas,
  consultar_tarefas: consultarTarefas,
  consultar_financas: consultarFinancas,
  consultar_financeiro_jira: consultarFinanceiroJira,
  consultar_lojas: consultarLojas,
  consultar_projetos: consultarProjetos,
  consultar_colaboradores: consultarColaboradores,
  consultar_feedback: consultarFeedback,
  consultar_bilhetes: consultarBilhetes,
  consultar_chamados: consultarChamados,
  detalhar_chamado: detalharChamado,
  consultar_valores: consultarValores,
  consultar_equipamento: consultarEquipamento,
  consultar_tecnicos: consultarTecnicos,
  resumo_operacao: (_args, access) => resumoOperacao(access),
  consultar_spares: consultarSpares,
  consultar_cobertura: consultarCobertura,
  consultar_whatsapp: consultarWhatsapp,
  preparar_mensagem_whatsapp: prepararMensagemWhatsapp,
  consultar_atendimentos: consultarAtendimentos,
  preparar_agendamento: prepararAgendamento,
  consultar_historico: consultarHistorico,
};

// `canReadWhatsapp` é checado aqui também, e não só na hora de declarar as
// consultas: se o modelo pedir a conversa mesmo assim, a porta continua
// fechada.
export function assistantToolRunner(options: AssistantAccess) {
  return async function runAssistantTool(name: string, args: Args): Promise<unknown> {
    if ((name === 'consultar_whatsapp' || name === 'preparar_mensagem_whatsapp') && !options.canReadWhatsapp) {
      return { erro: 'Quem perguntou não tem acesso ao WhatsApp no Caju OS.' };
    }
    if ((name === 'consultar_financas' || name === 'consultar_financeiro_jira') && options.role !== 'gerencia') {
      return { erro: 'Somente a gerência consulta o financeiro.' };
    }
    if (name === 'consultar_projetos' && options.role !== 'gerencia' && options.role !== 'coordenador') {
      return { erro: 'Seu cargo não acessa projetos.' };
    }

    const tool = TOOLS[name];
    if (!tool) return { erro: `Consulta desconhecida: ${name}.` };
    return tool(args, options);
  };
}

