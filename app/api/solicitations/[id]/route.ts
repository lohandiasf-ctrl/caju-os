import { env } from 'cloudflare:workers';
import { DEFAULT_WHATSAPP_GROUP_PHOTO } from '@/lib/whatsapp-group-photos';
import { eligibleTechnicians, whatsappPhone, type DispatchTechnician } from '@/lib/dispatch';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { bridgeFetch } from '@/lib/server/whatsapp-bridge';
import { groupNameOf, missingSteps, returnMessage, statusOf } from '@/lib/solicitations';
import { parseFixedParticipants, participantJid, WHATSAPP_GROUP_NAME_MAX, withFixedParticipants } from '@/lib/whatsapp-group-name';
import { SELECT_SOLICITATION, toSolicitation, type SolicitationRow } from '@/lib/server/solicitations-db';

const ROLES = ['gerencia', 'coordenador', 'analista'] as const;

// Número que cria grupos (diferente do número da Caju, que não cria). Só funciona depois
// de configurar WHATSAPP_GROUP_BRIDGE_URL e WHATSAPP_GROUP_BRIDGE_SECRET.
const groupBridge = () => {
  const config = env as unknown as Record<string, string | undefined>;
  return { url: config.WHATSAPP_GROUP_BRIDGE_URL?.trim(), secret: config.WHATSAPP_GROUP_BRIDGE_SECRET?.trim() };
};
const groupCreationEnabled = () => { const { url, secret } = groupBridge(); return Boolean(url && secret); };
function groupBridgeFetch(path: string, init: RequestInit) {
  const { url, secret } = groupBridge();
  return fetch(`${url}${path}`, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'x-bridge-secret': secret ?? '' } });
}

async function load(id: number) {
  const row = await env.DB.prepare(`${SELECT_SOLICITATION} WHERE s.id = ?1`).bind(id).first<SolicitationRow>();
  return row ? toSolicitation(row) : null;
}

type TechRow = { id: number; name: string; phone: string | null; approved: number; base_city: string; base_state: string };
async function candidates(city: string, uf: string | null) {
  const rows = (await env.DB.prepare(`SELECT id, name, phone, approved, base_city, base_state FROM technicians`).all<TechRow>()).results;
  const techs: DispatchTechnician[] = rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, approved: Boolean(r.approved), baseCity: r.base_city, baseState: r.base_state, extraCities: null }));
  // Mesma regra da distribuição: só técnico da mesma cidade (cidade base), aprovado e com telefone.
  return eligibleTechnicians(techs, city, uf).map((t) => ({ id: t.id, name: t.name, phone: t.phone }));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(request, [...ROLES]);
    const id = Number((await context.params).id);
    const s = Number.isInteger(id) ? await load(id) : null;
    if (!s) return Response.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
    const events = (await env.DB.prepare(`SELECT kind, actor_email AS actor, details, created_at AS at FROM solicitation_events WHERE solicitation_id = ?1 ORDER BY id DESC LIMIT 60`).bind(id).all()).results;
    return Response.json({ solicitation: { ...s, status: statusOf(s) }, events, candidates: s.returnedAt || s.cancelledAt ? [] : await candidates(s.city, s.uf), groupCreation: groupCreationEnabled() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar a solicitação.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request, [...ROLES]);
    const id = Number((await context.params).id);
    const s = Number.isInteger(id) ? await load(id) : null;
    if (!s) return Response.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
    if (s.returnedAt || s.cancelledAt) return Response.json({ error: 'Esta solicitação já foi encerrada.' }, { status: 409 });
    const body = await request.json().catch(() => null) as { action?: string; technicianId?: unknown; scheduledAt?: unknown } | null;
    const now = new Date().toISOString();
    const log = (kind: string, details?: unknown) => env.DB.prepare(`INSERT INTO solicitation_events (solicitation_id, kind, actor_email, details, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(id, kind, user.email, details === undefined ? null : JSON.stringify(details), now);
    const touch = (set: string, ...binds: unknown[]) => env.DB.prepare(`UPDATE solicitations SET ${set}, updated_at = ?${binds.length + 1} WHERE id = ?${binds.length + 2}`).bind(...binds, now, id);

    switch (body?.action) {
      case 'assume':
        await env.DB.batch([touch('assignee_email = ?1', user.email), log('assumed')]);
        break;
      case 'set_technician': {
        const technicianId = Number(body.technicianId);
        const pick = (await candidates(s.city, s.uf)).find((t) => t.id === technicianId);
        if (!pick) return Response.json({ error: 'Escolha um técnico da mesma cidade da solicitação.' }, { status: 400 });
        await env.DB.batch([touch('technician_id = ?1, assignee_email = COALESCE(assignee_email, ?2)', pick.id, user.email), log('technician', { technicianId: pick.id, name: pick.name })]);
        break;
      }
      case 'schedule': {
        const at = typeof body.scheduledAt === 'string' ? body.scheduledAt.trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) return Response.json({ error: 'Informe o dia e a hora.' }, { status: 400 });
        await env.DB.batch([touch('scheduled_at = ?1, assignee_email = COALESCE(assignee_email, ?2)', at, user.email), log('scheduled', { at })]);
        break;
      }
      case 'set_group': {
        // Grupo criado por fora (o número da Caju não cria grupo): registra o nome ou o link.
        const raw = (body as { groupName?: unknown } | null)?.groupName;
        const name = typeof raw === 'string' ? raw.trim().slice(0, 300) : '';
        if (name.length < 3) return Response.json({ error: 'Informe o nome ou o link do grupo.' }, { status: 400 });
        await env.DB.batch([touch('group_name = ?1, assignee_email = COALESCE(assignee_email, ?2)', name, user.email), log('group', { manual: true, name })]);
        break;
      }
      case 'create_group': {
        if (!groupCreationEnabled()) return Response.json({ error: 'A criação automática de grupo ainda não está configurada. Crie o grupo por fora e registre o nome ou o link.' }, { status: 409 });
        if (s.groupJid) return Response.json({ error: 'O grupo já foi criado.' }, { status: 409 });
        const technician = s.technicianId ? (await candidates(s.city, s.uf)).find((t) => t.id === s.technicianId) : null;
        const phone = whatsappPhone(technician?.phone);
        if (!technician || !phone) return Response.json({ error: 'Escolha o técnico (com telefone cadastrado) antes de criar o grupo.' }, { status: 400 });
        const jid = participantJid(phone);
        if (!jid) return Response.json({ error: 'O telefone do técnico é inválido.' }, { status: 400 });
        const subject = groupNameOf(s, WHATSAPP_GROUP_NAME_MAX);
        const participants = withFixedParticipants([jid], parseFixedParticipants(env.WHATSAPP_GROUP_DEFAULT_PARTICIPANTS));
        const upstream = await groupBridgeFetch('/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, participants, photo: DEFAULT_WHATSAPP_GROUP_PHOTO }), signal: AbortSignal.timeout(30_000) });
        const payload = await upstream.json().catch(() => ({})) as { jid?: string; subject?: string; error?: string };
        if (!upstream.ok || !payload.jid) return Response.json({ error: payload.error ?? 'O WhatsApp não criou o grupo.' }, { status: 502 });
        await env.DB.batch([touch('group_jid = ?1, group_name = ?2, assignee_email = COALESCE(assignee_email, ?3)', payload.jid, payload.subject ?? subject, user.email), log('group', { jid: payload.jid, subject })]);
        break;
      }
      case 'return': {
        const missing = missingSteps(s);
        if (missing.length) return Response.json({ error: `Falta: ${missing.join(', ')}.` }, { status: 400 });
        const text = returnMessage(s);
        const upstream = await bridgeFetch('/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: s.requesterPhone, text }), signal: AbortSignal.timeout(20_000) });
        const payload = await upstream.json().catch(() => null) as { wamid?: string; error?: string } | null;
        if (!upstream.ok || !payload?.wamid) return Response.json({ error: payload?.error ?? 'O WhatsApp não enviou a devolução. Confira se o número está certo e se o WhatsApp da Caju está conectado.' }, { status: 502 });
        await env.DB.batch([touch('returned_at = ?1', now), log('returned', { to: s.requesterPhone })]);
        break;
      }
      case 'cancel':
        await env.DB.batch([touch('cancelled_at = ?1', now), log('cancelled')]);
        break;
      default:
        return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    }
    const fresh = (await load(id))!;
    return Response.json({ solicitation: { ...fresh, status: statusOf(fresh) } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha na solicitação', error);
    return Response.json({ error: 'Não foi possível atualizar a solicitação.' }, { status: 500 });
  }
}
