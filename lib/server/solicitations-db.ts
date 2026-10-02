import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers } from '@/db/schema';
import { sendPushToEmails } from '@/lib/server/push';
import type { Solicitation } from '@/lib/solicitations';

export type SolicitationRow = {
  id: number; requester_email: string; requester_phone: string; client: string; city: string; uf: string | null; store: string | null; address: string | null;
  description: string; priority: string; assignee_email: string | null; technician_id: number | null; technician_name: string | null; scheduled_at: string | null;
  group_jid: string | null; group_name: string | null; returned_at: string | null; cancelled_at: string | null; created_at: string; updated_at: string;
};

export const SELECT_SOLICITATION = `SELECT s.*, t.name AS technician_name FROM solicitations s LEFT JOIN technicians t ON t.id = s.technician_id`;

export function toSolicitation(r: SolicitationRow): Solicitation {
  return {
    id: r.id, requesterEmail: r.requester_email, requesterPhone: r.requester_phone, client: r.client, city: r.city, uf: r.uf, store: r.store, address: r.address,
    description: r.description, priority: r.priority === 'alta' ? 'alta' : 'normal', assigneeEmail: r.assignee_email, technicianId: r.technician_id, technicianName: r.technician_name,
    scheduledAt: r.scheduled_at, groupJid: r.group_jid, groupName: r.group_name, returnedAt: r.returned_at, cancelledAt: r.cancelled_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}


/** Avisa a equipe (gerência, coordenação e analistas, menos quem pediu) de uma solicitação nova. Nunca lança. */
export async function notifyNewSolicitation(id: number, s: { client: string; store: string | null; city: string; uf: string | null; description: string; priority: string }, requesterEmail: string) {
  try {
    const users = await getDb().select({ email: appUsers.email }).from(appUsers)
      .where(and(eq(appUsers.active, true), inArray(appUsers.role, ['gerencia', 'coordenador', 'analista']))).all();
    const emails = users.map((u) => u.email.toLowerCase()).filter((email) => email !== requesterEmail.toLowerCase());
    const place = [s.city, s.uf].filter(Boolean).join('/');
    const text = s.description.replace(/\s+/g, ' ').trim();
    await sendPushToEmails(emails, {
      title: `${s.priority === 'alta' ? 'Solicitação urgente' : 'Nova solicitação'} · ${s.client}${s.store ? ` ${s.store}` : ''}`,
      body: `${place} — ${text.length > 110 ? `${text.slice(0, 109)}…` : text}`,
      data: { kind: 'solicitation', url: '/solicitacoes', solicitationId: String(id) },
    }, 'dispatch');
  } catch (error) {
    console.error('solicitação: aviso à equipe falhou', error instanceof Error ? error.message : 'erro');
  }
}
