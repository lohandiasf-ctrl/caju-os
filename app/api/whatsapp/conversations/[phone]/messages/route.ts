import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { whatsappConversations, whatsappMessages } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

const SUPPORT_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

export async function GET(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireApiUser(request, [...SUPPORT_ROLES]);
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const db = getDb();
    const messages = await db.select().from(whatsappMessages)
      .where(and(eq(whatsappMessages.contactPhone, contactPhone), inArray(whatsappMessages.direction, ['incoming', 'outgoing'])))
      .orderBy(asc(whatsappMessages.occurredAt)).limit(500).all();
    const now = new Date().toISOString();
    await db.insert(whatsappConversations).values({ contactPhone, lastMessageAt: now, lastReadAt: now, lastReadBy: current.email, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: whatsappConversations.contactPhone, set: { lastReadAt: now, lastReadBy: current.email, updatedAt: now } });
    return Response.json({ messages }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar a conversa.' }, { status: 500 }); }
}
