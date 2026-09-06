import { eq } from 'drizzle-orm';
import { communicationPreferences } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

const defaults = { desktopMessages: true, desktopCalls: true, soundMessages: true, soundCalls: true, quietHoursEnabled: false, quietHoursStart: '20:00', quietHoursEnd: '07:00' };

export async function GET(request: Request) {
  try {
    const current = await requireApiUser(request);
    const row = await getDb().select().from(communicationPreferences).where(eq(communicationPreferences.email, current.email)).get();
    return Response.json({ preferences: row ?? { email: current.email, ...defaults } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível carregar as preferências.' }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const current = await requireApiUser(request);
    const body = await request.json() as Partial<typeof defaults>;
    const time = (value: unknown, fallback: string) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
    const values = {
      email: current.email,
      desktopMessages: body.desktopMessages ?? defaults.desktopMessages,
      desktopCalls: body.desktopCalls ?? defaults.desktopCalls,
      soundMessages: body.soundMessages ?? defaults.soundMessages,
      soundCalls: body.soundCalls ?? defaults.soundCalls,
      quietHoursEnabled: body.quietHoursEnabled ?? defaults.quietHoursEnabled,
      quietHoursStart: time(body.quietHoursStart, defaults.quietHoursStart),
      quietHoursEnd: time(body.quietHoursEnd, defaults.quietHoursEnd),
      updatedAt: new Date().toISOString(),
    };
    await getDb().insert(communicationPreferences).values(values).onConflictDoUpdate({ target: communicationPreferences.email, set: values });
    return Response.json({ preferences: values });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível salvar as preferências.' }, { status: 500 }); }
}
