import { env } from 'cloudflare:workers';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { communicationPreferences, employeePresence, pushDevices, pushPreferences } from '@/db/schema';
import { parsePrefs, type AlertKind } from '@/lib/push-alerts';
import { buildMessages, chunk, deadTokens, EXPO_PUSH_URL, inQuietHours, type ExpoTicket, type PushNote } from '@/lib/push-message';

/**
 * Envia um push para os aparelhos (app do celular) de cada e-mail. Nunca
 * lança: a notificação é um extra, e quem chama (mensagem gravada, rotina
 * agendada) não pode falhar por causa dela. Aguardado com limite de tempo —
 * as rotas do vinext não têm waitUntil.
 */
export async function sendPushToEmails(emails: string[], note: PushNote, kind?: AlertKind) {
  try {
    let wanted = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (!wanted.length) return;
    const db = getDb();
    // Quem desligou esse tipo de aviso no app fica de fora.
    if (kind) {
      const prefs = await db.select().from(pushPreferences).where(inArray(pushPreferences.email, wanted)).all();
      const off = new Set(prefs.filter((p) => !parsePrefs(p.kinds)[kind]).map((p) => p.email.toLowerCase()));
      wanted = wanted.filter((email) => !off.has(email));
      if (!wanted.length) return;
    }
    const devices = await db.select({ email: pushDevices.userEmail, token: pushDevices.token }).from(pushDevices)
      .where(and(inArray(pushDevices.userEmail, wanted), isNull(pushDevices.disabledAt))).all();
    if (!devices.length) return;

    const prefs = await db.select({ email: communicationPreferences.email, on: communicationPreferences.quietHoursEnabled, start: communicationPreferences.quietHoursStart, end: communicationPreferences.quietHoursEnd })
      .from(communicationPreferences).where(inArray(communicationPreferences.email, wanted)).all();
    const now = new Date();
    const quiet = new Set(prefs.filter((p) => p.on && inQuietHours(now, p.start, p.end)).map((p) => p.email.toLowerCase()));

    const messages = [
      ...buildMessages(devices.filter((d) => !quiet.has(d.email)).map((d) => d.token), note, false),
      ...buildMessages(devices.filter((d) => quiet.has(d.email)).map((d) => d.token), note, true),
    ];
    const accessToken = (env as { EXPO_ACCESS_TOKEN?: string }).EXPO_ACCESS_TOKEN?.trim();
    const dead: string[] = [];
    for (const batch of chunk(messages)) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) { console.error('push: serviço do Expo respondeu', response.status); continue; }
      const payload = await response.json().catch(() => ({})) as { data?: ExpoTicket[] };
      dead.push(...deadTokens(batch, payload.data ?? []));
    }
    if (dead.length) {
      await db.update(pushDevices).set({ disabledAt: now.toISOString() }).where(inArray(pushDevices.token, dead)).run();
    }
  } catch (error) {
    console.error('push: falha ao enviar', error);
  }
}

/** Nome de quem mandou, para o título da notificação (nunca o e-mail inteiro). */
export async function senderName(email: string) {
  const row = await getDb().select({ name: employeePresence.displayName }).from(employeePresence)
    .where(eq(employeePresence.email, email.toLowerCase())).get().catch(() => undefined);
  return row?.name?.trim() || email.split('@')[0];
}
