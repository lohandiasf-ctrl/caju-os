import { and, eq } from 'drizzle-orm';
import { chatGroupMembers, chatGroupMessages, chatGroupReads, chatGroups } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

async function requireOwner(groupId: number, email: string) {
  return getDb().select().from(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, groupId), eq(chatGroupMembers.email, email), eq(chatGroupMembers.memberRole, 'owner'))).get();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request); const groupId = Number((await context.params).id);
    if (!Number.isSafeInteger(groupId) || !(await requireOwner(groupId, current.email))) return Response.json({ error: 'Somente o responsável pode renomear o grupo.' }, { status: 403 });
    const body = await request.json().catch(() => null) as { name?: unknown } | null;
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : '';
    if (!name) return Response.json({ error: 'Informe um nome para o grupo.' }, { status: 400 });
    const group = await getDb().update(chatGroups).set({ name, updatedAt: new Date().toISOString() }).where(eq(chatGroups.id, groupId)).returning().get();
    return Response.json({ group });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível renomear o grupo.' }, { status: 500 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request); const groupId = Number((await context.params).id);
    if (!Number.isSafeInteger(groupId) || !(await requireOwner(groupId, current.email))) return Response.json({ error: 'Somente o responsável pode excluir o grupo.' }, { status: 403 });
    await getDb().delete(chatGroupMessages).where(eq(chatGroupMessages.groupId, groupId)).run();
    await getDb().delete(chatGroupReads).where(eq(chatGroupReads.groupId, groupId)).run();
    await getDb().delete(chatGroupMembers).where(eq(chatGroupMembers.groupId, groupId)).run();
    await getDb().delete(chatGroups).where(eq(chatGroups.id, groupId)).run();
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível excluir o grupo.' }, { status: 500 }); }
}
