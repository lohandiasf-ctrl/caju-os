import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getDb } from '@/db';
import { appUsers } from '@/db/schema';
import { logSecurityEvent } from '@/lib/server/security-log';
import { firebaseConfig } from '@/lib/firebase-config';

export async function POST(request: Request) {
  try {
    const manager = await requireApiUser(request, ['gerencia']);
    const body = await request.json() as { email?: string; role?: 'gerencia' | 'coordenador' | 'n1' | 'analista' | 'tecnico' };
    const email = body.email?.trim().toLowerCase();
    const role = body.role;
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !role || !['gerencia', 'coordenador', 'n1', 'analista', 'tecnico'].includes(role)) return NextResponse.json({ error: 'Informe um e-mail válido e uma hierarquia.' }, { status: 400 });
    // Quem foi retirado da equipe já tem conta no Firebase: convidar de novo
    // readmite (reativa com a hierarquia escolhida) em vez de criar outra conta.
    const existing = await getDb().select({ active: appUsers.active }).from(appUsers).where(eq(appUsers.email, email)).get();
    if (existing?.active) return NextResponse.json({ error: 'Esta pessoa já está na equipe.' }, { status: 409 });
    if (existing) {
      await getDb().update(appUsers).set({ active: true, role, updatedAt: new Date().toISOString() }).where(eq(appUsers.email, email));
      logSecurityEvent({ request, user: manager, action: 'user_readmitted', outcome: 'allowed', details: { email, role } });
      return NextResponse.json({ email, role, invitedBy: manager.email, readmitted: true });
    }
    const temporaryPassword = `${crypto.randomUUID()}Aa9!`;
    const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: temporaryPassword, returnSecureToken: true }) });
    const account = await signUp.json() as { localId?: string; error?: { message?: string } };
    if (!signUp.ok || !account.localId) return NextResponse.json({ error: account.error?.message === 'EMAIL_EXISTS' ? 'Este e-mail já possui uma conta.' : 'Não foi possível criar a conta.' }, { status: 409 });
    const reset = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }) });
    if (!reset.ok) return NextResponse.json({ error: 'Conta criada, mas não foi possível enviar o e-mail de senha.' }, { status: 502 });
    const now = new Date().toISOString();
    await getDb().insert(appUsers).values({ firebaseUid: account.localId, email, role, active: true, createdAt: now, updatedAt: now });
    logSecurityEvent({ request, user: manager, action: 'user_invited', outcome: 'allowed', details: { email, role } });
    return NextResponse.json({ email, role, invitedBy: manager.email });
  } catch (error) {
    logSecurityEvent({ request, action: 'user_invite_failed', outcome: 'failed', details: error });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao convidar funcionário.' }, { status: 500 });
  }
}

