import { asc, eq } from 'drizzle-orm';
import { operationalAudit, operationalStores, operationalVisits, operationalWorkflows, requesterHistory, technicians, ticketSnapshots } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { JiraError, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';
import { enqueueJiraSync, shouldQueueJiraError } from '@/lib/server/jira-sync';

const statuses = new Set(['triage', 'scheduling', 'scheduled', 'operational_preparation', 'in_service', 'technical_pending', 'validated', 'awaiting_approval', 'awaiting_spare', 'spare_validated', 'awaiting_payment', 'resolved', 'archived', 'cancelled']);
const purchaseStatuses = new Set(['Agendado', 'Cancelado', 'Comprado', 'Delfia', 'Direcionado', 'Encerrado', 'Enviado', 'Fechado', 'Finalizado', 'Indisponível', 'Parceiro Delfia', 'Pendente', 'Recebido', 'Reenviado']);

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const db = getDb();
    await reconcile(db);
    const url = new URL(request.url);
    if (url.searchParams.get('archivedKeys') === '1') {
      const rows = await db.select({ ticketKey: operationalWorkflows.ticketKey }).from(operationalWorkflows).where(eq(operationalWorkflows.status, 'archived')).all();
      return Response.json({ archivedKeys: rows.map((row) => row.ticketKey) });
    }
    const ticket = clean(url.searchParams.get('ticket'), 100);
    if (!ticket) return Response.json({ workflows: await db.select().from(operationalWorkflows).orderBy(asc(operationalWorkflows.updatedAt)).all() });
    const workflow = await db.select().from(operationalWorkflows).where(eq(operationalWorkflows.ticketKey, ticket)).get();
    if (!workflow) return Response.json({ workflow: null, visits: [], store: null });
    const [visits, store, audit] = await Promise.all([
      db.select().from(operationalVisits).where(eq(operationalVisits.workflowId, workflow.id)).orderBy(asc(operationalVisits.visitNumber)).all(),
      workflow.storeCode ? db.select().from(operationalStores).where(eq(operationalStores.code, workflow.storeCode)).get() : Promise.resolve(null),
      db.select().from(operationalAudit).where(eq(operationalAudit.ticketKey, ticket)).orderBy(asc(operationalAudit.createdAt)).all(),
    ]);
    return Response.json({ workflow, visits, store, audit });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar gestão operacional.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json() as Record<string, unknown>;
    const ticketKey = clean(body.ticketKey, 100);
    if (!ticketKey) return bad('Informe chamado.');
    const db = getDb();
    const now = new Date().toISOString();
    const status = validStatus(body.status) ?? 'triage';
    const existing = await db.select().from(operationalWorkflows).where(eq(operationalWorkflows.ticketKey, ticketKey)).get();
    if (user.role === 'tecnico' && existing && status !== existing.status) return Response.json({ error: 'Seu perfil pode preencher o atendimento, mas não alterar a etapa do chamado.' }, { status: 403 });
    const technicianId = validId(body.technicianId);
    const scheduledAt = validDate(body.scheduledAt);
    if (status === 'scheduled' && (!technicianId || !scheduledAt || Date.parse(scheduledAt) <= Date.now())) return bad('Agendado exige técnico e data futura.');
    if (status === 'operational_preparation' && !technicianId) return bad('Preparação operacional exige técnico.');
    if (user.role !== 'gerencia' && hasFinancialChange(body)) return Response.json({ error: 'Somente gerência altera valores e pagamento.' }, { status: 403 });
    const technician = technicianId ? await db.select({ name: technicians.name, cpf: technicians.cpf, fullAddress: technicians.fullAddress }).from(technicians).where(eq(technicians.id, technicianId)).get() : null;
    const technicianData = technician ? `Nome completo: ${technician.name}\nCPF: ${technician.cpf || 'Não informado'}\nEndereço completo: ${technician.fullAddress || 'Não informado'}` : null;
    const hasTechnicalSummary = [body.identifiedProblem, body.testsPerformed, body.partToReplace].some((value) => typeof value === 'string' && value.trim());
    const jiraFields = {
      ...(present(body.storeCode) ? { storeCode: body.storeCode } : {}), ...(present(body.storeName) ? { storeName: body.storeName } : {}),
      ...(present(body.requesterName) ? { contactName: body.requesterName } : {}), ...(present(body.requesterPhone) ? { contactPhone: body.requesterPhone } : {}),
      ...(scheduledAt ? { preferredServiceTime: scheduledAt, scheduledDateTime: scheduledAt } : {}), ...(technicianData ? { technicianData } : {}), ...(present(body.category) ? { problemCategory: body.category } : {}), ...(present(body.pdvNumber) ? { pdvNumber: body.pdvNumber } : {}),
      ...(hasTechnicalSummary ? { identifiedProblem: body.identifiedProblem, testsPerformed: body.testsPerformed, partToReplace: body.partToReplace } : {}),
    };
    let jiraQueued = false;
    try {
      await updateJiraIssue(ticketKey, jiraFields, { allowNoop: true });
      await transitionJiraIssue(ticketKey, status, { scheduledDateTime: scheduledAt, technicianData });
    } catch (error) {
      if (!shouldQueueJiraError(error)) throw error;
      jiraQueued = true;
      await enqueueJiraSync(ticketKey, 'update', jiraFields, user.email);
      await enqueueJiraSync(ticketKey, 'transition', { status, scheduledDateTime: scheduledAt, technicianData }, user.email);
    }
    const fields = workflowFields(body, { status, technicianId, scheduledAt, now });
    let workflowId: number;
    if (existing) {
      await db.insert(ticketSnapshots).values({ ticketKey, actorEmail: user.email, reason: 'Antes da alteração operacional', snapshot: JSON.stringify(existing), createdAt: now });
      await db.update(operationalWorkflows).set({ ...fields, updatedAt: now }).where(eq(operationalWorkflows.id, existing.id));
      workflowId = existing.id;
    } else {
      const result = await db.insert(operationalWorkflows).values({ ticketKey, ...fields, createdBy: user.email, createdAt: now, updatedAt: now }).returning({ id: operationalWorkflows.id }).get();
      workflowId = result.id;
    }
    await db.insert(operationalAudit).values({ ticketKey, action: body.confirmPayment === true ? 'Pagamento confirmado e chamado arquivado' : body.addVisit === true ? 'Visita/retorno adicionado' : existing ? `Operação atualizada: ${status}` : `Operação criada: ${status}`, actorEmail: user.email, details: JSON.stringify({ before: existing, after: { ...fields, status, technicianId, scheduledAt }, jiraQueued }), createdAt: now });
    const requesterName = clean(body.requesterName, 120);
    if (requesterName) {
      const previous = await db.select().from(requesterHistory).where(eq(requesterHistory.ticketKey, ticketKey)).orderBy(asc(requesterHistory.createdAt)).all();
      const fingerprint = `${requesterName}|${clean(body.requesterRole, 80) ?? ''}|${clean(body.requesterPhone, 40) ?? ''}`;
      if (!previous.some((item) => `${item.name}|${item.role ?? ''}|${item.phone ?? ''}` === fingerprint)) await db.insert(requesterHistory).values({ ticketKey, name: requesterName, role: clean(body.requesterRole, 80), phone: clean(body.requesterPhone, 40), recordedBy: user.email, createdAt: now });
    }
    const storeCode = clean(body.storeCode, 80);
    if (storeCode && clean(body.storeName, 180) && clean(body.address, 400) && clean(body.city, 100) && clean(body.state, 10)) {
      await db.insert(operationalStores).values({
        code: storeCode, name: clean(body.storeName, 180)!, address: clean(body.address, 400)!, city: clean(body.city, 100)!, state: clean(body.state, 10)!,
        requesterName: clean(body.requesterName, 120), requesterPhone: clean(body.requesterPhone, 40), requesterRole: clean(body.requesterRole, 80), secondaryName: clean(body.secondaryName, 120), secondaryPhone: clean(body.secondaryPhone, 40), secondaryRole: clean(body.secondaryRole, 80), updatedAt: now,
      }).onConflictDoUpdate({ target: operationalStores.code, set: { name: clean(body.storeName, 180)!, address: clean(body.address, 400)!, city: clean(body.city, 100)!, state: clean(body.state, 10)!, requesterName: clean(body.requesterName, 120), requesterPhone: clean(body.requesterPhone, 40), requesterRole: clean(body.requesterRole, 80), secondaryName: clean(body.secondaryName, 120), secondaryPhone: clean(body.secondaryPhone, 40), secondaryRole: clean(body.secondaryRole, 80), updatedAt: now } });
    }
    if (body.addVisit === true) {
      const count = await db.select({ id: operationalVisits.id }).from(operationalVisits).where(eq(operationalVisits.workflowId, workflowId)).all();
      await db.insert(operationalVisits).values({ workflowId, visitNumber: count.length + 1, technicianId, scheduledAt, expectedReturnAt: validDate(body.expectedReturnAt), clientValueCents: cents(body.clientValueCents), payoutCents: cents(body.payoutCents), status: 'planned', note: clean(body.visitNote, 1500), createdBy: user.email, createdAt: now });
    }
    if (body.confirmPayment === true) {
      if (user.role !== 'gerencia') return Response.json({ error: 'Somente gerência confirma pagamento.' }, { status: 403 });
      await db.update(operationalWorkflows).set({ status: 'archived', archivedAt: now, updatedAt: now }).where(eq(operationalWorkflows.id, workflowId));
    }
    const workflow = await db.select().from(operationalWorkflows).where(eq(operationalWorkflows.id, workflowId)).get();
    const visits = await db.select().from(operationalVisits).where(eq(operationalVisits.workflowId, workflowId)).orderBy(asc(operationalVisits.visitNumber)).all();
    return Response.json({ workflow, visits, jiraQueued, notice: jiraQueued ? 'Operação salva. O Jira será atualizado pela fila assim que voltar.' : 'Operação e Jira atualizados.' }, { status: jiraQueued ? 202 : 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Não foi possível salvar operação.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireApiUser(request);
    const code = clean(new URL(request.url).searchParams.get('storeCode'), 80);
    if (!code) return bad('Informe código da loja.');
    const store = await getDb().select().from(operationalStores).where(eq(operationalStores.code, code)).get();
    return Response.json({ store: store ?? null });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível consultar loja.' }, { status: 500 });
  }
}

async function reconcile(db: ReturnType<typeof getDb>) {
  const rows = await db.select().from(operationalWorkflows).all();
  const now = Date.now();
  for (const row of rows) {
    if (!row.scheduledAt || ['archived', 'resolved', 'cancelled', 'validated', 'awaiting_payment', 'awaiting_spare'].includes(row.status)) continue;
    const scheduled = Date.parse(row.scheduledAt);
    let status: string | null = null;
    if (row.status === 'scheduled' && scheduled <= now) status = 'in_service';
    if (row.status === 'in_service' && now >= endOfScheduledDay(row.scheduledAt)) status = 'triage';
    if (row.status === 'triage' && now >= dayAfterAtTen(row.scheduledAt)) status = 'technical_pending';
    if (status) await db.update(operationalWorkflows).set({ status, updatedAt: new Date().toISOString() }).where(eq(operationalWorkflows.id, row.id));
  }
}
function endOfScheduledDay(date: string) { const d = new Date(date); d.setHours(22, 0, 0, 0); return d.getTime(); }
function dayAfterAtTen(date: string) { const d = new Date(date); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d.getTime(); }
function workflowFields(body: Record<string, unknown>, base: { status: string; technicianId: number | null; scheduledAt: string | null; now: string }) { return {
  storeCode: clean(body.storeCode, 80), storeName: clean(body.storeName, 180), address: clean(body.address, 400), city: clean(body.city, 100), state: clean(body.state, 10), openedAt: validDate(body.openedAt), category: clean(body.category, 120), pdvNumber: clean(body.pdvNumber, 80), description: clean(body.description, 4000), clientValueCents: cents(body.clientValueCents), payoutCents: cents(body.payoutCents), status: base.status, technicianId: base.technicianId, scheduledAt: base.scheduledAt, expectedReturnAt: validDate(body.expectedReturnAt), validationStatus: clean(body.validationStatus, 80), spareSource: enumValue(body.spareSource, ['Delfia', 'Caju']), spareStatus: clean(body.spareStatus, 100), purchaseStatus: enumValue(body.purchaseStatus, purchaseStatuses), partsValueCents: cents(body.partsValueCents), partsSaleCents: cents(body.partsSaleCents), paymentDate: validDate(body.paymentDate), paidValueCents: cents(body.paidValueCents), pixKey: clean(body.pixKey, 180), bank: clean(body.bank, 100), accountHolder: clean(body.accountHolder, 150), pixKeyType: clean(body.pixKeyType, 60), archivedAt: null,
}; }
function hasFinancialChange(body: Record<string, unknown>) { return ['clientValueCents', 'payoutCents', 'partsValueCents', 'partsSaleCents', 'paidValueCents'].some((key) => typeof body[key] === 'number') || ['paymentDate', 'pixKey', 'bank', 'accountHolder', 'pixKeyType'].some((key) => typeof body[key] === 'string' && Boolean((body[key] as string).trim())) || body.confirmPayment === true; }
function validStatus(value: unknown) { return typeof value === 'string' && statuses.has(value) ? value : null; }
function enumValue(value: unknown, values: Set<string> | string[]) { return typeof value === 'string' && (values instanceof Set ? values.has(value) : values.includes(value)) ? value : null; }
function validId(value: unknown) { return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null; }
function cents(value: unknown) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000_000 ? value : null; }
function validDate(value: unknown) { return typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : null; }
function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) || null : null; }
function present(value: unknown) { return typeof value === 'string' && Boolean(value.trim()); }
function bad(error: string) { return Response.json({ error }, { status: 400 }); }
