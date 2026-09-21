import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { fsaClassifications, fsaGroups, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

/**
 * A classificação de um chamado no grupo em que ele está agora.
 *
 * É o que a tela do chamado mostra para o tipo ser marcado ali mesmo — atuação,
 * evidência, improdutiva —, e não na tela financeira. Sem valor nenhum: a tela
 * do chamado é aberta pela equipe inteira, e o dinheiro fica com quem montou o
 * grupo e com a gerência.
 *
 * "Agora" é o grupo mais recente ainda não pago. Grupos pagos são passadas
 * anteriores do chamado — ele voltou para a fila e é trabalho novo.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const ticketKey = new URL(request.url).searchParams.get('ticketKey')?.trim().toUpperCase();
    if (!ticketKey) return Response.json({ error: 'Informe a FSA.' }, { status: 400 });

    const db = getDb();
    const atual = await db
      .select({
        groupId: fsaGroups.id,
        nome: fsaGroups.nome,
        status: fsaGroups.status,
        createdBy: fsaGroups.createdBy,
        tecnico: technicians.name,
        tipo: fsaClassifications.tipo,
        improdutiva: fsaClassifications.improdutiva,
        motivo: fsaClassifications.motivo,
        observacao: fsaClassifications.observacao,
        descobertaNaLoja: fsaClassifications.descobertaNaLoja,
        revisao: fsaClassifications.revisao,
      })
      .from(fsaClassifications)
      .innerJoin(fsaGroups, eq(fsaGroups.id, fsaClassifications.groupId))
      .innerJoin(technicians, eq(technicians.id, fsaGroups.technicianId))
      .where(and(eq(fsaClassifications.ticketKey, ticketKey), ne(fsaGroups.status, 'pago')))
      .orderBy(desc(fsaGroups.id))
      .limit(1)
      .get();

    const pagas = await db
      .select({ n: sql<number>`count(*)` })
      .from(fsaClassifications)
      .innerJoin(fsaGroups, eq(fsaGroups.id, fsaClassifications.groupId))
      .where(and(eq(fsaClassifications.ticketKey, ticketKey), eq(fsaGroups.status, 'pago')))
      .get();

    if (!atual) return Response.json({ grupo: null, passadasPagas: Number(pagas?.n ?? 0) });

    const { createdBy, ...grupo } = atual;
    // Quem pode classificar é o mesmo de antes: quem montou o grupo ou a gerência.
    // O valor muda com a classificação, então não é qualquer um da equipe.
    const podeEditar =
      (user.role === 'gerencia' || createdBy.toLowerCase() === user.email.toLowerCase()) &&
      grupo.status !== 'aprovado';

    return Response.json({ grupo: { ...grupo, podeEditar }, passadasPagas: Number(pagas?.n ?? 0) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar a classificação.' }, { status: 500 });
  }
}
