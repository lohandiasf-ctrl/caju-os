import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Chamados que um técnico aceitou pelo WhatsApp (oferta aceita e ainda valendo
// para o chamado): a lista de chamados destaca os que ainda estão pendentes de
// agendamento, para a equipe agendar. Oferta de teste fica de fora.

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'analista', 'n1']);
    const rows = (await env.DB.prepare(`SELECT t.ticket_key, tech.name, o.assigned_at
      FROM dispatch_offer_tickets t JOIN dispatch_offers o ON o.id = t.offer_id
      LEFT JOIN technicians tech ON tech.id = o.assigned_technician_id
      WHERE t.active = 1 AND o.status = 'assigned' AND o.mode <> 'test'`).all<{ ticket_key: string; name: string | null; assigned_at: string | null }>()).results;
    const accepted = Object.fromEntries(rows.map((r) => [r.ticket_key, { technician: r.name ?? 'Técnico', at: r.assigned_at }]));
    return Response.json({ accepted });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível consultar os aceites.' }, { status: 500 });
  }
}
