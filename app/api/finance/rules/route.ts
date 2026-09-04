import { eq } from 'drizzle-orm';
import { financeSettings } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const rule = await getDb().select().from(financeSettings).where(eq(financeSettings.key, 'default')).get();
    return Response.json(rule ?? { key: 'default', firstTicketCents: 7000, additionalTicketCents: 7000 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Falha ao carregar regra de repasse.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request, ['gerencia']);
    const body = await request.json() as { firstTicketCents?: unknown; additionalTicketCents?: unknown };
    const firstTicketCents = validCents(body.firstTicketCents);
    const additionalTicketCents = validCents(body.additionalTicketCents);
    if (firstTicketCents === null || additionalTicketCents === null) {
      return Response.json({ error: 'Informe valores válidos entre R$ 0 e R$ 10.000.' }, { status: 400 });
    }
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
