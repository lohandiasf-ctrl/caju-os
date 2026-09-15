import { bridgeConfigured, bridgeFetch, fetchBridgePhoto, fetchBridgePresence, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

// Contact's live state (typing / recording / online) and profile photo.
// ?photo=1 returns only the photo (avatars in the list and group bubbles).
export async function GET(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    await requireWhatsappUser(request);
    const { phone } = await context.params;
    const jid = decodeURIComponent(phone);
    const payload = new URL(request.url).searchParams.get('photo') === '1'
      ? { state: null, ...await fetchBridgePhoto(jid) }
      : await fetchBridgePresence(jid);
    return Response.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ state: null, photoUrl: null }); }
}

// Tells the contact that the agent is typing or recording.
export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    await requireWhatsappUser(request);
    if (!bridgeConfigured()) return Response.json({ ok: false });
    const { phone } = await context.params;
    const body = await request.json().catch(() => null) as { state?: unknown } | null;
    const state = body?.state === 'composing' || body?.state === 'recording' ? body.state : 'paused';
    await bridgeFetch('/typing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: decodeURIComponent(phone), state }) });
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ ok: false }); }
}
