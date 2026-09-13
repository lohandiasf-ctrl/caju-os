import { NextResponse } from 'next/server';

const FIREBASE_API_KEY = 'AIzaSyBOiiBRwuN8VKZ-l2MFqaqQJ8sOc8zAXP4';

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
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
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

      console.error('Firebase recusou a recuperação de senha', { code, status: firebaseResponse.status });
      return NextResponse.json({ error: 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao solicitar recuperação de senha', error);
    return NextResponse.json({ error: 'Não foi possível conectar ao serviço de e-mail. Tente novamente.' }, { status: 503 });
  }
}
