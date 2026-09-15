import { logSecurityEvent } from '@/lib/server/security-log';
import { bridgeFetch, requireWhatsappUser } from '@/lib/server/whatsapp-bridge';
import { participantJid, WHATSAPP_GROUP_NAME_MAX } from '@/lib/whatsapp-group-name';

const MAX_PARTICIPANTS = 20;
const MAX_TICKETS = 40;

// Creates a WhatsApp group for one or more tickets from the operation's
// number. The bridge pushes the new group back through the webhook, so it
// shows in the inbox with the FSAs from its name already linked.
export async function POST(request: Request) {
  try {
    const user = await requireWhatsappUser(request);
    const body = await request.json().catch(() => null) as { subject?: unknown; participants?: unknown; ticketKeys?: unknown } | null;
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    if (!subject) return Response.json({ error: 'Informe o nome do grupo.' }, { status: 400 });
    if (subject.length > WHATSAPP_GROUP_NAME_MAX) return Response.json({ error: `O nome do grupo pode ter até ${WHATSAPP_GROUP_NAME_MAX} caracteres.` }, { status: 400 });

    const raw = Array.isArray(body?.participants) ? body.participants.filter((item): item is string => typeof item === 'string') : [];
    const participants = [...new Set(raw.map(participantJid))];
    if (!raw.length || participants.includes(null)) return Response.json({ error: 'Revise os participantes: use números com DDD.' }, { status: 400 });
    if (participants.length > MAX_PARTICIPANTS) return Response.json({ error: `Adicione no máximo ${MAX_PARTICIPANTS} participantes.` }, { status: 400 });
    const ticketKeys = Array.isArray(body?.ticketKeys) ? body.ticketKeys.filter((key): key is string => typeof key === 'string').slice(0, MAX_TICKETS) : [];

    const upstream = await bridgeFetch('/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, participants }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await upstream.json().catch(() => ({})) as { jid?: string; subject?: string; missing?: string[]; unknown?: string[]; error?: string };
    logSecurityEvent({ request, user, action: 'whatsapp_group_create', outcome: upstream.ok ? 'allowed' : 'denied', details: { subject, participants: participants.length, ticketKeys, status: upstream.status } });
    if (!upstream.ok || !payload.jid) {
      return Response.json({ error: payload.error ?? 'O WhatsApp não criou o grupo.', unknown: payload.unknown ?? [] }, { status: upstream.status === 400 ? 400 : 502 });
    }
    return Response.json({ jid: payload.jid, subject: payload.subject ?? subject, missing: payload.missing ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao criar grupo do WhatsApp', error);
    return Response.json({ error: 'Não foi possível criar o grupo no WhatsApp.' }, { status: 502 });
  }
}
