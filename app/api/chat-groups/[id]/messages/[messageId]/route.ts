import { and, eq } from 'drizzle-orm';
import { chatGroupMessages } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

async function requireOwnMessage(groupId: number, messageId: number, email: string) {
  return getDb().select().from(chatGroupMessages).where(and(eq(chatGroupMessages.id, messageId), eq(chatGroupMessages.groupId, groupId), eq(chatGroupMessages.senderEmail, email))).get();
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const current = await requireApiUser(request);
    const { id, messageId: messageIdParam } = await context.params;
    const groupId = Number(id); const messageId = Number(messageIdParam);
    if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(messageId)) return Response.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
    const existing = await requireOwnMessage(groupId, messageId, current.email);
    if (!existing) return Response.json({ error: 'Você só pode editar suas próprias mensagens.' }, { status: 403 });
    if (existing.deletedAt) return Response.json({ error: 'Esta mensagem foi apagada.' }, { status: 400 });
    const body = await request.json().catch(() => null) as { body?: unknown } | null;
    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 2000) : '';
    if (!text) return Response.json({ error: 'A mensagem não pode ficar vazia.' }, { status: 400 });
    const now = new Date().toISOString();
    const history = existing.editHistory ? JSON.parse(existing.editHistory) as Array<{ body: string; editedAt: string }> : [];
    history.push({ body: existing.body, editedAt: existing.editedAt ?? existing.createdAt });
    const message = await getDb().update(chatGroupMessages).set({ body: text, editedAt: now, editHistory: JSON.stringify(history.slice(-20)) }).where(eq(chatGroupMessages.id, messageId)).returning().get();
    return Response.json({ message });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível editar a mensagem.' }, { status: 500 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const current = await requireApiUser(request);
    const { id, messageId: messageIdParam } = await context.params;
    const groupId = Number(id); const messageId = Number(messageIdParam);
    if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(messageId)) return Response.json({ error: 'Mensagem não encontrada.' }, { status: 404 });
    const existing = await requireOwnMessage(groupId, messageId, current.email);
    if (!existing) return Response.json({ error: 'Você só pode apagar suas próprias mensagens.' }, { status: 403 });
    // Deletes for other members only: the sender keeps seeing the original
    // message (GET .../messages hides body/attachment for everyone except
    // senderEmail when deletedAt is set).
    await getDb().update(chatGroupMessages).set({ deletedAt: new Date().toISOString() }).where(eq(chatGroupMessages.id, messageId)).run();
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível apagar a mensagem.' }, { status: 500 }); }
}
