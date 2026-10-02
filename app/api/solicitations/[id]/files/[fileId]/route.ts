import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Entrega o arquivo de um anexo (foto ou PDF) já decodificado.
export async function GET(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'analista']);
    const { id, fileId } = await context.params;
    const row = await env.DB.prepare(`SELECT name, mime_type, data FROM solicitation_files WHERE id = ?1 AND solicitation_id = ?2`).bind(Number(fileId), Number(id)).first<{ name: string; mime_type: string; data: string }>();
    if (!row) return Response.json({ error: 'Anexo não encontrado.' }, { status: 404 });
    const base64 = row.data.slice(row.data.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Response(bytes, { headers: { 'Content-Type': row.mime_type, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'private, max-age=3600' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível abrir o anexo.' }, { status: 500 });
  }
}
