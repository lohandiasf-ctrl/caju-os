import { env } from 'cloudflare:workers';
import { requireWhatsappUser } from '@/lib/server/whatsapp-bridge';
import { changeParticipants } from '@/lib/whatsapp-bridge-payload';

// Join or leave a conversation's attendance (up to two agents). Nobody is
// locked out of replying; this only shows who is handling it.
export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireWhatsappUser(request);
    const { phone } = await context.params;
    const contactPhone = decodeURIComponent(phone);
    const body = await request.json().catch(() => null) as { action?: unknown } | null;
    const action = body?.action === 'leave' ? 'leave' : body?.action === 'join' ? 'join' : null;
    if (!action) return Response.json({ error: 'Ação inválida.' }, { status: 400 });

    const row = await env.DB.prepare('SELECT assigned_to FROM whatsapp_conversations WHERE contact_phone = ?').bind(contactPhone).first<{ assigned_to: string | null }>();
    if (!row) return Response.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    const result = changeParticipants(row.assigned_to, current.email, action);
    if ('error' in result) return Response.json({ error: result.error }, { status: 409 });

    const next = result.participants.join(',') || null;
    // Only write if nobody changed the list in between (two agents joining at
    // the same moment must not both become "second").
    const update = await env.DB.prepare('UPDATE whatsapp_conversations SET assigned_to = ?, updated_at = ? WHERE contact_phone = ? AND assigned_to IS ?')
      .bind(next, new Date().toISOString(), contactPhone, row.assigned_to).run();
    if (!update.meta.changes && next !== row.assigned_to) return Response.json({ error: 'Outra pessoa entrou ou saiu agora. Tente de novo.' }, { status: 409 });
    return Response.json({ participants: result.participants });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao atualizar participantes da conversa do WhatsApp', error);
    return Response.json({ error: 'Não foi possível atualizar os participantes.' }, { status: 500 });
  }
}
