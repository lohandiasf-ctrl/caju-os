import { and, eq } from 'drizzle-orm';
import { appUsers, chatGroupMembers } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

async function requireOwner(groupId: number, email: string) {
  return getDb().select().from(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, groupId), eq(chatGroupMembers.email, email), eq(chatGroupMembers.memberRole, 'owner'))).get();
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request); const groupId = Number((await context.params).id);
    if (!Number.isSafeInteger(groupId) || !(await requireOwner(groupId, current.email))) return Response.json({ error: 'Somente o responsável pode adicionar colegas.' }, { status: 403 });
    const body = await request.json() as { email?: string }; const email = body.email?.trim().toLowerCase();
    if (!email || !(await getDb().select().from(appUsers).where(and(eq(appUsers.email, email), eq(appUsers.active, true))).get())) return Response.json({ error: 'Colega não encontrado.' }, { status: 404 });
    await getDb().insert(chatGroupMembers).values({ groupId, email, memberRole: 'member', joinedAt: new Date().toISOString() }).onConflictDoNothing();
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível adicionar o colega.' }, { status: 500 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request); const groupId = Number((await context.params).id); const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
    if (!Number.isSafeInteger(groupId) || !email || !(await requireOwner(groupId, current.email))) return Response.json({ error: 'Somente o responsável pode remover colegas.' }, { status: 403 });
    if (email === current.email) return Response.json({ error: 'O responsável não pode remover a si mesmo.' }, { status: 400 });
    await getDb().delete(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, groupId), eq(chatGroupMembers.email, email))).run();
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível remover o colega.' }, { status: 500 }); }
}
