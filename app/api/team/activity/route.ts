import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { operationalAudit } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

// O que uma pessoa da equipe fez no sistema (trilha de auditoria operacional):
// ação, chamado e quando. Só gerência e coordenação.
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador']);
    const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase() ?? '';
    if (!email.includes('@')) return Response.json({ error: 'E-mail inválido.' }, { status: 400 });
    const db = getDb();
    const where = eq(sql`lower(${operationalAudit.actorEmail})`, email);
    const items = await db.select({ ticketKey: operationalAudit.ticketKey, action: operationalAudit.action, createdAt: operationalAudit.createdAt })
      .from(operationalAudit).where(where).orderBy(desc(operationalAudit.createdAt)).limit(100).all();
    const total = (await db.select({ n: sql<number>`count(*)` }).from(operationalAudit).where(where).get())?.n ?? 0;
    return Response.json({ items, total }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar a atividade.' }, { status: 500 });
  }
}
