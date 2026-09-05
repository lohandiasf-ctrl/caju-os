import { asc, eq } from 'drizzle-orm';
import { technicians, technicianReviews } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(request);
    const technicianId = Number((await params).id);
    if (!Number.isInteger(technicianId)) return Response.json({ error: 'Técnico inválido.' }, { status: 400 });
    const reviews = await getDb().select().from(technicianReviews).where(eq(technicianReviews.technicianId, technicianId)).orderBy(asc(technicianReviews.createdAt)).all();
    return Response.json({ reviews }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar as avaliações.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const author = await requireApiUser(request);
    const technicianId = Number((await params).id);
    const payload = await request.json() as { rating?: number; comment?: string };
    const rating = Number(payload.rating);
    const comment = typeof payload.comment === 'string' ? payload.comment.trim().slice(0, 1000) : '';
    if (!Number.isInteger(technicianId) || !Number.isInteger(rating) || rating < 0 || rating > 5 || !comment) return Response.json({ error: 'Informe uma nota de 0 a 5 e um comentário.' }, { status: 400 });
    const technician = await getDb().select({ id: technicians.id }).from(technicians).where(eq(technicians.id, technicianId)).get();
    if (!technician) return Response.json({ error: 'Técnico não encontrado.' }, { status: 404 });
    const review = await getDb().insert(technicianReviews).values({ technicianId, authorEmail: author.email, rating, comment, createdAt: new Date().toISOString() }).returning().get();
    return Response.json({ review }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível salvar a avaliação.' }, { status: 500 });
  }
}
