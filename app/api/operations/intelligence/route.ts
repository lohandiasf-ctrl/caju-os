import { desc, eq } from 'drizzle-orm';
import { employeeActivity, operationalAudit, operationalTasks, requesterHistory, shipmentTracking, ticketSnapshots } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const ticketKey = clean(new URL(request.url).searchParams.get('ticket'), 100);
    if (!ticketKey) return Response.json({ error: 'Informe chamado.' }, { status: 400 });
    const db = getDb();
    const [requesters, shipments, tasks, snapshots, audit] = await Promise.all([
      db.select().from(requesterHistory).where(eq(requesterHistory.ticketKey, ticketKey)).orderBy(desc(requesterHistory.createdAt)).all(),
      db.select().from(shipmentTracking).where(eq(shipmentTracking.ticketKey, ticketKey)).orderBy(desc(shipmentTracking.updatedAt)).all(),
      db.select().from(operationalTasks).where(eq(operationalTasks.ticketKey, ticketKey)).orderBy(desc(operationalTasks.updatedAt)).all(),
      db.select({ id: ticketSnapshots.id, actorEmail: ticketSnapshots.actorEmail, reason: ticketSnapshots.reason, createdAt: ticketSnapshots.createdAt }).from(ticketSnapshots).where(eq(ticketSnapshots.ticketKey, ticketKey)).orderBy(desc(ticketSnapshots.createdAt)).limit(30).all(),
      db.select().from(operationalAudit).where(eq(operationalAudit.ticketKey, ticketKey)).orderBy(desc(operationalAudit.createdAt)).limit(50).all(),
    ]);
    return Response.json({ requesters, shipments, tasks, snapshots, audit }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar inteligência operacional.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json() as Record<string, unknown>;
    const action = clean(body.action, 30);
    const ticketKey = clean(body.ticketKey, 100);
    const now = new Date().toISOString();
    const db = getDb();
    if (action === 'activity') {
      await db.insert(employeeActivity).values({ email: user.email, event: clean(body.event, 80) ?? 'active', context: clean(body.context, 300), durationSeconds: integer(body.durationSeconds, 0, 86_400) ?? 0, createdAt: now });
      return Response.json({ ok: true });
    }
    if (!ticketKey) return Response.json({ error: 'Informe chamado.' }, { status: 400 });
    if (action === 'shipment') {
      const trackingCode = clean(body.trackingCode, 120);
      const source = body.source === 'Delfia' ? 'Delfia' : 'Caju';
      if (!trackingCode) return Response.json({ error: 'Informe o código de rastreio.' }, { status: 400 });
      await db.insert(shipmentTracking).values({ ticketKey, source, trackingCode, carrier: clean(body.carrier, 100), status: clean(body.status, 100) ?? 'Postado', expectedAt: validDate(body.expectedAt), createdBy: user.email, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [shipmentTracking.ticketKey, shipmentTracking.trackingCode], set: { source, carrier: clean(body.carrier, 100), status: clean(body.status, 100) ?? 'Postado', expectedAt: validDate(body.expectedAt), updatedAt: now } });
      return Response.json({ ok: true });
    }
    if (action === 'task') {
      const title = clean(body.title, 500);
      if (!title) return Response.json({ error: 'Descreva a atividade.' }, { status: 400 });
      const minutes = integer(body.followUpMinutes, 5, 1_440) ?? 30;
      const dueMinutes = integer(body.dueMinutes, 30, 10_080) ?? 120;
      const nextCheckAt = new Date(Date.now() + minutes * 60_000).toISOString();
      const dueAt = new Date(Date.now() + dueMinutes * 60_000).toISOString();
      await db.insert(operationalTasks).values({ ticketKey, title, assignedTo: clean(body.assignedTo, 180), status: 'open', nextCheckAt, dueAt, createdBy: user.email, createdAt: now, updatedAt: now });
      await db.insert(operationalAudit).values({
        ticketKey,
        action: 'Tarefa delegada criada',
        actorEmail: user.email,
        details: JSON.stringify({ collaborator: user.email, origin: 'sistema', reason: 'Delegação operacional', changedAt: now, changes: [{ field: 'tarefa', previous: null, next: title }] }),
        createdAt: now,
      });
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível registrar a informação.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === 'restore-preview') {
      if (!['gerencia', 'coordenador'].includes(user.role)) return Response.json({ error: 'Somente gestão pode preparar uma restauração.' }, { status: 403 });
      const snapshotId = integer(body.snapshotId, 1, 2_000_000_000);
      if (!snapshotId) return Response.json({ error: 'Backup inválido.' }, { status: 400 });
      const row = await getDb().select().from(ticketSnapshots).where(eq(ticketSnapshots.id, snapshotId)).get();
      if (!row) return Response.json({ error: 'Backup não encontrado.' }, { status: 404 });
      return Response.json({ snapshot: JSON.parse(row.snapshot) });
    }
    const id = integer(body.id, 1, 2_000_000_000);
    if (!id) return Response.json({ error: 'Registro inválido.' }, { status: 400 });
    const status = clean(body.status, 30);
    if (!['accepted', 'in_progress', 'done'].includes(status ?? '')) return Response.json({ error: 'Status inválido.' }, { status: 400 });
    const now = new Date().toISOString();
    const db = getDb();
    const existing = await db.select().from(operationalTasks).where(eq(operationalTasks.id, id)).get();
    if (!existing) return Response.json({ error: 'Atividade não encontrada.' }, { status: 404 });
    const acceptedBy = status === 'accepted' ? user.email : existing.acceptedBy;
    await db.update(operationalTasks).set({ status: status as 'accepted' | 'in_progress' | 'done', acceptedBy, progressNote: clean(body.progressNote, 1000), nextCheckAt: status === 'done' ? now : new Date(Date.now() + 30 * 60_000).toISOString(), updatedAt: now }).where(eq(operationalTasks.id, id));
    if (existing.ticketKey) {
      await db.insert(operationalAudit).values({
        ticketKey: existing.ticketKey,
        action: status === 'accepted' ? 'Tarefa aceita' : status === 'done' ? 'Tarefa concluída' : 'Andamento da tarefa registrado',
        actorEmail: user.email,
        details: JSON.stringify({
          collaborator: user.email,
          origin: 'sistema',
          reason: clean(body.progressNote, 1000) ?? `Status ${status}`,
          changedAt: now,
          changes: [
            { field: 'status', previous: existing.status, next: status },
            { field: 'acceptedBy', previous: existing.acceptedBy, next: acceptedBy },
          ],
        }),
        createdAt: now,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível atualizar a atividade.' }, { status: 500 });
  }
}

function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) || null : null; }
function validDate(value: unknown) { return typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : null; }
function integer(value: unknown, min: number, max: number) { const number = Number(value); return Number.isInteger(number) && number >= min && number <= max ? number : null; }
