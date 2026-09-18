import { eq } from 'drizzle-orm';
import { financeSettings } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { FIRST_VISIT_CENTS } from '@/lib/finance-rules';

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const rule = await getDb().select().from(financeSettings).where(eq(financeSettings.key, 'default')).get();
    // A primeira visita é valor base da operação, não configuração: o que
    // estiver gravado não muda isso.
    return Response.json({ ...(rule ?? { key: 'default', additionalTicketCents: 7000 }), firstTicketCents: FIRST_VISIT_CENTS });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Falha ao carregar regra de repasse.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request, ['gerencia']);
    const body = await request.json() as { additionalTicketCents?: unknown };
    const additionalTicketCents = validCents(body.additionalTicketCents);
    if (additionalTicketCents === null) {
      return Response.json({ error: 'Informe um valor válido entre R$ 0 e R$ 10.000.' }, { status: 400 });
    }
    // Venha o que vier do cliente, a primeira visita continua a mesma.
    const firstTicketCents = FIRST_VISIT_CENTS;
    const updatedAt = new Date().toISOString();
    await getDb().insert(financeSettings).values({ key: 'default', firstTicketCents, additionalTicketCents, updatedBy: user.uid, updatedAt }).onConflictDoUpdate({
      target: financeSettings.key,
      set: { firstTicketCents, additionalTicketCents, updatedBy: user.uid, updatedAt },
    });
    return Response.json({ key: 'default', firstTicketCents, additionalTicketCents, updatedAt });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Falha ao salvar regra de repasse.' }, { status: 500 });
  }
}

function validCents(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
}
