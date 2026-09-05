import { and, asc, eq, or } from 'drizzle-orm';
import { appUsers, employeeMessages } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    const current = await requireApiUser(request);
    const colleague = new URL(request.url).searchParams.get('with')?.trim().toLowerCase();
    if (!colleague) return Response.json({ error: 'Colega não informado.' }, { status: 400 });
    const messages = await getDb().select().from(employeeMessages).where(or(
      and(eq(employeeMessages.senderEmail, current.email), eq(employeeMessages.recipientEmail, colleague)),
      and(eq(employeeMessages.senderEmail, colleague), eq(employeeMessages.recipientEmail, current.email)),
    )).orderBy(asc(employeeMessages.createdAt)).limit(150).all();
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
    if (attachment && !attachment.type.startsWith('image/') && attachment.type !== 'application/pdf') return Response.json({ error: 'Só é permitido enviar fotos ou PDFs.' }, { status: 400 });
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
