import { desc, eq, ne } from 'drizzle-orm';
import { fsaClassifications, fsaGroups, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

/**
 * Qual chamado está em qual grupo de repasse, para o kanban empilhar.
 *
 * Só nome do grupo e técnico, nada de valor: o kanban é visto pela equipe
 * inteira, e a lista de grupos com dinheiro continua restrita a quem montou e à
 * gerência.
 *
 * Grupo pago fica de fora. Se o chamado voltou para a fila depois disso, ele é
 * trabalho novo e aparece solto até ser agrupado de novo. Um chamado em mais de
 * um grupo aberto — passadas diferentes — fica no mais recente.
 */
export async function GET(request: Request) {
  try {
    await requireApiUser(request);

    const linhas = await getDb()
      .select({
        ticketKey: fsaClassifications.ticketKey,
        groupId: fsaGroups.id,
        nome: fsaGroups.nome,
        tecnico: technicians.name,
      })
      .from(fsaClassifications)
      .innerJoin(fsaGroups, eq(fsaGroups.id, fsaClassifications.groupId))
      .innerJoin(technicians, eq(technicians.id, fsaGroups.technicianId))
      .where(ne(fsaGroups.status, 'pago'))
      .orderBy(desc(fsaGroups.id))
      .all();

    const vistos = new Set<string>();
    const vinculos = linhas.filter((linha) => {
      if (vistos.has(linha.ticketKey)) return false;
      vistos.add(linha.ticketKey);
      return true;
    });

    return Response.json({ vinculos });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os grupos.' }, { status: 500 });
  }
}
