import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { feedback, feedbackVotes } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Quem decide o andamento. Qualquer perfil escreve e apoia; mudar status é de
// quem prioriza o roadmap.
const TRIAGE_ROLES = ['gerencia', 'coordenador'];
const STATUSES = ['aberto', 'analisando', 'planejado', 'concluido', 'recusado'] as const;

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const db = getDb();
    const rows = await db
      .select({
        id: feedback.id, authorEmail: feedback.authorEmail, kind: feedback.kind,
        title: feedback.title, body: feedback.body, status: feedback.status,
        handledBy: feedback.handledBy, handledNote: feedback.handledNote,
        createdAt: feedback.createdAt, updatedAt: feedback.updatedAt,
        votes: sql<number>`(SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = ${feedback.id})`,
        votedByMe: sql<number>`(SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = ${feedback.id} AND v.email = ${user.email})`,
      })
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .all();
    return Response.json({
      items: rows.map((row) => ({ ...row, votedByMe: row.votedByMe > 0, mine: row.authorEmail === user.email })),
      canTriage: TRIAGE_ROLES.includes(user.role),
      me: user.email,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os feedbacks.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json() as { title?: string; body?: string; kind?: string };
    const title = body.title?.trim();
    const text = body.body?.trim();
    if (!title || title.length < 4) return Response.json({ error: 'Escreva um título com pelo menos 4 caracteres.' }, { status: 400 });
    if (!text || text.length < 10) return Response.json({ error: 'Descreva com pelo menos 10 caracteres.' }, { status: 400 });
    if (title.length > 160 || text.length > 4000) return Response.json({ error: 'Texto longo demais.' }, { status: 400 });
    const kind = body.kind === 'correcao' ? 'correcao' : 'sugestao';
    const now = new Date().toISOString();
    const [created] = await getDb().insert(feedback)
      .values({ authorEmail: user.email, kind, title, body: text, status: 'aberto', createdAt: now, updatedAt: now })
      .returning({ id: feedback.id });
    return Response.json({ id: created?.id, ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível registrar o feedback.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json() as { id?: number; action?: string; status?: string; note?: string };
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: 'Registro inválido.' }, { status: 400 });
    const db = getDb();
    const now = new Date().toISOString();

    if (body.action === 'vote') {
      const existing = await db.select().from(feedbackVotes)
        .where(and(eq(feedbackVotes.feedbackId, id), eq(feedbackVotes.email, user.email))).get();
      if (existing) {
        await db.delete(feedbackVotes).where(and(eq(feedbackVotes.feedbackId, id), eq(feedbackVotes.email, user.email)));
        return Response.json({ voted: false });
      }
      await db.insert(feedbackVotes).values({ feedbackId: id, email: user.email, createdAt: now }).onConflictDoNothing();
      return Response.json({ voted: true });
    }

    if (!TRIAGE_ROLES.includes(user.role)) {
      return Response.json({ error: 'Somente gerência ou coordenação altera o andamento.' }, { status: 403 });
    }
    const status = STATUSES.find((value) => value === body.status);
    if (!status) return Response.json({ error: 'Situação inválida.' }, { status: 400 });
    await db.update(feedback)
      .set({ status, handledBy: user.email, handledNote: body.note?.trim().slice(0, 1000) || null, updatedAt: now })
      .where(eq(feedback.id, id));
    return Response.json({ ok: true, status });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível atualizar o feedback.' }, { status: 500 });
  }
}
