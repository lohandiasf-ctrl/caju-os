import { and, asc, desc, eq, gt, like, or } from 'drizzle-orm';
import { appUsers, employeeMessages } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    const current = await requireApiUser(request);
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get('latestIncoming') === '1') {
      const latest = await getDb().select({ id: employeeMessages.id }).from(employeeMessages)
        .where(eq(employeeMessages.recipientEmail, current.email)).orderBy(desc(employeeMessages.id)).limit(1).get();
      return Response.json({ latestMessageId: latest?.id ?? 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const incomingAfterValue = searchParams.get('incomingAfter');
    if (incomingAfterValue !== null) {
      const incomingAfter = Number(incomingAfterValue);
      if (!Number.isSafeInteger(incomingAfter) || incomingAfter < 0) return Response.json({ error: 'Referência de mensagem inválida.' }, { status: 400 });
      const messages = await getDb().select().from(employeeMessages)
        .where(and(eq(employeeMessages.recipientEmail, current.email), gt(employeeMessages.id, incomingAfter)))
        .orderBy(asc(employeeMessages.id)).limit(20).all();
      if (messages.length) {
        const now = new Date().toISOString();
        await getDb().update(employeeMessages).set({ deliveredAt: now })
          .where(and(eq(employeeMessages.recipientEmail, current.email), gt(employeeMessages.id, incomingAfter))).run();
        messages.forEach((message) => { if (!message.deliveredAt) message.deliveredAt = now; });
      }
      return Response.json({ messages, latestMessageId: messages.at(-1)?.id ?? incomingAfter }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const query = searchParams.get('q')?.trim();
    if (query) {
      const messages = await getDb().select().from(employeeMessages).where(and(
        or(eq(employeeMessages.senderEmail, current.email), eq(employeeMessages.recipientEmail, current.email)),
        like(employeeMessages.body, `%${query.slice(0, 80).replaceAll('%', '\\%').replaceAll('_', '\\_')}%`),
      )).orderBy(desc(employeeMessages.createdAt)).limit(40).all();
      return Response.json({ messages }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const colleague = searchParams.get('with')?.trim().toLowerCase();
    if (!colleague) return Response.json({ error: 'Colega não informado.' }, { status: 400 });
    const messages = await getDb().select().from(employeeMessages).where(or(
      and(eq(employeeMessages.senderEmail, current.email), eq(employeeMessages.recipientEmail, colleague)),
      and(eq(employeeMessages.senderEmail, colleague), eq(employeeMessages.recipientEmail, current.email)),
    )).orderBy(asc(employeeMessages.createdAt)).limit(150).all();
    const now = new Date().toISOString();
    await getDb().update(employeeMessages).set({ deliveredAt: now, readAt: now }).where(and(
      eq(employeeMessages.senderEmail, colleague), eq(employeeMessages.recipientEmail, current.email),
    )).run();
    messages.forEach((message) => {
      if (message.recipientEmail === current.email && !message.readAt) { message.deliveredAt = message.deliveredAt || now; message.readAt = now; }
    });
    return Response.json({ messages }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('messages GET failed', error);
    return Response.json({ error: 'Não foi possível carregar a conversa.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const current = await requireApiUser(request);
    let payload: { to?: string; body?: string; attachment?: { name?: string; type?: string; data?: string } };
    try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: 'Dados da mensagem inválidos.' }, { status: 400 }); }
    const to = payload.to?.trim().toLowerCase();
    const body = payload.body?.trim();
    const attachment = payload.attachment?.data ? { name: payload.attachment.name?.trim() || 'Anexo', type: payload.attachment.type?.trim() || 'application/octet-stream', data: payload.attachment.data } : null;
    if (!to || (!body && !attachment)) return Response.json({ error: 'Escreva uma mensagem ou anexe um arquivo.' }, { status: 400 });
    const messageBody = body || '';
    if (to === current.email.toLowerCase()) return Response.json({ error: 'Escolha outro colega.' }, { status: 400 });
    if (messageBody.length > 2000) return Response.json({ error: 'A mensagem deve ter até 2.000 caracteres.' }, { status: 400 });
    if (attachment && !attachment.type.startsWith('image/') && !attachment.type.startsWith('audio/') && attachment.type !== 'application/pdf') return Response.json({ error: 'Só é permitido enviar imagens, áudios ou PDFs.' }, { status: 400 });
    if (attachment && !attachment.data.startsWith('data:')) return Response.json({ error: 'Formato de anexo inválido.' }, { status: 400 });
    if (attachment && attachment.data.length > 1_000_000) return Response.json({ error: 'O anexo deve ter até 750 KB para manter o chat rápido.' }, { status: 400 });
    const recipient = await getDb().select({ active: appUsers.active }).from(appUsers).where(eq(appUsers.email, to)).get();
    if (!recipient?.active) return Response.json({ error: 'Colega não encontrado.' }, { status: 404 });
    const now = new Date().toISOString();
    const values = attachment
      ? { senderEmail: current.email, recipientEmail: to, body: messageBody, attachmentName: attachment.name, attachmentType: attachment.type, attachmentData: attachment.data, createdAt: now }
      : { senderEmail: current.email, recipientEmail: to, body: messageBody, createdAt: now };
    const inserted = await getDb().insert(employeeMessages).values(values).returning().get();
    return Response.json({ message: inserted }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('messages POST failed', error);
    return Response.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 });
  }
}
