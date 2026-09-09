import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { bulletinNotes, employeePresence } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

const ADMIN_ROLES = ['gerencia', 'coordenador'] as const;

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const rows = await getDb()
      .select({
        id: bulletinNotes.id,
        authorEmail: bulletinNotes.authorEmail,
        authorName: employeePresence.displayName,
        targetName: bulletinNotes.targetName,
        title: bulletinNotes.title,
        body: bulletinNotes.body,
        createdAt: bulletinNotes.createdAt,
      })
      .from(bulletinNotes)
      .leftJoin(employeePresence, eq(employeePresence.email, bulletinNotes.authorEmail))
      .where(isNull(bulletinNotes.archivedAt))
      .orderBy(desc(bulletinNotes.createdAt))
      .limit(30)
      .all();
    return Response.json({
      notes: rows.map((row) => ({ ...row, mine: row.authorEmail === user.email })),
      canArchiveAny: ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os bilhetes.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json() as { title?: string; note?: string; targetName?: string };
    const note = body.note?.trim();
    const targetName = body.targetName?.trim().slice(0, 80) || null;
    const title = body.title?.trim().slice(0, 100) || (targetName ? `Para ${targetName}` : 'Bilhete');
    if (!note || note.length < 6) return Response.json({ error: 'Escreva um recado com pelo menos 6 caracteres.' }, { status: 400 });
    if (note.length > 800) return Response.json({ error: 'Bilhete deve ter até 800 caracteres.' }, { status: 400 });
    const now = new Date().toISOString();
    const created = await getDb().insert(bulletinNotes).values({
      authorEmail: user.email,
      targetName,
      title,
      body: note,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: bulletinNotes.id }).get();
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível salvar o bilhete.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json() as { id?: number; action?: string };
    const id = Number(body.id);
    if (!Number.isInteger(id) || body.action !== 'archive') return Response.json({ error: 'Bilhete inválido.' }, { status: 400 });
    const db = getDb();
    const existing = await db.select().from(bulletinNotes).where(eq(bulletinNotes.id, id)).get();
    if (!existing || existing.archivedAt) return Response.json({ error: 'Bilhete não encontrado.' }, { status: 404 });
    const canArchive = existing.authorEmail === user.email || ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]);
    if (!canArchive) return Response.json({ error: 'Só autor, gerência ou coordenação arquiva este bilhete.' }, { status: 403 });
    const now = new Date().toISOString();
    await db.update(bulletinNotes)
      .set({ archivedAt: now, archivedBy: user.email, updatedAt: now })
      .where(and(eq(bulletinNotes.id, id), isNull(bulletinNotes.archivedAt)));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível arquivar o bilhete.' }, { status: 500 });
  }
}
