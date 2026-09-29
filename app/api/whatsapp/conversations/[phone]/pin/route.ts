import { env } from 'cloudflare:workers';
import { requireWhatsappUser } from '@/lib/server/whatsapp-bridge';
import { toWhatsappAccount } from '@/lib/whatsapp-accounts';

// Fixar ou desafixar uma conversa no topo da caixa do WhatsApp. Pessoal: vale só
// para quem fixou (por e-mail), no computador e no celular.

export async function PUT(request: Request, context: { params: Promise<{ phone: string }> }) {
  try {
    const current = await requireWhatsappUser(request);
    const account = toWhatsappAccount(new URL(request.url).searchParams.get('account'));
    const contactPhone = decodeURIComponent((await context.params).phone);
    const body = await request.json().catch(() => null) as { pinned?: unknown } | null;
    if (typeof body?.pinned !== 'boolean') return Response.json({ error: 'Informe pinned: true ou false.' }, { status: 400 });
    const email = current.email.toLowerCase();
    if (body.pinned) {
      await env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_conversation_pins (email, account, contact_phone, pinned_at) VALUES (?1, ?2, ?3, ?4)`)
        .bind(email, account, contactPhone, new Date().toISOString()).run();
    } else {
      await env.DB.prepare(`DELETE FROM whatsapp_conversation_pins WHERE email = ?1 AND account = ?2 AND contact_phone = ?3`).bind(email, account, contactPhone).run();
    }
    return Response.json({ pinned: body.pinned });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao fixar a conversa do WhatsApp', error);
    return Response.json({ error: 'Não foi possível fixar a conversa.' }, { status: 500 });
  }
}
