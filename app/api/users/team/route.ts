import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers, employeePresence } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { logSecurityEvent } from '@/lib/server/security-log';

// Gestão da equipe pela gerência: listar quem tem acesso e retirar/readmitir.
// "Retirar" é desativar a linha em app_users (active = false): a pessoa perde o
// acesso na próxima chamada à API (requireApiUser responde 403) e some da lista
// de colegas, mas nada é apagado — mensagens, histórico e perfil ficam, e a
// gerência pode readmitir depois.

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const rows = await getDb().select({
      email: appUsers.email,
      role: appUsers.role,
      active: appUsers.active,
      updatedAt: appUsers.updatedAt,
      displayName: employeePresence.displayName,
    }).from(appUsers).leftJoin(employeePresence, eq(appUsers.email, employeePresence.email)).all();
    return Response.json({ members: rows }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar a equipe.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const manager = await requireApiUser(request, ['gerencia']);
    const body = (await request.json()) as { email?: unknown; active?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || typeof body.active !== 'boolean') {
      return Response.json({ error: 'Informe o e-mail e se a pessoa fica ou sai da equipe.' }, { status: 400 });
    }
    if (email === manager.email.toLowerCase() && !body.active) {
      return Response.json({ error: 'Você não pode retirar a sua própria conta da equipe.' }, { status: 400 });
    }
    const db = getDb();
    const target = await db.select({ email: appUsers.email, role: appUsers.role, active: appUsers.active })
      .from(appUsers).where(eq(appUsers.email, email)).get();
    if (!target) return Response.json({ error: 'Pessoa não encontrada na equipe.' }, { status: 404 });

    // Nunca deixar a operação sem nenhuma gerência ativa.
    if (!body.active && target.role === 'gerencia') {
      const others = await db.select({ email: appUsers.email }).from(appUsers)
        .where(and(eq(appUsers.role, 'gerencia'), eq(appUsers.active, true), ne(appUsers.email, email))).all();
      if (!others.length) return Response.json({ error: 'É preciso manter pelo menos uma conta de gerência ativa.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await db.update(appUsers).set({ active: body.active, updatedAt: now }).where(eq(appUsers.email, email));
    logSecurityEvent({
      request,
      user: manager,
      action: body.active ? 'user_readmitted' : 'user_removed_from_team',
      outcome: 'allowed',
      details: { email, role: target.role },
    });
    return Response.json({ email, active: body.active });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível atualizar a equipe.' }, { status: 500 });
  }
}
