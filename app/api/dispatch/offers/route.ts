import { env } from 'cloudflare:workers';
import { HOLD_LABEL, offerMessage, previewText, type HoldReason } from '@/lib/dispatch';
import { dispatchMode, offerVersionInUse } from '@/lib/server/dispatch';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Painel da distribuição: as ofertas mais recentes, com a mensagem exatamente
// como o técnico leria. Em dry_run é aqui que se confere tudo antes de ligar
// o envio de verdade.

type OfferRow = { id: number; store_key: string; store_name: string | null; city: string | null; status: string; hold_reasons: string | null; mode: string; assigned_technician_id: number | null; assigned_at: string | null; expires_at: string; created_at: string };
type TicketRow = { offer_id: number; ticket_key: string; equipment: string | null; alleged_defect: string | null };

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador']);
    const db = env.DB;
    const offers = (await db.prepare(`SELECT * FROM dispatch_offers ORDER BY id DESC LIMIT 50`).all<OfferRow>()).results;
    if (!offers.length) return Response.json({ mode: dispatchMode(), offers: [] });
    const ids = offers.map((o) => o.id);
    const marks = ids.map(() => '?').join(',');
    const tickets = (await db.prepare(`SELECT offer_id, ticket_key, equipment, alleged_defect FROM dispatch_offer_tickets WHERE offer_id IN (${marks})`).bind(...ids).all<TicketRow>()).results;
    const recipients = (await db.prepare(`SELECT r.offer_id, r.status, t.name,
      (SELECT e.details FROM dispatch_events e WHERE e.offer_id = r.offer_id AND e.technician_id = r.technician_id AND e.kind IN ('send_failed', 'delivery_failed') ORDER BY e.id DESC LIMIT 1) AS failure
      FROM dispatch_recipients r JOIN technicians t ON t.id = r.technician_id WHERE r.offer_id IN (${marks})`).bind(...ids).all<{ offer_id: number; status: string; name: string; failure: string | null }>()).results;
    const version = await offerVersionInUse();
    const winners = new Map((await db.prepare(`SELECT id, name FROM technicians WHERE id IN (SELECT assigned_technician_id FROM dispatch_offers WHERE id IN (${marks}))`).bind(...ids).all<{ id: number; name: string }>()).results.map((t) => [t.id, t.name]));

    return Response.json({
      mode: dispatchMode(),
      offers: offers.map((o) => {
        const own = tickets.filter((t) => t.offer_id === o.id).sort((a, b) => a.ticket_key.localeCompare(b.ticket_key));
        const dispatchTickets = own.map((t) => ({ key: t.ticket_key, storeCode: o.store_key, storeName: o.store_name, city: o.city, equipment: t.equipment, pdv: null, allegedDefect: t.alleged_defect }));
        const reasons = (o.hold_reasons ? JSON.parse(o.hold_reasons) : []) as HoldReason[];
        return {
          id: o.id, status: o.status, mode: o.mode, storeKey: o.store_key, storeName: o.store_name, city: o.city,
          createdAt: o.created_at, expiresAt: o.expires_at, assignedAt: o.assigned_at,
          assignedTo: o.assigned_technician_id ? winners.get(o.assigned_technician_id) ?? null : null,
          holdReasons: reasons.map((r) => HOLD_LABEL[r] ?? r),
          tickets: own.map((t) => t.ticket_key),
          recipients: recipients.filter((r) => r.offer_id === o.id).map((r) => ({ name: r.name, status: r.status, reason: r.status === 'failed' && r.failure ? (JSON.parse(r.failure) as { error?: string }).error ?? null : null })),
          preview: own.length ? previewText(offerMessage(o.id, dispatchTickets, version)) : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar as ofertas.' }, { status: 500 });
  }
}
