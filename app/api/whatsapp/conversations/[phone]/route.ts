import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { whatsappConversations } from '@/db/schema';
import { requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

export async function PATCH(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireWhatsappUser(request);
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const body = await request.json().catch(() => null) as { ticketKey?: unknown } | null;
    if (!body || typeof body !== 'object') return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    const now = new Date().toISOString();
    const set: Record<string, string | null> = { updatedAt: now };
    if ('ticketKey' in body) set.ticketKey = typeof body.ticketKey === 'string' ? body.ticketKey.trim().toUpperCase().slice(0, 40) || null : null;
    // Participants (assigned_to) change only through ./participants.
    const db = getDb();
    const existing = await db.select().from(whatsappConversations).where(eq(whatsappConversations.contactPhone, contactPhone)).get();
    if (!existing) return Response.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    const conversation = await db.update(whatsappConversations).set(set).where(eq(whatsappConversations.contactPhone, contactPhone)).returning().get();
    return Response.json({ conversation });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível atualizar a conversa.' }, { status: 500 }); }
}
