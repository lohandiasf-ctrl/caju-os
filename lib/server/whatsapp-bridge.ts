import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { employeePresence, whatsappConversations, whatsappMessages } from '@/db/schema';
import { roleLabels, type UserRole } from '@/lib/permissions';
import { whatsappSenderLabel } from '@/lib/whatsapp-sender';

export async function senderLabelFor(user: { email: string; role: UserRole }) {
  const presence = await getDb().select({ displayName: employeePresence.displayName })
    .from(employeePresence).where(eq(employeePresence.email, user.email)).get();
  return whatsappSenderLabel(user.email, presence?.displayName, roleLabels[user.role]);
}

export const WHATSAPP_SUPPORT_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

export function bridgeConfigured() {
  return Boolean(env.WHATSAPP_BRIDGE_URL && env.WHATSAPP_BRIDGE_SECRET);
}

export async function bridgeFetch(path: string, init: RequestInit = {}) {
  if (!bridgeConfigured()) {
    throw Response.json({ error: 'O bridge do WhatsApp não está configurado.' }, { status: 503 });
  }
  const headers = new Headers(init.headers);
  headers.set('x-bridge-secret', env.WHATSAPP_BRIDGE_SECRET!);
  return fetch(`${env.WHATSAPP_BRIDGE_URL}${path}`, { ...init, headers });
}

export async function recordOutgoing(row: {
  wamid: string; phoneNumberId: string; contactPhone: string; messageType: string;
  body: string | null; mediaId: string | null; senderEmail: string;
}) {
  const now = new Date().toISOString();
  const db = getDb();
  // The bridge may already have stored this wamid from its own echo of the
  // sent message (with the signature line in the body); keep that row, but
  // store the unsigned body since the inbox shows the sender separately.
  await db.insert(whatsappMessages).values({
    ...row, contactName: null, direction: 'outgoing', deliveryStatus: null, occurredAt: now, createdAt: now,
  }).onConflictDoUpdate({ target: whatsappMessages.wamid, set: { senderEmail: row.senderEmail, mediaId: row.mediaId, body: row.body } });
  await db.insert(whatsappConversations).values({ contactPhone: row.contactPhone, lastMessageAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: whatsappConversations.contactPhone, set: { lastMessageAt: now, updatedAt: now } });
}
