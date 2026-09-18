import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { whatsappConversations, whatsappMessages } from '@/db/schema';
import { toWhatsappAccount } from '@/lib/whatsapp-accounts';
import { fetchBridgePresence, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

export async function GET(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireWhatsappUser(request);
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    // ?presence=1 folds the contact's typing state into the same poll, so an
    // open conversation costs one request per refresh instead of two (the
    // API limits requests per IP across the whole app).
    const params = new URL(request.url).searchParams;
    const withPresence = params.get('presence') === '1';
    // A conversa é de um dos números; as mensagens do outro não entram.
    const account = toWhatsappAccount(params.get('account'));
    const db = getDb();
    const [messages, presence] = await Promise.all([
      db.select().from(whatsappMessages)
        .where(and(eq(whatsappMessages.account, account), eq(whatsappMessages.contactPhone, contactPhone), inArray(whatsappMessages.direction, ['incoming', 'outgoing'])))
        .orderBy(asc(whatsappMessages.occurredAt)).limit(500).all(),
      withPresence ? fetchBridgePresence(contactPhone, account) : Promise.resolve(null),
    ]);
    const now = new Date().toISOString();
    await db.insert(whatsappConversations).values({ account, contactPhone, lastMessageAt: now, lastReadAt: now, lastReadBy: current.email, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [whatsappConversations.account, whatsappConversations.contactPhone], set: { lastReadAt: now, lastReadBy: current.email, updatedAt: now } });
    return Response.json({ messages, ...(presence ? { presence } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar a conversa.' }, { status: 500 }); }
}
