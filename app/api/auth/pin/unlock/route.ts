import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers, pinCredentials } from '@/db/schema';
import { createFirebaseCustomToken, firebaseServiceAccountConfigured } from '@/lib/server/firebase-custom-token';
import { derivePinHash, isValidPin, timingSafeEqualHex } from '@/lib/server/pin-hash';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { logSecurityEvent } from '@/lib/server/security-log';

// Troca {deviceId, deviceSecret, pin} por uma sessão do Firebase — é a própria
// porta de entrada, por isso não passa por requireApiUser. deviceSecret mora
// só no navegador daquele aparelho (lib/pin-device.ts); quem não tem o par
// certo não consegue montar um hash que bata, então tentar o PIN sem o
// aparelho é inútil mesmo sem limite de tentativas por IP. O bloqueio depois
// de erros seguidos (abaixo) é por aparelho, guardado no banco — sobrevive a
// reinício do Worker, diferente do enforceRateLimit por IP.
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, 'pin-unlock', { limit: 15, windowMs: 15 * 60_000 });
    const body = await request.json() as { email?: unknown; deviceId?: unknown; deviceSecret?: unknown; pin?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const deviceSecret = typeof body.deviceSecret === 'string' ? body.deviceSecret.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!email || !deviceId || !deviceSecret || !isValidPin(pin)) {
      return Response.json({ error: 'PIN incorreto.' }, { status: 401 });
    }

    const db = getDb();
    const credential = await db.select().from(pinCredentials).where(eq(pinCredentials.deviceId, deviceId)).get();
    // Mensagem genérica sempre que a combinação não bate: não dá pista de qual
    // parte errou (aparelho não cadastrado, e-mail diferente ou PIN errado).
    if (!credential || credential.userEmail.toLowerCase() !== email) {
      logSecurityEvent({ request, action: 'pin_unlock_failed', outcome: 'denied', details: { email, reason: 'unknown_device' } });
      return Response.json({ error: 'PIN incorreto.' }, { status: 401 });
    }
    if (credential.lockedUntil && Date.parse(credential.lockedUntil) > Date.now()) {
      return Response.json({ error: 'Muitas tentativas com PIN errado. Use sua senha ou tente de novo mais tarde.' }, { status: 429 });
    }

    const attemptHash = await derivePinHash(deviceSecret, pin, credential.salt, credential.iterations);
    if (!timingSafeEqualHex(attemptHash, credential.hash)) {
      // Incremento atômico no banco: ler failedAttempts e gravar +1 em dois
      // passos deixava duas tentativas erradas concorrentes lerem o mesmo
      // valor e "perderem" um incremento, furando o bloqueio de 5 erros.
      const updated = await db.update(pinCredentials)
        .set({ failedAttempts: sql`${pinCredentials.failedAttempts} + 1` })
        .where(eq(pinCredentials.deviceId, deviceId))
        .returning({ failedAttempts: pinCredentials.failedAttempts })
        .get();
      const failedAttempts = updated?.failedAttempts ?? MAX_ATTEMPTS;
      const locked = failedAttempts >= MAX_ATTEMPTS;
      if (locked) {
        await db.update(pinCredentials).set({
          failedAttempts: 0,
          lockedUntil: new Date(Date.now() + LOCK_MS).toISOString(),
        }).where(eq(pinCredentials.deviceId, deviceId));
      }
      logSecurityEvent({ request, action: 'pin_unlock_failed', outcome: 'denied', details: { email, failedAttempts } });
      return Response.json({ error: locked ? 'Muitas tentativas com PIN errado. Use sua senha ou tente de novo mais tarde.' : 'PIN incorreto.' }, { status: locked ? 429 : 401 });
    }

    const account = await db.select({ uid: appUsers.firebaseUid, active: appUsers.active }).from(appUsers).where(eq(appUsers.email, email)).get();
    if (!account || !account.active) {
      // Conta sem acesso: o PIN não serve mais para nada, revoga já.
      await db.delete(pinCredentials).where(eq(pinCredentials.deviceId, deviceId));
      logSecurityEvent({ request, action: 'pin_unlock_failed', outcome: 'denied', details: { email, reason: 'account_inactive' } });
      return Response.json({ error: 'Sem acesso ao sistema. Use sua senha.', revoked: true }, { status: 403 });
    }

    if (!firebaseServiceAccountConfigured()) {
      return Response.json({ error: 'Login por PIN indisponível no momento. Use sua senha.' }, { status: 503 });
    }

    await db.update(pinCredentials).set({ failedAttempts: 0, lockedUntil: null, lastUsedAt: new Date().toISOString() }).where(eq(pinCredentials.deviceId, deviceId));
    const customToken = await createFirebaseCustomToken(account.uid);
    logSecurityEvent({ request, action: 'pin_unlock_succeeded', outcome: 'allowed', details: { email } });
    return Response.json({ customToken });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha no login por PIN', error);
    return Response.json({ error: 'Não foi possível entrar com o PIN.' }, { status: 500 });
  }
}
