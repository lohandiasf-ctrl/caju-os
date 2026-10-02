import { env } from 'cloudflare:workers';
import { isAllowedUploadMime, isSafeDataUrl } from '@/lib/safe-data-url';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Anexos da solicitação (foto, print, PDF): ficam no banco como data URL, como as
// evidências dos chamados. O tipo é conferido pela assinatura do arquivo.
const ROLES = ['gerencia', 'coordenador', 'analista'] as const;
const MAX_DATA_URL = 1_800_000; // ~1,3 MB de arquivo
const MAX_FILES = 10;
const IMAGES_AND_PDF = (mime: string) => mime.startsWith('image/') || mime === 'application/pdf';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request, [...ROLES]);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) return Response.json({ error: 'Solicitação inválida.' }, { status: 400 });
    const body = await request.json().catch(() => null) as { name?: unknown; mimeType?: unknown; data?: unknown } | null;
    const name = typeof body?.name === 'string' ? body.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 120) : '';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
    const data = typeof body?.data === 'string' ? body.data : '';
    if (!name || !data) return Response.json({ error: 'Arquivo inválido.' }, { status: 400 });
    if (!IMAGES_AND_PDF(mimeType) || !isAllowedUploadMime(mimeType) || !isSafeDataUrl(data, mimeType, MAX_DATA_URL)) {
      return Response.json({ error: 'Envie uma foto ou um PDF de até 1,3 MB.' }, { status: 400 });
    }
    const solicitation = await env.DB.prepare(`SELECT returned_at, cancelled_at FROM solicitations WHERE id = ?1`).bind(id).first<{ returned_at: string | null; cancelled_at: string | null }>();
    if (!solicitation) return Response.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
    if (solicitation.returned_at || solicitation.cancelled_at) return Response.json({ error: 'Esta solicitação já foi encerrada.' }, { status: 409 });
    const count = Number((await env.DB.prepare(`SELECT count(*) AS n FROM solicitation_files WHERE solicitation_id = ?1`).bind(id).first<{ n: number }>())?.n ?? 0);
    if (count >= MAX_FILES) return Response.json({ error: `No máximo ${MAX_FILES} anexos por solicitação.` }, { status: 400 });
    const now = new Date().toISOString();
    const size = Math.floor((data.length - data.indexOf(',') - 1) * 3 / 4);
    const row = await env.DB.prepare(`INSERT INTO solicitation_files (solicitation_id, name, mime_type, size, data, uploaded_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`)
      .bind(id, name, mimeType, size, data, user.email, now).first<{ id: number }>();
    await env.DB.prepare(`INSERT INTO solicitation_events (solicitation_id, kind, actor_email, details, created_at) VALUES (?1, 'file', ?2, ?3, ?4)`).bind(id, user.email, JSON.stringify({ name }), now).run();
    return Response.json({ id: row?.id, name, mimeType, size }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao anexar à solicitação', error);
    return Response.json({ error: 'Não foi possível anexar o arquivo.' }, { status: 500 });
  }
}
