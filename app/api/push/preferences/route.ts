import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pushPreferences } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { ALERT_KIND_LIST, ALERT_KINDS, OPS_ROLES, parsePrefs, prefsWithDefaults } from '@/lib/push-alerts';

// Quais avisos push a pessoa quer receber no celular. Os avisos da fila
// (SLA, agendamento...) só aparecem para os perfis que têm acesso ao Jira.

function kindsFor(role: string) {
  const ops = (OPS_ROLES as readonly string[]).includes(role);
  return ALERT_KIND_LIST.filter((k) => ops || !ALERT_KINDS[k].ops)
    .map((k) => ({ kind: k, label: ALERT_KINDS[k].label, hint: ALERT_KINDS[k].hint, ops: ALERT_KINDS[k].ops }));
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const row = await getDb().select().from(pushPreferences).where(eq(pushPreferences.email, user.email.toLowerCase())).get();
    return Response.json({ kinds: kindsFor(user.role), prefs: parsePrefs(row?.kinds) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('push preferences GET', error);
    return Response.json({ error: 'Não foi possível carregar os avisos.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json().catch(() => ({})) as { prefs?: unknown };
    const prefs = prefsWithDefaults(body.prefs);
    const now = new Date().toISOString();
    const email = user.email.toLowerCase();
    await getDb().insert(pushPreferences).values({ email, kinds: JSON.stringify(prefs), updatedAt: now })
      .onConflictDoUpdate({ target: pushPreferences.email, set: { kinds: JSON.stringify(prefs), updatedAt: now } }).run();
    return Response.json({ kinds: kindsFor(user.role), prefs });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('push preferences PUT', error);
    return Response.json({ error: 'Não foi possível salvar os avisos.' }, { status: 500 });
  }
}
