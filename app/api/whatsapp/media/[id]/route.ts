import { requireApiUser } from '@/lib/server/firebase-auth';
import { bridgeFetch, WHATSAPP_SUPPORT_ROLES } from '@/lib/server/whatsapp-bridge';

// Media lives on the bridge's disk; this proxies it so the browser never sees
// the bridge secret.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(request, [...WHATSAPP_SUPPORT_ROLES]);
    const { id } = await context.params;
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, '');
    if (!safeId) return Response.json({ error: 'Mídia inválida.' }, { status: 400 });
    const upstream = await bridgeFetch(`/media/${safeId}`);
    if (!upstream.ok || !upstream.body) return Response.json({ error: 'Mídia não encontrada.' }, { status: upstream.status === 404 ? 404 : 502 });
    const headers = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' });
    const fileName = upstream.headers.get('X-File-Name');
    if (fileName) headers.set('X-File-Name', fileName);
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar a mídia.' }, { status: 500 }); }
}
