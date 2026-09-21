import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { fsaClassifications, fsaGroups, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const CONFIRMADO = ['aprovado', 'pago'] as const;
const PENDENTE = ['pronto', 'bloqueado'] as const;

/**
 * Totais dos grupos de repasse para o painel financeiro.
 *
 * Agregado no banco, e não somado a partir da lista de grupos: a lista tem teto
 * de 200, e um total que trunca em silêncio é justamente o que a conferência
 * 1:1 existe para pegar.
 *
 * "Confirmado" é aprovado + pago — o que vai para a folha. "Pendente" é o que já
 * foi fechado e espera a gerência. Grupo em aberto ainda não é número de ninguém.
 */
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const pedido = new URL(request.url).searchParams.get('desde');
    const desde = pedido && DIA.test(pedido) ? pedido : '0000-01-01';

    const db = getDb();

    const porTecnico = await db
      .select({
        technicianId: fsaGroups.technicianId,
        tecnico: technicians.name,
        status: fsaGroups.status,
        grupos: sql<number>`count(*)`,
        totalCents: sql<number>`coalesce(sum(${fsaGroups.totalCents}), 0)`,
      })
      .from(fsaGroups)
      .innerJoin(technicians, eq(technicians.id, fsaGroups.technicianId))
      .where(and(gte(fsaGroups.dia, desde), inArray(fsaGroups.status, [...CONFIRMADO, ...PENDENTE])))
      .groupBy(fsaGroups.technicianId, technicians.name, fsaGroups.status)
      .all();

    const porMes = await db
      .select({
        mes: sql<string>`substr(${fsaGroups.dia}, 1, 7)`,
        totalCents: sql<number>`coalesce(sum(${fsaGroups.totalCents}), 0)`,
      })
      .from(fsaGroups)
      .where(and(gte(fsaGroups.dia, desde), inArray(fsaGroups.status, [...CONFIRMADO])))
      .groupBy(sql`substr(${fsaGroups.dia}, 1, 7)`)
      .all();

    // Quantas FSAs cada técnico teve nos grupos confirmados, para a tabela
    // mostrar volume além de valor.
    const fsas = await db
      .select({
        technicianId: fsaGroups.technicianId,
        fsas: sql<number>`count(${fsaClassifications.id})`,
      })
      .from(fsaClassifications)
      .innerJoin(fsaGroups, eq(fsaGroups.id, fsaClassifications.groupId))
      .where(and(gte(fsaGroups.dia, desde), inArray(fsaGroups.status, [...CONFIRMADO])))
      .groupBy(fsaGroups.technicianId)
      .all();
    const fsasPorTecnico = new Map(fsas.map((f) => [f.technicianId, Number(f.fsas)]));

    const tecnicos = new Map<
      number,
      { technicianId: number; tecnico: string; grupos: number; fsas: number; confirmadoCents: number; pendenteCents: number }
    >();
    for (const linha of porTecnico) {
      const atual = tecnicos.get(linha.technicianId) ?? {
        technicianId: linha.technicianId,
        tecnico: linha.tecnico,
        grupos: 0,
        fsas: fsasPorTecnico.get(linha.technicianId) ?? 0,
        confirmadoCents: 0,
        pendenteCents: 0,
      };
      const cents = Number(linha.totalCents);
      if ((CONFIRMADO as readonly string[]).includes(linha.status)) {
        atual.confirmadoCents += cents;
        atual.grupos += Number(linha.grupos);
      } else {
        atual.pendenteCents += cents;
      }
      tecnicos.set(linha.technicianId, atual);
    }

    const lista = [...tecnicos.values()].sort((a, b) => b.confirmadoCents - a.confirmadoCents);

    return Response.json({
      desde: pedido && DIA.test(pedido) ? pedido : null,
      confirmadoCents: lista.reduce((soma, t) => soma + t.confirmadoCents, 0),
      pendenteCents: lista.reduce((soma, t) => soma + t.pendenteCents, 0),
      porTecnico: lista,
      porMes: porMes.map((m) => ({ mes: m.mes, totalCents: Number(m.totalCents) })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível resumir os repasses.' }, { status: 500 });
  }
}
