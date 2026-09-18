import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { employeePresence, whatsappConversations, whatsappMessages } from '@/db/schema';
import { canUseWhatsapp, WHATSAPP_ROLES } from '@/lib/navigation';
import { roleLabels, type UserRole } from '@/lib/permissions';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { whatsappSenderLabel } from '@/lib/whatsapp-sender';
import { DEFAULT_ACCOUNT, type WhatsappAccountId } from '@/lib/whatsapp-accounts';

export async function senderLabelFor(user: { email: string; role: UserRole }) {
  const presence = await getDb().select({ displayName: employeePresence.displayName })
    .from(employeePresence).where(eq(employeePresence.email, user.email)).get();
  return whatsappSenderLabel(user.email, presence?.displayName, roleLabels[user.role]);
}

export const WHATSAPP_SUPPORT_ROLES = WHATSAPP_ROLES;

// Cargos com acesso ao WhatsApp (lib/navigation.ts): gerência, coordenação e
// analistas. N1 e técnicos de campo não entram.
export async function requireWhatsappUser(request: Request) {
  const current = await requireApiUser(request, [...WHATSAPP_SUPPORT_ROLES]);
  if (!canUseWhatsapp(current.role)) {
    throw Response.json({ error: 'O WhatsApp não está liberado para o seu acesso.' }, { status: 403 });
  }
  return current;
}

// Cada conta tem seu bridge: são duas instâncias, cada uma com a sessão de um
// número. A conta nova usa as variáveis com sufixo, e a principal segue com os
// nomes de sempre — assim o que já está no ar não muda de configuração.
function bridgeCredentials(account: WhatsappAccountId = DEFAULT_ACCOUNT) {
  const suffix = account === DEFAULT_ACCOUNT ? '' : `_${account.toUpperCase()}`;
  const config = env as unknown as Record<string, string | undefined>;
  return {
    url: config[`WHATSAPP_BRIDGE_URL${suffix}`]?.trim(),
    secret: config[`WHATSAPP_BRIDGE_SECRET${suffix}`]?.trim(),
  };
}

export function bridgeConfigured(account: WhatsappAccountId = DEFAULT_ACCOUNT) {
  const { url, secret } = bridgeCredentials(account);
  return Boolean(url && secret);
}

export async function bridgeFetch(path: string, init: RequestInit = {}, account: WhatsappAccountId = DEFAULT_ACCOUNT) {
  const { url, secret } = bridgeCredentials(account);
  if (!url || !secret) {
    throw Response.json({ error: 'O bridge deste WhatsApp não está configurado.' }, { status: 503 });
  }
  const headers = new Headers(init.headers);
  headers.set('x-bridge-secret', secret);
  return fetch(`${url}${path}`, { ...init, headers });
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
export async function fetchBridgePhoto(jid: string): Promise<{ photoUrl: string | null; limited: boolean }> {
  if (!bridgeConfigured()) return { photoUrl: null, limited: false };
  try {
    const upstream = await bridgeFetch(`/photo?${new URLSearchParams({ jid })}`);
    const payload = await upstream.json().catch(() => null) as { photoUrl?: string | null; limited?: boolean } | null;
    // limited: the bridge's per-minute lookup cap was hit; ask again later.
    return { photoUrl: payload?.photoUrl ?? null, limited: Boolean(payload?.limited) };
  } catch {
    return { photoUrl: null, limited: false };
  }
}

// Pairing QR (data URL) while the bridge waits to be linked, plus its state.
export async function fetchBridgeQr(): Promise<{ status: string; since: string | null; qr: string | null } | null> {
  if (!bridgeConfigured()) return null;
  const upstream = await bridgeFetch('/qr', { signal: AbortSignal.timeout(8_000) });
  if (!upstream.ok) return null;
  return upstream.json() as Promise<{ status: string; since: string | null; qr: string | null }>;
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
