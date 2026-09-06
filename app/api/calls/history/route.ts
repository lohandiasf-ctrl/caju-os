import { desc, eq } from 'drizzle-orm';
import { voiceCallHistory } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try { const current = await requireApiUser(request); const calls = await getDb().select().from(voiceCallHistory).where(eq(voiceCallHistory.ownerEmail, current.email)).orderBy(desc(voiceCallHistory.startedAt)).limit(40).all(); return Response.json({ calls }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const current = await requireApiUser(request); const body = await request.json() as { sessionId?: string; direction?: 'incoming' | 'outgoing'; kind?: 'direct' | 'group'; peerNames?: string; status?: 'missed' | 'declined' | 'completed' | 'failed'; startedAt?: string; endedAt?: string; durationSeconds?: number };
    if (!body.sessionId || !body.direction || !body.kind || !body.status) return Response.json({ error: 'Registro de chamada inválido.' }, { status: 400 });
    const values = { sessionId: body.sessionId.slice(0, 300), ownerEmail: current.email, direction: body.direction, kind: body.kind, peerNames: (body.peerNames || 'Colega').slice(0, 500), status: body.status, startedAt: body.startedAt || new Date().toISOString(), endedAt: body.endedAt || null, durationSeconds: Math.max(0, Math.min(86_400, Number(body.durationSeconds) || 0)) };
    await getDb().insert(voiceCallHistory).values(values).onConflictDoUpdate({ target: [voiceCallHistory.sessionId, voiceCallHistory.ownerEmail], set: values });
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível registrar a chamada.' }, { status: 500 }); }
}
