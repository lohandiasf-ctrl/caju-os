import { bridgeFetch, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

// Asks the bridge to re-read the WhatsApp address book, so contacts the
// inbox only knows by "@lid" get their phone number without anyone typing it.
export async function POST(request: Request) {
  try {
    await requireWhatsappUser(request);
    // full=1: re-read the whole address book, not just what changed.
    const upstream = await bridgeFetch('/resync-contacts?full=1', { method: 'POST', signal: AbortSignal.timeout(60_000) });
    const payload = await upstream.json().catch(() => ({})) as { learned?: number; total?: number; error?: string };
    if (!upstream.ok) return Response.json({ error: payload.error ?? 'O bridge não conseguiu sincronizar os contatos.' }, { status: 502 });
    return Response.json({ learned: payload.learned ?? 0, total: payload.total ?? 0 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível sincronizar os contatos do WhatsApp.' }, { status: 502 });
  }
}
