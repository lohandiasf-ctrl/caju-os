import { and, desc, eq, inArray } from 'drizzle-orm';
import { appUsers, chatGroupMembers, chatGroupMessages, chatGroupReads, chatGroups } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    const current = await requireApiUser(request); const db = getDb();
    const memberships = await db.select().from(chatGroupMembers).where(eq(chatGroupMembers.email, current.email)).all();
    if (!memberships.length) return Response.json({ groups: [] });
    const ids = memberships.map((item) => item.groupId);
    const [groups, members, reads, recent] = await Promise.all([
      db.select().from(chatGroups).where(inArray(chatGroups.id, ids)).orderBy(desc(chatGroups.updatedAt)).all(),
      db.select().from(chatGroupMembers).where(inArray(chatGroupMembers.groupId, ids)).all(),
      db.select().from(chatGroupReads).where(and(inArray(chatGroupReads.groupId, ids), eq(chatGroupReads.email, current.email))).all(),
      db.select().from(chatGroupMessages).where(inArray(chatGroupMessages.groupId, ids)).orderBy(desc(chatGroupMessages.id)).limit(200).all(),
    ]);
    return Response.json({ groups: groups.map((group) => {
      const read = reads.find((item) => item.groupId === group.id)?.lastReadMessageId ?? 0;
      const messages = recent.filter((item) => item.groupId === group.id);
      return { ...group, members: members.filter((item) => item.groupId === group.id), lastMessage: messages[0] ?? null, unread: messages.filter((item) => item.id > read && item.senderEmail !== current.email).length };
    }) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar os grupos.' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const current = await requireApiUser(request); const body = await request.json() as { name?: string; members?: string[] };
    const name = body.name?.trim().slice(0, 60); const emails = [...new Set([current.email, ...(body.members ?? []).map((item) => item.trim().toLowerCase())])].slice(0, 30);
    if (!name || emails.length < 2) return Response.json({ error: 'Informe um nome e pelo menos um colega.' }, { status: 400 });
    const active = await getDb().select({ email: appUsers.email }).from(appUsers).where(and(inArray(appUsers.email, emails), eq(appUsers.active, true))).all();
    if (active.length !== emails.length) return Response.json({ error: 'Um dos colegas selecionados não está ativo.' }, { status: 400 });
    const now = new Date().toISOString(); const group = await getDb().insert(chatGroups).values({ name, createdBy: current.email, createdAt: now, updatedAt: now }).returning().get();
    await getDb().insert(chatGroupMembers).values(emails.map((email) => ({ groupId: group.id, email, memberRole: email === current.email ? 'owner' as const : 'member' as const, joinedAt: now }))).run();
    return Response.json({ group }, { status: 201 });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível criar o grupo.' }, { status: 500 }); }
}
