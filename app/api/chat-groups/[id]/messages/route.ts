import { and, asc, eq } from 'drizzle-orm';
import { chatGroupMembers, chatGroupMessages, chatGroupReads, chatGroups } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

async function membership(groupId: number, email: string) { return getDb().select().from(chatGroupMembers).where(and(eq(chatGroupMembers.groupId, groupId), eq(chatGroupMembers.email, email))).get(); }

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request); const groupId = Number((await context.params).id);
    if (!Number.isSafeInteger(groupId) || !(await membership(groupId, current.email))) return Response.json({ error: 'Grupo não encontrado.' }, { status: 404 });
    const messages = await getDb().select().from(chatGroupMessages).where(eq(chatGroupMessages.groupId, groupId)).orderBy(asc(chatGroupMessages.id)).limit(200).all();
    const lastId = messages.at(-1)?.id ?? 0; const now = new Date().toISOString();
    await getDb().insert(chatGroupReads).values({ groupId, email: current.email, lastReadMessageId: lastId, updatedAt: now }).onConflictDoUpdate({ target: [chatGroupReads.groupId, chatGroupReads.email], set: { lastReadMessageId: lastId, updatedAt: now } });
    const members = await getDb().select().from(chatGroupMembers).where(eq(chatGroupMembers.groupId, groupId)).all();
    return Response.json({ messages, members }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar o grupo.' }, { status: 500 }); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request); const groupId = Number((await context.params).id); const member = await membership(groupId, current.email);
    if (!Number.isSafeInteger(groupId) || !member) return Response.json({ error: 'Grupo não encontrado.' }, { status: 404 });
    const body = await request.json() as { body?: string; ticketId?: string; attachment?: { name?: string; type?: string; data?: string } }; const text = body.body?.trim().slice(0, 2000) || ''; const ticketId = body.ticketId?.trim().slice(0, 40) || null;
    const attachment = body.attachment?.data ? { name: body.attachment.name?.trim().slice(0, 180) || 'Anexo', type: body.attachment.type?.trim() || 'application/octet-stream', data: body.attachment.data } : null;
    if (!text && !ticketId && !attachment) return Response.json({ error: 'Escreva uma mensagem ou anexe um item.' }, { status: 400 });
    if (attachment && !attachment.type.startsWith('image/') && !attachment.type.startsWith('audio/') && attachment.type !== 'application/pdf') return Response.json({ error: 'Só é permitido enviar imagens, áudios ou PDFs.' }, { status: 400 });
    if (attachment && (!attachment.data.startsWith('data:') || attachment.data.length > 1_000_000)) return Response.json({ error: 'Anexo inválido ou muito grande.' }, { status: 400 });
    const now = new Date().toISOString(); const message = await getDb().insert(chatGroupMessages).values({ groupId, senderEmail: current.email, body: text, ticketId, ...(attachment ? { attachmentName: attachment.name, attachmentType: attachment.type, attachmentData: attachment.data } : {}), createdAt: now }).returning().get();
    await getDb().update(chatGroups).set({ updatedAt: now }).where(eq(chatGroups.id, groupId)).run();
    return Response.json({ message }, { status: 201 });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 }); }
}
