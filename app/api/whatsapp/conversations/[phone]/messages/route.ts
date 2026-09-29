import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { whatsappContactNames, whatsappConversations, whatsappMessages } from '@/db/schema';
import { phoneKey } from '@/lib/whatsapp-contacts';
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
      // As 500 mais recentes (e não as 500 mais antigas), na ordem de leitura.
      db.select().from(whatsappMessages)
        .where(and(eq(whatsappMessages.account, account), eq(whatsappMessages.contactPhone, contactPhone), inArray(whatsappMessages.direction, ['incoming', 'outgoing'])))
        .orderBy(desc(whatsappMessages.occurredAt)).limit(500).all().then((rows) => rows.reverse()),
      withPresence ? fetchBridgePresence(contactPhone, account) : Promise.resolve(null),
    ]);
    const now = new Date().toISOString();
    await db.insert(whatsappConversations).values({ account, contactPhone, lastMessageAt: now, lastReadAt: now, lastReadBy: current.email, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [whatsappConversations.account, whatsappConversations.contactPhone], set: { lastReadAt: now, lastReadBy: current.email, updatedAt: now } });
    // Nome da agenda da operação no lugar do nome do perfil, quando o número está nela.
    const keys = [...new Set(messages.map((message) => phoneKey(message.senderJid) ?? (message.direction === 'incoming' ? phoneKey(contactPhone) : null)).filter((key): key is string => Boolean(key)))];
    const agenda = new Map<string, string>();
    for (let index = 0; index < keys.length; index += 80) {
      const chunk = keys.slice(index, index + 80);
      const rows = await db.select({ key: whatsappContactNames.phoneKey, name: whatsappContactNames.name }).from(whatsappContactNames).where(inArray(whatsappContactNames.phoneKey, chunk)).all();
      for (const row of rows) agenda.set(row.key, row.name);
    }
    const named = messages.map((message) => {
      const key = phoneKey(message.senderJid) ?? (message.direction === 'incoming' ? phoneKey(contactPhone) : null);
      const name = key ? agenda.get(key) : null;
      return name && message.direction === 'incoming' ? { ...message, contactName: name } : message;
    });
    return Response.json({ messages: named, ...(presence ? { presence } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar a conversa.' }, { status: 500 }); }
}
