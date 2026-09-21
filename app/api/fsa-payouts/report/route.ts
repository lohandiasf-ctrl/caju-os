import { desc, eq, gte, inArray, and } from 'drizzle-orm';
import {
  activeAttendances,
  activeAttendanceTickets,
  fsaClassifications,
  fsaPayouts,
} from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { calcularRepasse, type Fsa } from '@/lib/fsa-payment';
import { linhasDoRelatorio, paraCsv, type VisitaDoRelatorio } from '@/lib/fsa-report';

const STATUS = ['aberto', 'pronto', 'aprovado', 'pago', 'bloqueado'] as const;

/**
 * Relatório de repasse em CSV, para a gerência mandar à folha.
 *
 * O valor é recalculado a partir das FSAs em vez de vir da coluna guardada: o
 * relatório precisa bater com as regras de hoje, e a coluna existe para outra
 * coisa — provar o que foi aprovado, não alimentar a planilha.
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
    const desde = new Date(Date.now() - janela * 24 * 60 * 60 * 1000).toISOString();

    const db = getDb();
    const visitas = await db
      .select({
        attendanceId: fsaPayouts.attendanceId,
        status: fsaPayouts.status,
        approvedBy: fsaPayouts.approvedBy,
        approvedAt: fsaPayouts.approvedAt,
        paidAt: fsaPayouts.paidAt,
        ownerEmail: activeAttendances.ownerEmail,
        whatsappGroupName: activeAttendances.whatsappGroupName,
        startedAt: activeAttendances.startedAt,
      })
      .from(fsaPayouts)
      .innerJoin(activeAttendances, eq(activeAttendances.id, fsaPayouts.attendanceId))
      .where(and(inArray(fsaPayouts.status, filtro), gte(activeAttendances.startedAt, desde)))
      .orderBy(desc(activeAttendances.startedAt))
      .limit(500)
      .all();

    if (!visitas.length) {
      return new Response(paraCsv([]), {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="repasse-fsa-${janela}-dias.csv"`,
        },
      });
    }

    const ids = visitas.map((v) => v.attendanceId);

    // Duas consultas para o lote inteiro em vez de duas por visita: 500 visitas
    // viram 1002 leituras, e o D1 tem orçamento diário.
    const tickets = await db
      .select()
      .from(activeAttendanceTickets)
      .where(inArray(activeAttendanceTickets.attendanceId, ids))
      .all();
    const classificacoes = await db
      .select()
      .from(fsaClassifications)
      .where(inArray(fsaClassifications.attendanceId, ids))
      .all();

    const porTicket = new Map(classificacoes.map((c) => [c.ticketKey, c]));
    const ticketsPorVisita = new Map<number, typeof tickets>();
    for (const t of tickets) {
      const lista = ticketsPorVisita.get(t.attendanceId) ?? [];
      lista.push(t);
      ticketsPorVisita.set(t.attendanceId, lista);
    }

    const paraRelatorio: VisitaDoRelatorio[] = visitas.map((visita) => {
      const daVisita = ticketsPorVisita.get(visita.attendanceId) ?? [];
      const fsas = daVisita.map((t) => {
        const c = porTicket.get(t.ticketKey);
        return {
          ticketKey: t.ticketKey,
          tipo: c?.tipo ?? null,
          improdutiva: c?.improdutiva ?? false,
          motivo: c?.motivo ?? null,
          observacao: c?.observacao ?? null,
          descobertaNaLoja: c?.descobertaNaLoja ?? false,
        };
      });
      const paraCalcular: Fsa[] = fsas
        .filter((f) => f.tipo)
        .map((f) => ({
          tipo: f.tipo!,
          improdutiva: f.improdutiva,
          motivo: (f.motivo ?? undefined) as Fsa['motivo'],
          descobertaNaLoja: f.descobertaNaLoja,
        }));
      return {
        attendanceId: visita.attendanceId,
        data: visita.startedAt,
        tecnico: visita.ownerEmail,
        grupo: visita.whatsappGroupName,
        status: visita.status,
        aprovadoPor: visita.approvedBy,
        aprovadoEm: visita.approvedAt,
        pagoEm: visita.paidAt,
        repasse: calcularRepasse(paraCalcular),
        fsas,
      };
    });

    return new Response(paraCsv(linhasDoRelatorio(paraRelatorio)), {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="repasse-fsa-${janela}-dias.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível gerar o relatório.' }, { status: 500 });
  }
}
