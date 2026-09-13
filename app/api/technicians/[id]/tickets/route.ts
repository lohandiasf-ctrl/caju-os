import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { operationalWorkflows, technicians } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(request);
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Técnico inválido.' }, { status: 400 });
    const db = getDb();
    const technician = await db.select({ id: technicians.id }).from(technicians).where(eq(technicians.id, id)).get();
    if (!technician) return Response.json({ error: 'Técnico não encontrado.' }, { status: 404 });
    const workflows = await db.select({
      ticketKey: operationalWorkflows.ticketKey,
      status: operationalWorkflows.status,
      scheduledAt: operationalWorkflows.scheduledAt,
      storeName: operationalWorkflows.storeName,
      city: operationalWorkflows.city,
    }).from(operationalWorkflows).where(eq(operationalWorkflows.technicianId, id)).orderBy(desc(operationalWorkflows.updatedAt)).all();
    return Response.json({ tickets: workflows }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar fila do técnico.' }, { status: 500 });
  }
}
