import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pushPreferences } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { ALERT_KIND_LIST, ALERT_KINDS, OPS_ROLES, parsePrefs, parseWindow, prefsWithDefaults, windowWithDefaults } from '@/lib/push-alerts';

// Quais avisos push a pessoa quer receber no celular, e em que dias e horário
// eles podem chegar. Os avisos da fila (SLA, agendamento...) só aparecem para
// os perfis que têm acesso ao Jira.

function kindsFor(role: string) {
  const ops = (OPS_ROLES as readonly string[]).includes(role);
  return ALERT_KIND_LIST.filter((k) => ops || !ALERT_KINDS[k].ops)
    .map((k) => ({ kind: k, label: ALERT_KINDS[k].label, hint: ALERT_KINDS[k].hint, ops: ALERT_KINDS[k].ops }));
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const row = await getDb().select().from(pushPreferences).where(eq(pushPreferences.email, user.email.toLowerCase())).get();
    return Response.json(
      { kinds: kindsFor(user.role), prefs: parsePrefs(row?.kinds), window: parseWindow(row?.schedule) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('push preferences GET', error);
    return Response.json({ error: 'Não foi possível carregar os avisos.' }, { status: 500 });
  }
}

// Grava só o que veio: o app antigo manda só `prefs`, e a janela fica como estava.
export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await request.json().catch(() => ({})) as { prefs?: unknown; window?: unknown };
    const email = user.email.toLowerCase();
    const db = getDb();
    const row = await db.select().from(pushPreferences).where(eq(pushPreferences.email, email)).get();
    const prefs = body.prefs !== undefined ? prefsWithDefaults(body.prefs) : parsePrefs(row?.kinds);
    const window = body.window !== undefined ? windowWithDefaults(body.window) : parseWindow(row?.schedule);
    const now = new Date().toISOString();
    const values = { kinds: JSON.stringify(prefs), schedule: JSON.stringify(window), updatedAt: now };
    await db.insert(pushPreferences).values({ email, ...values })
      .onConflictDoUpdate({ target: pushPreferences.email, set: values }).run();
    return Response.json({ kinds: kindsFor(user.role), prefs, window });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('push preferences PUT', error);
    return Response.json({ error: 'Não foi possível salvar os avisos.' }, { status: 500 });
  }
}
