import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { n1TicketAssignments, operationalWorkflows, technicians } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    await requireApiUser(request);
    const key = (await context.params).key.toUpperCase();
    if (!/^FSA-\d+$/.test(key)) return Response.json({ error: 'FSA inválida.' }, { status: 400 });
    const db = getDb();
    const [n1, workflow] = await Promise.all([
      db.select().from(n1TicketAssignments).where(eq(n1TicketAssignments.ticketKey, key)).get(),
      db.select().from(operationalWorkflows).where(eq(operationalWorkflows.ticketKey, key)).get(),
    ]);
    const technician = workflow?.technicianId
      ? await db.select({ id: technicians.id, name: technicians.name, phone: technicians.phone, baseCity: technicians.baseCity, baseState: technicians.baseState })
          .from(technicians).where(eq(technicians.id, workflow.technicianId)).get()
      : null;
    return Response.json({
      ticketKey: key,
      n1: n1 ? { email: n1.n1Email, participantEmail: n1.participantN1Email, status: n1.status, claimedAt: n1.claimedAt, participantClaimedAt: n1.participantClaimedAt } : null,
      analyst: workflow?.scheduledByEmail ? { email: workflow.scheduledByEmail, scheduledAt: workflow.scheduledAt } : null,
      technician: technician ?? null,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar equipe do chamado.' }, { status: 500 });
  }
}
