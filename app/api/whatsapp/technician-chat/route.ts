import { env } from 'cloudflare:workers';
import { DEFAULT_ACCOUNT } from '@/lib/whatsapp-accounts';
import { samePhone, whatsappPhone } from '@/lib/dispatch';
import { requireWhatsappUser } from '@/lib/server/whatsapp-bridge';

// Abre (ou cria) a conversa do WhatsApp interno com um técnico, pelo telefone do
// cadastro dele: não precisa estar salvo nos contatos do celular da operação.
// O técnico vem por id, por nome ou pelo chamado (quem está nele: vínculo do
// Caju OS, oferta aceita ou nome no bloco de dados do técnico no Jira).
type Tech = { id: number; name: string; phone: string | null };

export async function POST(request: Request) {
  try {
    await requireWhatsappUser(request);
    const body = await request.json().catch(() => null) as { technicianId?: unknown; name?: unknown; ticketKey?: unknown } | null;
    const db = env.DB;
    let tech: Tech | null = null;

    if (Number.isInteger(body?.technicianId)) {
      tech = await db.prepare('SELECT id, name, phone FROM technicians WHERE id = ?1').bind(body!.technicianId).first<Tech>();
    }
    if (!tech && typeof body?.ticketKey === 'string' && body.ticketKey.trim()) {
      const key = body.ticketKey.trim().toUpperCase();
      tech = await db.prepare(`SELECT t.id, t.name, t.phone FROM operational_workflows w JOIN technicians t ON t.id = w.technician_id WHERE w.ticket_key = ?1`).bind(key).first<Tech>();
      if (!tech) {
        tech = await db.prepare(`SELECT t.id, t.name, t.phone FROM dispatch_offer_tickets ot JOIN dispatch_offers o ON o.id = ot.offer_id JOIN technicians t ON t.id = o.assigned_technician_id
          WHERE ot.ticket_key = ?1 AND o.assigned_technician_id IS NOT NULL ORDER BY o.assigned_at DESC LIMIT 1`).bind(key).first<Tech>();
      }
    }
    if (!tech && typeof body?.name === 'string' && body.name.trim()) {
      const name = body.name.trim().toLocaleLowerCase('pt-BR');
      const found = (await db.prepare('SELECT id, name, phone FROM technicians').all<Tech>()).results.filter((t) => t.name.trim().toLocaleLowerCase('pt-BR') === name);
      if (found.length === 1) tech = found[0];
      else if (found.length > 1) return Response.json({ error: 'Há mais de um técnico com esse nome. Abra pelo cadastro.' }, { status: 409 });
    }
    if (!tech) return Response.json({ error: 'Não encontrei o técnico deste chamado no cadastro.' }, { status: 404 });

    const phone = whatsappPhone(tech.phone);
    if (!phone) return Response.json({ error: `${tech.name} está sem telefone no cadastro. Cadastre o número para conversar.` }, { status: 422 });

    // Conversa que já existe com esse número (com ou sem o nono dígito): reaproveita.
    const existing = (await db.prepare(`SELECT contact_phone FROM whatsapp_conversations WHERE account = ?1 AND contact_phone NOT LIKE '%@%' AND substr(contact_phone, -8) = ?2`)
      .bind(DEFAULT_ACCOUNT, phone.slice(-8)).all<{ contact_phone: string }>()).results.find((r) => samePhone(r.contact_phone, phone));
    const contactPhone = existing?.contact_phone ?? phone;
    if (!existing) {
      const now = new Date().toISOString();
      await db.prepare(`INSERT INTO whatsapp_conversations (account, contact_phone, contact_name, last_message_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4, ?4)
        ON CONFLICT(account, contact_phone) DO NOTHING`).bind(DEFAULT_ACCOUNT, contactPhone, tech.name, now).run();
    }
    return Response.json({ contactPhone, name: tech.name, account: DEFAULT_ACCOUNT });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao abrir conversa com o técnico', error);
    return Response.json({ error: 'Não foi possível abrir a conversa com o técnico.' }, { status: 500 });
  }
}
