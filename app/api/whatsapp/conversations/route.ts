import { desc, inArray, and } from 'drizzle-orm';
import { getDb } from '@/db';
import { whatsappConversations, whatsappMessages } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

const SUPPORT_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

export async function GET(request: Request) {
  try {
    await requireApiUser(request, [...SUPPORT_ROLES]);
    const db = getDb();
    const conversations = await db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.lastMessageAt)).limit(200).all();
    if (!conversations.length) return Response.json({ conversations: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    const phones = conversations.map((item) => item.contactPhone);
    const recent = await db.select().from(whatsappMessages)
      .where(and(inArray(whatsappMessages.contactPhone, phones), inArray(whatsappMessages.direction, ['incoming', 'outgoing'])))
      .orderBy(desc(whatsappMessages.id)).limit(1000).all();
    const items = conversations.map((conversation) => {
      const messages = recent.filter((item) => item.contactPhone === conversation.contactPhone);
      const lastMessage = messages[0] ?? null;
      const unread = messages.filter((item) => item.direction === 'incoming' && (!conversation.lastReadAt || item.occurredAt > conversation.lastReadAt)).length;
      return { ...conversation, lastMessage: lastMessage ? { body: lastMessage.body, direction: lastMessage.direction, occurredAt: lastMessage.occurredAt, messageType: lastMessage.messageType } : null, unread };
    });
    return Response.json({ conversations: items }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar as conversas do WhatsApp.' }, { status: 500 }); }
}
