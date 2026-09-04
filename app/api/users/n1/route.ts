import { eq } from 'drizzle-orm';
import { appUsers } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'n1', 'analista']);
    const users = await getDb().select({ email: appUsers.email, active: appUsers.active }).from(appUsers).where(eq(appUsers.role, 'n1')).all();
    return Response.json({ users: users.filter((user) => user.active).map((user) => ({ email: user.email, role: 'n1' as const })) }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Falha ao carregar equipe N1.' }, { status: 500 });
  }
}
