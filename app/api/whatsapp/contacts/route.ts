import { bridgeFetch, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

// Address book and groups of the operation's number, for starting a chat
// with someone who never wrote to it. ?q= filters by name or number.
export async function GET(request: Request) {
  try {
    await requireWhatsappUser(request);
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    const upstream = await bridgeFetch(`/contacts?${new URLSearchParams({ q: query })}`, { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok) return Response.json({ error: 'Bridge do WhatsApp fora do ar.' }, { status: 502 });
    const payload = await upstream.json().catch(() => null) as { contacts?: Array<{ jid: string; name: string; type: string }> } | null;
    return Response.json({ contacts: payload?.contacts ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os contatos do WhatsApp.' }, { status: 502 });
  }
}

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
