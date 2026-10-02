import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { technicianStats, type RecipientRow } from '@/lib/dispatch-stats';

// Histórico de respostas por técnico (ofertas reais; simulação e teste ficam de fora).
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'analista']);
    const rows = (await env.DB.prepare(`SELECT r.technician_id AS technicianId, t.name AS name, t.base_city AS city, r.status AS status, r.updated_at AS updatedAt,
        o.status AS offerStatus, o.assigned_technician_id AS assignedTechnicianId
      FROM dispatch_recipients r JOIN dispatch_offers o ON o.id = r.offer_id JOIN technicians t ON t.id = r.technician_id
      WHERE o.mode IN ('live', 'allowlist')`).all<RecipientRow>()).results;
    return Response.json({ technicians: technicianStats(rows) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar o histórico dos técnicos.' }, { status: 500 });
  }
}
