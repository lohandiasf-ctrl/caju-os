import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { employeePresence, whatsappConversations, whatsappMessages } from '@/db/schema';
import { canUseWhatsapp } from '@/lib/navigation';
import { roleLabels, type UserRole } from '@/lib/permissions';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { whatsappSenderLabel } from '@/lib/whatsapp-sender';

export async function senderLabelFor(user: { email: string; role: UserRole }) {
  const presence = await getDb().select({ displayName: employeePresence.displayName })
    .from(employeePresence).where(eq(employeePresence.email, user.email)).get();
  return whatsappSenderLabel(user.email, presence?.displayName, roleLabels[user.role]);
}

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

// Contact's typing/recording/online state and profile photo. Best-effort:
// any bridge failure reads as "no information".
export async function fetchBridgePresence(jid: string): Promise<{ state: string | null; photoUrl: string | null }> {
  if (!bridgeConfigured()) return { state: null, photoUrl: null };
  try {
    const upstream = await bridgeFetch(`/presence?${new URLSearchParams({ jid })}`);
    const payload = await upstream.json().catch(() => null) as { state?: string | null; photoUrl?: string | null } | null;
    return { state: payload?.state ?? null, photoUrl: payload?.photoUrl ?? null };
  } catch {
    return { state: null, photoUrl: null };
  }
}

export type BridgeHealth = { status: 'open' | 'connecting' | 'qr' | 'logged_out' | 'unreachable'; since: string | null };

// WhatsApp session state, so the inbox can warn when messages stop arriving.
// null means "unknown" (bridge not configured, or a bridge without /status).
export async function fetchBridgeHealth(): Promise<BridgeHealth | null> {
  if (!bridgeConfigured()) return null;
  try {
    const upstream = await bridgeFetch('/status', { signal: AbortSignal.timeout(4_000) });
    if (upstream.status === 404) return null;
    if (!upstream.ok) return { status: 'unreachable', since: null };
    const payload = await upstream.json().catch(() => null) as { status?: string; since?: string } | null;
    const status = ['open', 'connecting', 'qr', 'logged_out'].includes(payload?.status ?? '') ? payload!.status as BridgeHealth['status'] : 'unreachable';
    return { status, since: payload?.since ?? null };
  } catch (error) {
    if (error instanceof Response) return null;
    return { status: 'unreachable', since: null };
  }
}

// Profile photo only, without subscribing to presence. Falls back to the
// /presence route on a bridge that predates /photo.
export async function fetchBridgePhoto(jid: string): Promise<string | null> {
  if (!bridgeConfigured()) return null;
  try {
    const upstream = await bridgeFetch(`/photo?${new URLSearchParams({ jid })}`);
    if (upstream.status === 404) return (await fetchBridgePresence(jid)).photoUrl;
    const payload = await upstream.json().catch(() => null) as { photoUrl?: string | null } | null;
    return payload?.photoUrl ?? null;
  } catch {
    return null;
  }
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
