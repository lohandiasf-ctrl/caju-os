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
    return Response.json({ error: 'Não foi possível carregar a conversa.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const current = await requireApiUser(request);
    const payload = await request.json() as { to?: string; body?: string };
    const to = payload.to?.trim().toLowerCase();
    const body = payload.body?.trim();
    if (!to || !body) return Response.json({ error: 'Escreva uma mensagem.' }, { status: 400 });
    if (to === current.email.toLowerCase()) return Response.json({ error: 'Escolha outro colega.' }, { status: 400 });
    if (body.length > 2000) return Response.json({ error: 'A mensagem deve ter até 2.000 caracteres.' }, { status: 400 });
    const recipient = await getDb().select({ active: appUsers.active }).from(appUsers).where(eq(appUsers.email, to)).get();
    if (!recipient?.active) return Response.json({ error: 'Colega não encontrado.' }, { status: 404 });
    const now = new Date().toISOString();
    const inserted = await getDb().insert(employeeMessages).values({ senderEmail: current.email, recipientEmail: to, body, createdAt: now }).returning().get();
    return Response.json({ message: inserted }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível enviar a mensagem.' }, { status: 500 });
  }
}
