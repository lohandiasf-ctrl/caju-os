import { and, eq, gt, ne } from 'drizzle-orm';
import { chatTyping } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

function directKey(a: string, b: string) { return `direct:${[a.toLowerCase(), b.toLowerCase()].sort().join(':')}`; }

export async function GET(request: Request) {
  try {
    const current = await requireApiUser(request); const withEmail = new URL(request.url).searchParams.get('with')?.trim().toLowerCase();
    if (!withEmail) return Response.json({ typing: [] });
    const typing = await getDb().select({ email: chatTyping.email }).from(chatTyping).where(and(eq(chatTyping.conversationKey, directKey(current.email, withEmail)), ne(chatTyping.email, current.email), gt(chatTyping.expiresAt, new Date().toISOString()))).all();
    return Response.json({ typing: typing.map((item) => item.email) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ typing: [] }); }
}

export async function POST(request: Request) {
  try {
    const current = await requireApiUser(request); const body = await request.json() as { with?: string; active?: boolean }; const withEmail = body.with?.trim().toLowerCase();
    if (!withEmail) return Response.json({ error: 'Conversa inválida.' }, { status: 400 });
    const key = directKey(current.email, withEmail);
    if (!body.active) await getDb().delete(chatTyping).where(and(eq(chatTyping.conversationKey, key), eq(chatTyping.email, current.email))).run();
    else await getDb().insert(chatTyping).values({ conversationKey: key, email: current.email, expiresAt: new Date(Date.now() + 6_000).toISOString() }).onConflictDoUpdate({ target: [chatTyping.conversationKey, chatTyping.email], set: { expiresAt: new Date(Date.now() + 6_000).toISOString() } });
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Falha ao atualizar digitação.' }, { status: 500 }); }
}
