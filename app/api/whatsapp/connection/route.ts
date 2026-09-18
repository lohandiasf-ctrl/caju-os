import { logSecurityEvent } from '@/lib/server/security-log';
import { toWhatsappAccount, whatsappAccountLabel } from '@/lib/whatsapp-accounts';
import { bridgeConfigured, bridgeFetch, fetchBridgeQr, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

// Scanning the QR links a device with full access to the operation's
// WhatsApp, so only management sees it or resets the session.
const CONNECTION_ROLES = new Set(['gerencia', 'coordenador']);

export async function GET(request: Request) {
  try {
    const user = await requireWhatsappUser(request);
    if (!CONNECTION_ROLES.has(user.role)) return Response.json({ error: 'Apenas gerência ou coordenação conecta o WhatsApp.' }, { status: 403 });
    // Cada número tem seu bridge e seu QR.
    const account = toWhatsappAccount(new URL(request.url).searchParams.get('account'));
    if (!bridgeConfigured(account)) {
      return Response.json({ error: `O bridge do ${whatsappAccountLabel(account)} ainda não foi configurado.` }, { status: 503 });
    }
    const state = await fetchBridgeQr(account);
    if (!state) return Response.json({ error: 'Bridge do WhatsApp fora do ar.' }, { status: 502 });
    return Response.json({ ...state, account }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível consultar a conexão do WhatsApp.' }, { status: 502 });
  }
}

// Drops the old linked-device session so the bridge shows a new QR code.
export async function POST(request: Request) {
  try {
    const user = await requireWhatsappUser(request);
    if (user.role !== 'gerencia') return Response.json({ error: 'Apenas a gerência gera um novo QR code.' }, { status: 403 });
    const account = toWhatsappAccount(new URL(request.url).searchParams.get('account'));
    const upstream = await bridgeFetch('/reset-session', { method: 'POST', signal: AbortSignal.timeout(20_000) }, account);
    const payload = await upstream.json().catch(() => ({})) as { error?: string };
    logSecurityEvent({ request, user, action: 'whatsapp_session_reset', outcome: upstream.ok ? 'allowed' : 'denied', details: { status: upstream.status, account } });
    if (!upstream.ok) return Response.json({ error: payload.error ?? 'O bridge recusou reiniciar a sessão.' }, { status: upstream.status === 409 ? 409 : 502 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível reiniciar a sessão do WhatsApp.' }, { status: 502 });
  }
}
