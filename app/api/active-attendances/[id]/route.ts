import { eq } from 'drizzle-orm';
import { activeAttendances, activeAttendanceTickets, operationalAudit } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Atendimento inválido.' }, { status: 400 });
    const db = getDb();
    const attendance = await db.select().from(activeAttendances).where(eq(activeAttendances.id, id)).get();
    if (!attendance || attendance.endedAt) return Response.json({ error: 'Atendimento não está mais ativo.' }, { status: 404 });
    if (attendance.ownerEmail.toLowerCase() !== user.email.toLowerCase() && user.role !== 'gerencia') {
      return Response.json({ error: 'Apenas quem iniciou ou a gerência pode encerrar este atendimento.' }, { status: 403 });
    }
    const now = new Date().toISOString();
    await db.update(activeAttendances).set({ endedAt: now, endedBy: user.email, updatedAt: now }).where(eq(activeAttendances.id, id));
    const tickets = await db.select().from(activeAttendanceTickets).where(eq(activeAttendanceTickets.attendanceId, id)).all();
    if (tickets.length) {
      await db.insert(operationalAudit).values(tickets.map((ticket) => ({
        ticketKey: ticket.ticketKey,
        action: 'Atendimento encerrado',
        actorEmail: user.email,
        details: JSON.stringify({ attendanceId: id, startedAt: attendance.startedAt, endedAt: now, origin: 'sistema' }),
        createdAt: now,
      })));
    }
    return Response.json({ ok: true, endedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível encerrar o atendimento.' }, { status: 500 });
  }
}
