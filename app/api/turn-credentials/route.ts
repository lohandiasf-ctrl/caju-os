import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Cloudflare Realtime issues short-lived TURN credentials rather than static
// ones, so they cannot live in NEXT_PUBLIC_* build-time vars. Minting them here
// keeps TURN_KEY_API_TOKEN server-side and hands the browser a credential that
// expires on its own.
const TTL_SECONDS = 3600;

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const keyId = env.TURN_KEY_ID?.trim();
    const apiToken = env.TURN_KEY_API_TOKEN?.trim();
    // Not configured is not an error: the caller falls back to STUN only.
    if (!keyId || !apiToken) {
      return Response.json({ iceServers: [], ttl: TTL_SECONDS, configured: false }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );
    if (!response.ok) {
      return Response.json({ error: 'Não foi possível gerar credenciais TURN.' }, { status: 502 });
    }
    const payload = await response.json() as { iceServers?: unknown };
    const iceServers = Array.isArray(payload.iceServers) ? payload.iceServers : [payload.iceServers].filter(Boolean);
    return Response.json({ iceServers, ttl: TTL_SECONDS, configured: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível gerar credenciais TURN.' }, { status: 500 });
  }
}
