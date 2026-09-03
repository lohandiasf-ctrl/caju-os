import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    return Response.json(user, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao consultar perfil autenticado', error);
    return Response.json({ error: 'Falha ao consultar o perfil.' }, { status: 500 });
  }
}
