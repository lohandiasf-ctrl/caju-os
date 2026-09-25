import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pushDevices } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { isExpoPushToken } from '@/lib/push-message';

// O app do celular registra aqui o aparelho que recebe push (depois do login e
// quando o usuário liga "Avisos no celular") e remove ao sair ou desligar.

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json().catch(() => ({})) as { token?: unknown; platform?: unknown; deviceName?: unknown };
    if (!isExpoPushToken(body.token)) return Response.json({ error: 'Token de notificação inválido.' }, { status: 400 });
    const token = body.token.trim();
    const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : 'unknown';
    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 80) || null : null;
    const now = new Date().toISOString();
    // O mesmo aparelho pode trocar de conta: o token passa a ser do e-mail atual.
    await getDb().insert(pushDevices)
      .values({ userEmail: user.email.toLowerCase(), token, platform, deviceName, createdAt: now, lastSeenAt: now })
      .onConflictDoUpdate({ target: pushDevices.token, set: { userEmail: user.email.toLowerCase(), platform, deviceName, lastSeenAt: now, disabledAt: null } })
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('push devices POST', error);
    return Response.json({ error: 'Não foi possível ativar as notificações.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json().catch(() => ({})) as { token?: unknown };
    if (!isExpoPushToken(body.token)) return Response.json({ error: 'Token de notificação inválido.' }, { status: 400 });
    // Só apaga o aparelho da própria conta.
    await getDb().delete(pushDevices)
      .where(and(eq(pushDevices.token, body.token.trim()), eq(pushDevices.userEmail, user.email.toLowerCase()))).run();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('push devices DELETE', error);
    return Response.json({ error: 'Não foi possível desativar as notificações.' }, { status: 500 });
  }
}
