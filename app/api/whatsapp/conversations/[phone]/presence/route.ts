import { bridgeConfigured, bridgeFetch, fetchBridgePresence, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

// Contact's live state (typing / recording / online) and profile photo.
export async function GET(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    await requireWhatsappUser(request);
    const { phone } = await context.params;
    return Response.json(await fetchBridgePresence(decodeURIComponent(phone)), { headers: { 'Cache-Control': 'private, no-store' } });
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
