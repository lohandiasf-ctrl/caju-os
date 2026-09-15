import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { whatsappConversations, whatsappMessages } from '@/db/schema';
import { canUseWhatsapp } from '@/lib/navigation';
import { requireApiUser } from '@/lib/server/firebase-auth';

export const WHATSAPP_SUPPORT_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

// Role check plus the closed-pilot allowlist (lib/navigation.ts).
export async function requireWhatsappUser(request: Request) {
  const current = await requireApiUser(request, [...WHATSAPP_SUPPORT_ROLES]);
  if (!canUseWhatsapp(current.email)) {
    throw Response.json({ error: 'O WhatsApp está em teste e ainda não está liberado para o seu acesso.' }, { status: 403 });
  }
  return current;
}

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
  // sent message; keep that row and attribute it to the sender.
  await db.insert(whatsappMessages).values({
    ...row, contactName: null, direction: 'outgoing', deliveryStatus: null, occurredAt: now, createdAt: now,
  }).onConflictDoUpdate({ target: whatsappMessages.wamid, set: { senderEmail: row.senderEmail, mediaId: row.mediaId } });
  await db.insert(whatsappConversations).values({ contactPhone: row.contactPhone, lastMessageAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: whatsappConversations.contactPhone, set: { lastMessageAt: now, updatedAt: now } });
}
