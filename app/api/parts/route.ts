import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { partsCatalog } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Preço é dado comercial: qualquer perfil operacional precisa consultar para
// preencher o chamado, mas só gerência altera.
export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const parts = await getDb().select().from(partsCatalog)
      .where(eq(partsCatalog.active, true)).orderBy(asc(partsCatalog.name)).all();
    return Response.json({ parts }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar as peças.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request, ['gerencia']);
    const body = await request.json() as { id?: number; name?: string; salePriceCents?: number; active?: boolean };
    const name = body.name?.trim();
    const cents = Number(body.salePriceCents);
    if (!name) return Response.json({ error: 'Informe o nome da peça.' }, { status: 400 });
    if (!Number.isInteger(cents) || cents < 0) return Response.json({ error: 'Informe um valor válido.' }, { status: 400 });

    const now = new Date().toISOString();
    const values = { name, salePriceCents: cents, active: body.active ?? true, updatedBy: user.email, updatedAt: now };
    if (body.id) {
      await getDb().update(partsCatalog).set(values).where(eq(partsCatalog.id, body.id));
    } else {
      await getDb().insert(partsCatalog).values(values)
        .onConflictDoUpdate({ target: partsCatalog.name, set: values });
    }
    return Response.json({ ok: true, name, salePriceCents: cents });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível salvar a peça.' }, { status: 500 });
  }
}
