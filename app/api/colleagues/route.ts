import { eq } from 'drizzle-orm';
import { appUsers, employeePresence } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

const allowedStatuses = new Set(['Online', 'Ocupado', 'Ausente', 'Não perturbe', 'Almoçando', 'Pausa de 15 minutos', 'Offline']);

export async function GET(request: Request) {
  try {
    const current = await requireApiUser(request);
    const rows = await getDb().select({
      email: appUsers.email,
      role: appUsers.role,
      displayName: employeePresence.displayName,
      phone: employeePresence.phone,
      photoUrl: employeePresence.photoUrl,
      status: employeePresence.status,
      manualStatus: employeePresence.manualStatus,
      lastSeenAt: employeePresence.lastSeenAt,
      updatedAt: employeePresence.updatedAt,
    }).from(appUsers).leftJoin(employeePresence, eq(appUsers.email, employeePresence.email)).where(eq(appUsers.active, true)).all();

    const staleBefore = Date.now() - 2 * 60 * 1000;
    return Response.json({
      currentEmail: current.email,
      colleagues: rows.map((row) => ({
        ...row,
        status: row.status === 'Offline' || !row.updatedAt || Date.parse(row.updatedAt) < staleBefore ? 'Offline' : (row.status ?? 'Offline'),
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os colegas.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const current = await requireApiUser(request);
    const body = await request.json() as { status?: string; manualStatus?: boolean; displayName?: string; phone?: string; photoUrl?: string | null };
    if (body.status && !allowedStatuses.has(body.status)) return Response.json({ error: 'Status inválido.' }, { status: 400 });
    const displayName = clean(body.displayName, 80);
    const phone = clean(body.phone, 30);
    const photoUrl = typeof body.photoUrl === 'string' && body.photoUrl.startsWith('data:image/') && body.photoUrl.length <= 950_000 ? body.photoUrl : null;
    const now = new Date().toISOString();

    await getDb().insert(employeePresence).values({
      email: current.email,
      displayName,
      phone,
      photoUrl,
      status: allowedStatuses.has(body.status ?? '') ? body.status as typeof employeePresence.$inferInsert.status : 'Online',
      manualStatus: Boolean(body.manualStatus),
      lastSeenAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: employeePresence.email,
      set: {
        ...(body.displayName !== undefined ? { displayName } : {}),
        ...(body.phone !== undefined ? { phone } : {}),
        ...(body.photoUrl !== undefined ? { photoUrl } : {}),
        ...(body.status ? { status: body.status as typeof employeePresence.$inferInsert.status } : {}),
        ...(body.manualStatus !== undefined ? { manualStatus: Boolean(body.manualStatus) } : {}),
        lastSeenAt: now,
        updatedAt: now,
      },
    });
    return Response.json({ ok: true, updatedAt: now });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível atualizar o perfil.' }, { status: 500 });
  }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) || null : null;
}
