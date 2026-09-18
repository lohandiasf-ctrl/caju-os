import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { whatsappConversations } from '@/db/schema';
import { requireWhatsappUser } from '@/lib/server/whatsapp-bridge';
import { participantJid } from '@/lib/whatsapp-group-name';
import { toWhatsappAccount } from '@/lib/whatsapp-accounts';

export async function PATCH(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireWhatsappUser(request);
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const body = await request.json().catch(() => null) as { ticketKey?: unknown; assignedTo?: unknown; phoneJid?: unknown } | null;
    if (!body || typeof body !== 'object') return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
    const now = new Date().toISOString();
    const set: Record<string, string | null> = { updatedAt: now };
    if ('ticketKey' in body) set.ticketKey = typeof body.ticketKey === 'string' ? body.ticketKey.trim().toUpperCase().slice(0, 40) || null : null;
    if ('assignedTo' in body) set.assignedTo = typeof body.assignedTo === 'string' ? body.assignedTo.trim().toLowerCase().slice(0, 200) || null : current.email;
    // The phone behind a "@lid" contact, needed to put it in a new group.
    if ('phoneJid' in body) {
      if (!body.phoneJid) set.phoneJid = null;
      else {
        const jid = typeof body.phoneJid === 'string' ? participantJid(body.phoneJid) : null;
        if (!jid?.endsWith('@s.whatsapp.net')) return Response.json({ error: 'Número inválido. Use DDD + número.' }, { status: 400 });
        set.phoneJid = jid;
      }
    }
    const db = getDb();
    const account = toWhatsappAccount(new URL(request.url).searchParams.get('account'));
    const alvo = and(eq(whatsappConversations.account, account), eq(whatsappConversations.contactPhone, contactPhone));
    const existing = await db.select().from(whatsappConversations).where(alvo).get();
    if (!existing) return Response.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    const conversation = await db.update(whatsappConversations).set(set).where(alvo).returning().get();
    return Response.json({ conversation });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível atualizar a conversa.' }, { status: 500 }); }
}
