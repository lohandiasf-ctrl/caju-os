import { and, eq, inArray, isNull } from 'drizzle-orm';
import { activeAttendances, activeAttendanceTickets, operationalAudit } from '@/db/schema';
import { getDb } from '@/db';
import { normalizeFsaKeys } from '@/lib/active-attendances';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { JiraError } from '@/lib/server/jira';
import { verifyIssues } from '@/app/api/active-attendances/route';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Atendimento inválido.' }, { status: 400 });
    const body = await request.json() as { ticketKeys?: unknown; whatsappGroupName?: unknown };
    const keys = normalizeFsaKeys(body.ticketKeys);
    if (!keys.length) return Response.json({ error: 'Informe pelo menos uma FSA.' }, { status: 400 });

    const db = getDb();
    const attendance = await db.select().from(activeAttendances).where(eq(activeAttendances.id, id)).get();
    if (!attendance || attendance.endedAt) return Response.json({ error: 'Atendimento não encontrado ou encerrado.' }, { status: 404 });
    if (attendance.ownerEmail.toLowerCase() !== user.email.toLowerCase() && user.role !== 'gerencia') {
      return Response.json({ error: 'Apenas o responsável ou a gerência pode adicionar chamados.' }, { status: 403 });
    }
    const existing = await db.select().from(activeAttendanceTickets).where(eq(activeAttendanceTickets.attendanceId, id)).all();
    const newKeys = keys.filter((key) => !existing.some((ticket) => ticket.ticketKey === key));
    if (!newKeys.length) return Response.json({ error: 'Essas FSAs já pertencem ao atendimento.' }, { status: 409 });
    if (existing.length + newKeys.length > 20) return Response.json({ error: 'Um atendimento pode conter até 20 FSAs.' }, { status: 400 });
    const groupName = typeof body.whatsappGroupName === 'string' ? body.whatsappGroupName.trim() : '';
    if (groupName.length > 120) return Response.json({ error: 'O nome do grupo pode ter até 120 caracteres.' }, { status: 400 });
    if (existing.length + newKeys.length > 1 && !(attendance.whatsappGroupName || groupName)) return Response.json({ error: 'Informe o nome do grupo antes de adicionar mais FSAs.' }, { status: 400 });

    const linked = await db.select({ ticketKey: activeAttendanceTickets.ticketKey, attendanceId: activeAttendanceTickets.attendanceId })
      .from(activeAttendanceTickets).where(inArray(activeAttendanceTickets.ticketKey, newKeys)).all();
    if (linked.length) {
      const open = await db.select({ id: activeAttendances.id }).from(activeAttendances)
        .where(and(inArray(activeAttendances.id, linked.map((item) => item.attendanceId)), isNull(activeAttendances.endedAt))).all();
      const activeIds = new Set(open.map((item) => item.id));
      const occupied = linked.filter((item) => activeIds.has(item.attendanceId)).map((item) => item.ticketKey);
      if (occupied.length) return Response.json({ error: `FSA já pertence a outro atendimento: ${occupied.join(', ')}.` }, { status: 409 });
    }
    const verified = await verifyIssues(newKeys);
    if (verified.invalid.length) return Response.json({ error: `FSAs não encontradas no Jira: ${verified.invalid.join(', ')}.` }, { status: 400 });
    const now = new Date().toISOString();
    await db.insert(activeAttendanceTickets).values(verified.valid.map((issue) => ({
      attendanceId: id, ticketKey: issue.key, summary: issue.summary, store: issue.store, city: issue.city, createdAt: now,
    })));
    await db.update(activeAttendances).set({ updatedAt: now, ...(groupName ? { whatsappGroupName: groupName } : {}) }).where(eq(activeAttendances.id, id));
    await db.insert(operationalAudit).values(verified.valid.map((issue) => ({
      ticketKey: issue.key, action: 'Chamado adicionado ao atendimento', actorEmail: user.email,
      details: JSON.stringify({ attendanceId: id, phase: attendance.phase, origin: 'sistema' }), createdAt: now,
    })));
    return Response.json({ ok: true, added: verified.valid });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Não foi possível adicionar os chamados.' }, { status: 500 });
  }
}
