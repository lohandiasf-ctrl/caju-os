import { env } from 'cloudflare:workers';
import { isGroupJid, parseBridgeGroups, parseBridgeMessage, parseBridgeMessageEvent } from '@/lib/whatsapp-bridge-payload';
import { accountFromSecret, bridgeFetch } from '@/lib/server/whatsapp-bridge';
import type { WhatsappAccountId } from '@/lib/whatsapp-accounts';

// Fetch contact name from the bridge's address book when it's missing.
// Best-effort: if the bridge can't provide it, the message still stores successfully.
async function enrichContactName(contactPhone: string, account: WhatsappAccountId | null): Promise<string | null> {
  if (!account) return null;
  if (isGroupJid(contactPhone)) return null;
  try {
    const upstream = await bridgeFetch(`/contacts?${new URLSearchParams({ q: contactPhone })}`, { signal: AbortSignal.timeout(5_000) }, account);
    if (!upstream.ok) return null;
    const payload = await upstream.json().catch(() => null) as { contacts?: Array<{ jid: string; name: string }> } | null;
    const contact = payload?.contacts?.find((c) => c.jid === contactPhone);
    return contact?.name || null;
  } catch {
    return null;
  }
}

// Ingest endpoint for whatsapp-bridge/ (Baileys, non-official) — the unofficial
// counterpart to app/api/whatsapp/webhook/route.ts (Meta Cloud API). Same
// tables, same shape the UI already reads. Auth is a shared secret header,
// not Meta's HMAC, since the bridge isn't Meta infrastructure.
export async function POST(request: Request) {
  // O segredo diz de qual número é a mensagem: cada bridge tem o seu.
  const account = accountFromSecret(request.headers.get('x-bridge-secret'));
  if (!account) {
    return Response.json({ error: 'Segredo do bridge inválido.' }, { status: 403 });
  }

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload !== 'object') return Response.json({ error: 'Carga inválida.' }, { status: 400 });
  const now = new Date().toISOString();

  if (payload.type === 'groups') return syncGroups(payload, now, account);
  if (payload.type === 'revoke' || payload.type === 'edit') {
    const event = parseBridgeMessageEvent(payload);
    if (!event) return Response.json({ error: 'Evento inválido.' }, { status: 400 });
    // The text is kept on delete so the operation still has the record.
    await (event.type === 'revoke'
      ? env.DB.prepare('UPDATE whatsapp_messages SET deleted_at = ? WHERE account = ? AND wamid = ? AND contact_phone = ?').bind(now, account, event.wamid, event.contactPhone)
      : env.DB.prepare('UPDATE whatsapp_messages SET body = ?, edited_at = ? WHERE account = ? AND wamid = ? AND contact_phone = ?').bind(event.body, now, account, event.wamid, event.contactPhone)
    ).run();
    return Response.json({ received: true });
  }

  const message = parseBridgeMessage(payload, now);
  if (!message) return Response.json({ error: 'wamid e contactPhone são obrigatórios.' }, { status: 400 });

  // Enrich missing contact names from the bridge for 1:1 conversations.
  let contactName = message.contactName;
  let conversationName = message.conversationName;
  if (!contactName && !isGroupJid(message.contactPhone)) {
    contactName = await enrichContactName(message.contactPhone, account);
    if (contactName && !conversationName) conversationName = contactName;
  }

  // A reply sent from the app echoes back through the bridge with the same
  // wamid; whichever row lands first stays, and the send route fills in
  // sender_email on conflict.
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_messages (account, wamid, phone_number_id, contact_phone, contact_name, sender_jid, direction, message_type, body, media_id, quoted_wamid, quoted_body, quoted_name, delivery_status, occurred_at, created_at) VALUES (?, ?, 'bridge', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
      .bind(account, message.wamid, message.contactPhone, contactName, message.senderJid, message.direction, message.messageType, message.body, message.mediaId, message.quotedWamid, message.quotedBody, message.quotedName, message.occurredAt, now),
    env.DB.prepare(`
      INSERT INTO whatsapp_conversations (account, contact_phone, contact_name, ticket_key, last_message_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account, contact_phone) DO UPDATE SET
        contact_name = COALESCE(excluded.contact_name, whatsapp_conversations.contact_name),
        ticket_key = COALESCE(excluded.ticket_key, whatsapp_conversations.ticket_key),
        last_message_at = excluded.last_message_at,
        updated_at = excluded.updated_at
    `).bind(account, message.contactPhone, conversationName, message.ticketKeys, message.occurredAt, now, now),
  ]);

  return Response.json({ received: true });
}

// Group list sent when the bridge connects, and on renames / new groups. A
// group whose name carries FSAs shows up in the inbox even before anyone
// writes in it; other groups only get their name refreshed if they already
// have a conversation, so unrelated groups don't flood the list.
async function syncGroups(payload: Record<string, unknown>, now: string, account: string) {
  const groups = parseBridgeGroups(payload);
  const statements = groups.map((group) => group.ticketKeys
    ? env.DB.prepare(`
        INSERT INTO whatsapp_conversations (account, contact_phone, contact_name, ticket_key, last_message_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account, contact_phone) DO UPDATE SET
          contact_name = COALESCE(excluded.contact_name, whatsapp_conversations.contact_name),
          ticket_key = excluded.ticket_key,
          updated_at = excluded.updated_at
      `).bind(account, group.jid, group.name, group.ticketKeys, group.createdAt ?? now, now, now)
    : env.DB.prepare(`UPDATE whatsapp_conversations SET contact_name = COALESCE(?, contact_name), updated_at = ? WHERE account = ? AND contact_phone = ?`)
      .bind(group.name, now, account, group.jid));
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
  return Response.json({ received: true, groups: groups.length });
}
