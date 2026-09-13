import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { n1TicketAssignments, operationalAudit, operationalTasks, operationalVisits, operationalWorkflows, shipmentTracking, ticketArchives, ticketEvidence, ticketSnapshots } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireApiUser(request);
    const key = (await context.params).key.trim().toUpperCase();
    if (!/^FSA-\d+$/.test(key)) return Response.json({ error: 'Chamado inválido.' }, { status: 400 });
    const db = getDb();
    const [archive, workflow, audit, evidence, tasks, shipments, snapshots, n1] = await Promise.all([
      db.select().from(ticketArchives).where(eq(ticketArchives.ticketKey, key)).get(),
      db.select().from(operationalWorkflows).where(eq(operationalWorkflows.ticketKey, key)).get(),
      db.select().from(operationalAudit).where(eq(operationalAudit.ticketKey, key)).orderBy(desc(operationalAudit.createdAt)).limit(200).all(),
      db.select({ id: ticketEvidence.id, kind: ticketEvidence.kind, name: ticketEvidence.name, mimeType: ticketEvidence.mimeType, uploadedBy: ticketEvidence.uploadedBy, createdAt: ticketEvidence.createdAt }).from(ticketEvidence).where(eq(ticketEvidence.ticketKey, key)).orderBy(desc(ticketEvidence.createdAt)).all(),
      db.select().from(operationalTasks).where(eq(operationalTasks.ticketKey, key)).orderBy(desc(operationalTasks.updatedAt)).all(),
      db.select().from(shipmentTracking).where(eq(shipmentTracking.ticketKey, key)).orderBy(desc(shipmentTracking.updatedAt)).all(),
      db.select({ id: ticketSnapshots.id, actorEmail: ticketSnapshots.actorEmail, reason: ticketSnapshots.reason, createdAt: ticketSnapshots.createdAt }).from(ticketSnapshots).where(eq(ticketSnapshots.ticketKey, key)).orderBy(desc(ticketSnapshots.createdAt)).all(),
      db.select().from(n1TicketAssignments).where(eq(n1TicketAssignments.ticketKey, key)).get(),
    ]);
    // Jira-only records have no local workflow; their snapshot and audit remain
    // consultable even without a visit list.
    const actualVisits = workflow
      ? await db.select().from(operationalVisits).where(eq(operationalVisits.workflowId, workflow.id)).orderBy(asc(operationalVisits.visitNumber)).all()
      : [];
    if (!archive && !workflow && !audit.length) return Response.json({ error: 'Registro histórico não encontrado.' }, { status: 404 });
    const payload = {
      archive: archive ? { ...archive, snapshot: parse(archive.snapshot) } : null,
      workflow,
      visits: actualVisits,
      evidence,
      tasks,
      shipments,
      snapshots,
      audit,
      n1,
    };
    return Response.json(user.role === 'gerencia' ? payload : redactFinancial(payload), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível abrir o histórico deste chamado.' }, { status: 500 });
  }
}

function parse(value: string) { try { return JSON.parse(value) as unknown; } catch { return { note: 'Snapshot legado indisponível.' }; } }
function redactFinancial<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactFinancial) as T;
  if (!value || typeof value !== 'object') return value;
  const sensitive = new Set(['clientValueCents', 'payoutCents', 'partsValueCents', 'partsSaleCents', 'paidValueCents', 'paymentDate', 'pixKey', 'bank', 'accountHolder', 'pixKeyType']);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, sensitive.has(key) ? null : redactFinancial(child)])) as T;
}
