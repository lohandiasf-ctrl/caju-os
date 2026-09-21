import { eq } from 'drizzle-orm';
import { financeSettings } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { operationDate } from '@/lib/assistant';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** A partir de quando o painel financeiro conta. Nulo = conta tudo. */
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const linha = await getDb()
      .select({ desde: financeSettings.acompanhamentoDesde, por: financeSettings.updatedBy })
      .from(financeSettings)
      .where(eq(financeSettings.key, 'default'))
      .get();
    return Response.json({ desde: linha?.desde ?? null });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar o acompanhamento.' }, { status: 500 });
  }
}

/**
 * Zera o painel a partir de uma data.
 *
 * Não apaga nada: os valores vêm do Jira e dos grupos de repasse, e continuam
 * lá. O painel só passa a ignorar o que veio antes. Mandar `desde: null` volta
 * a contar tudo.
 */
export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request, ['gerencia']);
    const body = (await request.json().catch(() => ({}))) as { desde?: unknown };

    let desde: string | null;
    if (body.desde === null) desde = null;
    else if (body.desde === 'hoje') desde = operationDate();
    else if (typeof body.desde === 'string' && DIA.test(body.desde)) desde = body.desde;
    else return Response.json({ error: 'Informe uma data válida.' }, { status: 400 });

    const updatedAt = new Date().toISOString();
    // A linha pode ainda não existir se ninguém salvou a regra antiga. Os
    // valores da regra antiga ficam como estão: o painel não usa mais, mas outras
    // telas ainda leem.
    await getDb()
      .insert(financeSettings)
      .values({ key: 'default', acompanhamentoDesde: desde, updatedBy: user.uid, updatedAt })
      .onConflictDoUpdate({
        target: financeSettings.key,
        set: { acompanhamentoDesde: desde, updatedBy: user.uid, updatedAt },
      });

    return Response.json({ desde });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível salvar o acompanhamento.' }, { status: 500 });
  }
}
