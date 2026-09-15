import { desc, inArray, and } from 'drizzle-orm';
import { getDb } from '@/db';
import { whatsappConversations, whatsappMessages } from '@/db/schema';
import { fetchBridgeHealth, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

export async function GET(request: Request) {
  try {
    await requireWhatsappUser(request);
    const db = getDb();
    // Bridge health rides on the list poll instead of costing its own request.
    const [conversations, bridge] = await Promise.all([
      db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.lastMessageAt)).limit(200).all(),
      fetchBridgeHealth(),
    ]);
    if (!conversations.length) return Response.json({ conversations: [], bridge }, { headers: { 'Cache-Control': 'private, no-store' } });
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
    return Response.json({ conversations: items, bridge }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar as conversas do WhatsApp.' }, { status: 500 }); }
}
