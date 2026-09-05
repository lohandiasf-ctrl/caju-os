import { asc, eq } from 'drizzle-orm';
import { technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const rows = await getDb().select({ id: technicians.id, name: technicians.name, email: technicians.email, phone: technicians.phone, city: technicians.baseCity, state: technicians.baseState, status: technicians.status, approved: technicians.approved }).from(technicians).orderBy(asc(technicians.name)).all();
    return Response.json({ technicians: rows }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os técnicos.' }, { status: 500 });
  }
}
