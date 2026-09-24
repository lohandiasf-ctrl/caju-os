import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pinCredentials } from '@/db/schema';
import { firebaseServiceAccountConfigured } from '@/lib/server/firebase-custom-token';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { derivePinHash, isValidPin, PIN_HASH_ITERATIONS, randomHex } from '@/lib/server/pin-hash';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { logSecurityEvent } from '@/lib/server/security-log';

// Cadastra (ou substitui) o PIN de um aparelho: quem chama já está autenticado
// pela senha (requireApiUser confere o token do Firebase). deviceId identifica
// a linha; deviceSecret nunca é guardado em texto puro, só o hash dele com o
// PIN (lib/server/pin-hash.ts) — sem o par certo, /api/auth/pin/unlock nunca bate.

// A UI (components/pin-setup-offer.tsx, PinAccessSettings) consulta este GET
// antes de oferecer o cadastro: sem a chave de serviço do Firebase configurada
// (db/env.d.ts), /api/auth/pin/unlock nunca vai conseguir logar de verdade.
export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    return Response.json({ configured: firebaseServiceAccountConfigured() });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ configured: false });
  }
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, 'pin-setup', { limit: 20, windowMs: 15 * 60_000 });
    const user = await requireApiUser(request);
    const body = await request.json() as { deviceId?: unknown; deviceSecret?: unknown; pin?: unknown; label?: unknown };
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const deviceSecret = typeof body.deviceSecret === 'string' ? body.deviceSecret.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) || null : null;

    if (deviceId.length < 16 || deviceId.length > 200) return Response.json({ error: 'Aparelho inválido.' }, { status: 400 });
    if (deviceSecret.length < 32 || deviceSecret.length > 200) return Response.json({ error: 'Aparelho inválido.' }, { status: 400 });
    if (!isValidPin(pin)) return Response.json({ error: 'O PIN precisa ter 4 números.' }, { status: 400 });

    const db = getDb();
    const salt = randomHex(16);
    const hash = await derivePinHash(deviceSecret, pin, salt, PIN_HASH_ITERATIONS);
    const now = new Date().toISOString();
    await db.insert(pinCredentials).values({
      userEmail: user.email, deviceId, label, salt, hash, iterations: PIN_HASH_ITERATIONS,
      failedAttempts: 0, lockedUntil: null, createdAt: now, lastUsedAt: null,
    }).onConflictDoUpdate({
      target: pinCredentials.deviceId,
      set: { userEmail: user.email, label, salt, hash, iterations: PIN_HASH_ITERATIONS, failedAttempts: 0, lockedUntil: null, createdAt: now, lastUsedAt: null },
    });
    logSecurityEvent({ request, user, action: 'pin_setup', outcome: 'allowed', details: { deviceId } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao cadastrar PIN', error);
    return Response.json({ error: 'Não foi possível cadastrar o PIN.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    enforceRateLimit(request, 'pin-setup', { limit: 20, windowMs: 15 * 60_000 });
    const user = await requireApiUser(request);
    const body = await request.json() as { deviceId?: unknown };
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!deviceId) return Response.json({ error: 'Informe o aparelho.' }, { status: 400 });

    const db = getDb();
    await db.delete(pinCredentials).where(and(eq(pinCredentials.deviceId, deviceId), eq(pinCredentials.userEmail, user.email)));
    logSecurityEvent({ request, user, action: 'pin_removed', outcome: 'allowed', details: { deviceId } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao remover PIN', error);
    return Response.json({ error: 'Não foi possível remover o PIN.' }, { status: 500 });
  }
}
