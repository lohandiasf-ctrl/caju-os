import { env } from 'cloudflare:workers';

// Ingest endpoint for whatsapp-bridge/ (Baileys, non-official) — the unofficial
// counterpart to app/api/whatsapp/webhook/route.ts (Meta Cloud API). Same
// tables, same shape the UI already reads. Auth is a shared secret header,
// not Meta's HMAC, since the bridge isn't Meta infrastructure.
export async function POST(request: Request) {
  if (!env.WHATSAPP_BRIDGE_SECRET) return Response.json({ error: 'Bridge do WhatsApp ainda não está configurado.' }, { status: 503 });
  if (request.headers.get('x-bridge-secret') !== env.WHATSAPP_BRIDGE_SECRET) {
    return Response.json({ error: 'Segredo do bridge inválido.' }, { status: 403 });
  }

  const payload = await request.json().catch(() => null) as {
    wamid?: unknown; contactPhone?: unknown; contactName?: unknown; conversationName?: unknown;
    direction?: unknown; messageType?: unknown; body?: unknown; mediaId?: unknown; occurredAt?: unknown;
  } | null;
  if (!payload) return Response.json({ error: 'Carga inválida.' }, { status: 400 });

  const wamid = string(payload.wamid);
  const contactPhone = string(payload.contactPhone);
  const direction = payload.direction === 'outgoing' ? 'outgoing' : 'incoming';
  if (!wamid || !contactPhone) return Response.json({ error: 'wamid e contactPhone são obrigatórios.' }, { status: 400 });

  const contactName = string(payload.contactName) || null;
  // In a group contactName is the participant who wrote; the conversation is
  // named after the group subject, never after whoever spoke last.
  const conversationName = string(payload.conversationName) || (contactPhone.endsWith('@g.us') ? null : contactName);
  const messageType = string(payload.messageType) || 'text';
  const body = string(payload.body) || null;
  const mediaId = string(payload.mediaId) || null;
  const occurredAt = string(payload.occurredAt) || new Date().toISOString();
  const now = new Date().toISOString();

  // A reply sent from the app echoes back through the bridge with the same
  // wamid; whichever row lands first stays, and the send route fills in
  // sender_email on conflict.
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_messages (wamid, phone_number_id, contact_phone, contact_name, direction, message_type, body, media_id, delivery_status, occurred_at, created_at) VALUES (?, 'bridge', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
      .bind(wamid, contactPhone, contactName, direction, messageType, body, mediaId, occurredAt, now),
    env.DB.prepare(`
      INSERT INTO whatsapp_conversations (contact_phone, contact_name, last_message_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(contact_phone) DO UPDATE SET
        contact_name = COALESCE(excluded.contact_name, whatsapp_conversations.contact_name),
        last_message_at = excluded.last_message_at,
        updated_at = excluded.updated_at
    `).bind(contactPhone, conversationName, occurredAt, now, now),
  ]);

  return Response.json({ received: true });
}

function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
