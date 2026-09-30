import { env } from 'cloudflare:workers';
import { DEFAULT_ACCOUNT } from '@/lib/whatsapp-accounts';
import { requireWhatsappUser } from '@/lib/server/whatsapp-bridge';
import { ticketGroups, ticketNumber, type GroupRow } from '@/lib/whatsapp-ticket-group';

// O grupo do WhatsApp de um chamado (nome com o FSA, data mais recente no título),
// para o botão "Ir ao grupo" do chamado.
export async function GET(request: Request) {
  try {
    await requireWhatsappUser(request);
    const key = new URL(request.url).searchParams.get('ticketKey') ?? '';
    const number = ticketNumber(key);
    if (!number) return Response.json({ error: 'Chamado inválido.' }, { status: 400 });
    // Todos os grupos: o título pode abreviar o número ("FSA-133516 | 825"), então o filtro é em código.
    const rows = (await env.DB.prepare(`SELECT contact_phone AS contactPhone, contact_name AS contactName, last_message_at AS lastMessageAt
      FROM whatsapp_conversations WHERE account = ?1 AND contact_phone LIKE '%@g.us' AND contact_name IS NOT NULL`).bind(DEFAULT_ACCOUNT).all<GroupRow>()).results;
    const groups = ticketGroups(rows, key);
    const best = groups[0];
    return Response.json({ group: best ? { contactPhone: best.contactPhone, name: best.contactName } : null, others: Math.max(0, groups.length - 1) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao buscar o grupo do chamado', error);
    return Response.json({ error: 'Não foi possível buscar o grupo do WhatsApp.' }, { status: 500 });
  }
}
