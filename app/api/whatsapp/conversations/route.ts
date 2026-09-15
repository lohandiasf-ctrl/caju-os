import { env } from 'cloudflare:workers';
import { fetchBridgeHealth, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

type Row = {
  contact_phone: string; contact_name: string | null; ticket_key: string | null; assigned_to: string | null;
  last_message_at: string; last_read_at: string | null; last_read_by: string | null; created_at: string; updated_at: string;
  last_body: string | null; last_direction: string | null; last_occurred_at: string | null; last_message_type: string | null; unread: number;
};

// Last message and unread count come from correlated subqueries instead of
// an IN (...) list of phones: D1 caps a query at 100 bound parameters, and
// the group sync easily puts more conversations than that in the list.
const LIST_SQL = `
  SELECT c.*,
    lm.body AS last_body, lm.direction AS last_direction, lm.occurred_at AS last_occurred_at, lm.message_type AS last_message_type,
    (SELECT COUNT(*) FROM whatsapp_messages u
      WHERE u.contact_phone = c.contact_phone AND u.direction = 'incoming'
        AND (c.last_read_at IS NULL OR u.occurred_at > c.last_read_at)) AS unread
  FROM (SELECT * FROM whatsapp_conversations ORDER BY last_message_at DESC LIMIT 200) c
  LEFT JOIN whatsapp_messages lm ON lm.id = (
    SELECT m.id FROM whatsapp_messages m
    WHERE m.contact_phone = c.contact_phone AND m.direction IN ('incoming', 'outgoing')
    ORDER BY m.id DESC LIMIT 1)
  ORDER BY c.last_message_at DESC`;

export async function GET(request: Request) {
  try {
    await requireWhatsappUser(request);
    // Bridge health rides on the list poll instead of costing its own request.
    const [{ results }, bridge] = await Promise.all([
      env.DB.prepare(LIST_SQL).all<Row>(),
      fetchBridgeHealth(),
    ]);
    const conversations = results.map((row) => ({
      contactPhone: row.contact_phone, contactName: row.contact_name, ticketKey: row.ticket_key, assignedTo: row.assigned_to,
      lastMessageAt: row.last_message_at, lastReadAt: row.last_read_at, lastReadBy: row.last_read_by, createdAt: row.created_at, updatedAt: row.updated_at,
      lastMessage: row.last_occurred_at ? { body: row.last_body, direction: row.last_direction, occurredAt: row.last_occurred_at, messageType: row.last_message_type } : null,
      unread: Number(row.unread) || 0,
    }));
    return Response.json({ conversations, bridge }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao listar conversas do WhatsApp', error);
    return Response.json({ error: 'Não foi possível carregar as conversas do WhatsApp.' }, { status: 500 });
  }
}
