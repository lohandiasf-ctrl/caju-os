import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { SELECT_SOLICITATION, toSolicitation, type SolicitationRow } from '@/lib/server/solicitations-db';
import { parseNewSolicitation, statusOf } from '@/lib/solicitations';

// Solicitações da gerência para clientes fora do Jira. Quem tem acesso ao
// WhatsApp (gerência, coordenação, analistas) pede e opera; sem prazo.
const ROLES = ['gerencia', 'coordenador', 'analista'] as const;

export async function GET(request: Request) {
  try {
    await requireApiUser(request, [...ROLES]);
    const rows = (await env.DB.prepare(`${SELECT_SOLICITATION} ORDER BY (s.returned_at IS NOT NULL OR s.cancelled_at IS NOT NULL), s.priority = 'alta' DESC, s.created_at DESC LIMIT 300`).all<SolicitationRow>()).results;
    return Response.json({ solicitations: rows.map((row) => { const s = toSolicitation(row); return { ...s, status: statusOf(s) }; }) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar as solicitações.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, [...ROLES]);
    const parsed = parseNewSolicitation(await request.json().catch(() => null) as Record<string, unknown> | null);
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    const v = parsed.value;
    const now = new Date().toISOString();
    const created = await env.DB.prepare(`INSERT INTO solicitations (requester_email, requester_phone, client, city, uf, store, address, description, priority, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10) RETURNING id`)
      .bind(user.email, v.requesterPhone, v.client, v.city, v.uf, v.store, v.address, v.description, v.priority, now).first<{ id: number }>();
    if (!created) return Response.json({ error: 'Não foi possível criar a solicitação.' }, { status: 500 });
    await env.DB.prepare(`INSERT INTO solicitation_events (solicitation_id, kind, actor_email, created_at) VALUES (?1, 'created', ?2, ?3)`).bind(created.id, user.email, now).run();
    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao criar solicitação', error);
    return Response.json({ error: 'Não foi possível criar a solicitação.' }, { status: 500 });
  }
}
