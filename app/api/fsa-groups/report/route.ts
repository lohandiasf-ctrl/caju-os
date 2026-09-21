import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { fsaClassifications, fsaGroups, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { calcularRepasse, type Fsa } from '@/lib/fsa-payment';
import { linhasDoRelatorio, paraCsv, type VisitaDoRelatorio } from '@/lib/fsa-report';

const STATUS = ['aberto', 'pronto', 'aprovado', 'pago', 'bloqueado'] as const;

/**
 * Relatório de repasse em CSV, para a gerência mandar à folha.
 *
 * O valor é recalculado a partir das classificações em vez de vir da coluna
 * guardada: o relatório precisa bater com as regras de hoje, e a coluna existe
 * para outra coisa — provar o que foi aprovado.
 */
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);

    const url = new URL(request.url);
    const pedido = url.searchParams.get('status');
    const filtro = STATUS.filter((s) =>
      pedido ? pedido.split(',').includes(s) : s === 'aprovado' || s === 'pago',
    );
    if (!filtro.length) {
      return Response.json({ error: 'Escolha ao menos uma situação.' }, { status: 400 });
    }

    const dias = Number(url.searchParams.get('dias') ?? '30');
    const janela = Number.isFinite(dias) && dias > 0 ? Math.min(dias, 365) : 30;
    const desde = new Date(Date.now() - janela * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const db = getDb();
    const grupos = await db
      .select({
        id: fsaGroups.id,
        nome: fsaGroups.nome,
        dia: fsaGroups.dia,
        status: fsaGroups.status,
        tecnico: technicians.name,
        approvedBy: fsaGroups.approvedBy,
        approvedAt: fsaGroups.approvedAt,
        paidAt: fsaGroups.paidAt,
      })
      .from(fsaGroups)
      .innerJoin(technicians, eq(technicians.id, fsaGroups.technicianId))
      .where(and(inArray(fsaGroups.status, filtro), gte(fsaGroups.dia, desde)))
      .orderBy(desc(fsaGroups.dia))
      .limit(500)
      .all();

    const nomeArquivo = `repasse-fsa-${janela}-dias.csv`;
    const cabecalho = {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    };

    if (!grupos.length) return new Response(paraCsv([]), { headers: cabecalho });

    // Uma consulta para o lote inteiro em vez de uma por grupo: 500 grupos
    // virariam 500 leituras, e o D1 tem orçamento diário.
    const linhas = await db
      .select()
      .from(fsaClassifications)
      .where(inArray(fsaClassifications.groupId, grupos.map((g) => g.id)))
      .all();

    const porGrupo = new Map<number, typeof linhas>();
    for (const l of linhas) {
      const lista = porGrupo.get(l.groupId) ?? [];
      lista.push(l);
      porGrupo.set(l.groupId, lista);
    }

    const paraRelatorio: VisitaDoRelatorio[] = grupos.map((g) => {
      const doGrupo = porGrupo.get(g.id) ?? [];
      const fsas = doGrupo.map((l) => ({
        ticketKey: l.ticketKey,
        tipo: l.tipo,
        improdutiva: l.improdutiva,
        motivo: l.motivo,
        observacao: l.observacao,
        descobertaNaLoja: l.descobertaNaLoja,
      }));
      const paraCalcular: Fsa[] = fsas
        .filter((f) => f.tipo)
        .map((f) => ({
          tipo: f.tipo!,
          improdutiva: f.improdutiva,
          motivo: (f.motivo ?? undefined) as Fsa['motivo'],
          descobertaNaLoja: f.descobertaNaLoja,
        }));
      return {
        attendanceId: g.id,
        data: g.dia,
        tecnico: g.tecnico,
        grupo: g.nome,
        status: g.status,
        aprovadoPor: g.approvedBy,
        aprovadoEm: g.approvedAt,
        pagoEm: g.paidAt,
        repasse: calcularRepasse(paraCalcular),
        fsas,
      };
    });

    return new Response(paraCsv(linhasDoRelatorio(paraRelatorio)), { headers: cabecalho });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível gerar o relatório.' }, { status: 500 });
  }
}
