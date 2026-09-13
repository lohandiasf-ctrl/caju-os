import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { logSecurityEvent } from '@/lib/server/security-log';
import { firebaseConfig } from '@/lib/firebase-config';

type FirebaseResetResponse = {
  error?: { message?: string };
};

/**
 * Sends Firebase's password-reset email from the application backend.  Keeping
 * this request here makes the login screen independent from browser extensions,
 * stale Firebase clients and autofill quirks, while Firebase remains responsible
 * for token generation, expiration and rate limiting.
 */
export async function POST(request: Request) {
  let email = '';
  try {
    enforceRateLimit(request, 'password-reset', { limit: 5, windowMs: 15 * 60_000 });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  try {
    const body = await request.json() as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return NextResponse.json({ error: 'Informe seu e-mail para recuperar a senha.' }, { status: 400 });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Informe um endereço de e-mail válido.' }, { status: 400 });
  }

  try {
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      },
    );
    const payload = await firebaseResponse.json().catch(() => ({})) as FirebaseResetResponse;

    if (!firebaseResponse.ok) {
      const code = payload.error?.message;
      if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de solicitar outro e-mail.' }, { status: 429 });
      }

      // Never disclose whether an address exists in the account base.
      if (code === 'EMAIL_NOT_FOUND') {
        return NextResponse.json({ ok: true });
      }

      logSecurityEvent({ request, action: 'password_reset_firebase_rejected', outcome: 'failed', details: { code, status: firebaseResponse.status } });
      return NextResponse.json({ error: 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.' }, { status: 502 });
    }

    logSecurityEvent({ request, action: 'password_reset_requested', outcome: 'allowed', details: { email } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logSecurityEvent({ request, action: 'password_reset_failed', outcome: 'failed', details: error });
    return NextResponse.json({ error: 'Não foi possível conectar ao serviço de e-mail. Tente novamente.' }, { status: 503 });
  }
}
