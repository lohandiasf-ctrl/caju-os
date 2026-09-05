import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getDb } from '@/db';
import { appUsers } from '@/db/schema';

const FIREBASE_API_KEY = 'AIzaSyBOiiBRwuN8VKZ-l2MFqaqQJ8sOc8zAXP4';

export async function POST(request: Request) {
  try {
    const manager = await requireApiUser(request, ['gerencia']);
    const body = await request.json() as { email?: string; role?: 'gerencia' | 'coordenador' | 'n1' | 'analista' | 'tecnico' };
    const email = body.email?.trim().toLowerCase();
    const role = body.role;
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !role || !['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'].includes(role)) return NextResponse.json({ error: 'Informe um e-mail válido e uma hierarquia.' }, { status: 400 });
    const temporaryPassword = `${crypto.randomUUID()}Aa9!`;
    const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: temporaryPassword, returnSecureToken: true }) });
    const account = await signUp.json() as { localId?: string; error?: { message?: string } };
    if (!signUp.ok || !account.localId) return NextResponse.json({ error: account.error?.message === 'EMAIL_EXISTS' ? 'Este e-mail já possui uma conta.' : 'Não foi possível criar a conta.' }, { status: 409 });
    const reset = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }) });
    if (!reset.ok) return NextResponse.json({ error: 'Conta criada, mas não foi possível enviar o e-mail de senha.' }, { status: 502 });
    const now = new Date().toISOString();
    await getDb().insert(appUsers).values({ firebaseUid: account.localId, email, role, active: true, createdAt: now, updatedAt: now });
    return NextResponse.json({ email, role, invitedBy: manager.email });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao convidar funcionário.' }, { status: 500 }); }
}

