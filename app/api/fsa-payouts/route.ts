import { desc, eq, inArray } from 'drizzle-orm';
import { activeAttendances, activeAttendanceTickets, fsaPayouts } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

const STATUS = ['aberto', 'pronto', 'aprovado', 'pago', 'bloqueado'] as const;

/**
 * Fila de repasses para a gerência.
 *
 * Só o que já foi fechado aparece: visita em andamento ainda é do técnico. O
 * padrão traz o que espera decisão (pronto e bloqueado), porque é para isso que
 * a tela existe; o histórico vem sob demanda pelo filtro.
 */
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);

    const url = new URL(request.url);
    const pedido = url.searchParams.get('status');
    const filtro = STATUS.filter((s) => (pedido ? pedido.split(',').includes(s) : s === 'pronto' || s === 'bloqueado'));
    if (!filtro.length) return Response.json({ payouts: [] });

    const db = getDb();
    const linhas = await db
      .select({
        attendanceId: fsaPayouts.attendanceId,
        status: fsaPayouts.status,
        servicosCents: fsaPayouts.servicosCents,
        evidenciasCents: fsaPayouts.evidenciasCents,
        improdutivasCents: fsaPayouts.improdutivasCents,
        descontoImprodutivoCents: fsaPayouts.descontoImprodutivoCents,
        totalCents: fsaPayouts.totalCents,
        approvedBy: fsaPayouts.approvedBy,
        approvedAt: fsaPayouts.approvedAt,
        paidAt: fsaPayouts.paidAt,
        updatedAt: fsaPayouts.updatedAt,
        ownerEmail: activeAttendances.ownerEmail,
        whatsappGroupName: activeAttendances.whatsappGroupName,
        startedAt: activeAttendances.startedAt,
      })
      .from(fsaPayouts)
      .innerJoin(activeAttendances, eq(activeAttendances.id, fsaPayouts.attendanceId))
      .where(inArray(fsaPayouts.status, filtro))
      .orderBy(desc(fsaPayouts.updatedAt))
      .limit(200)
      .all();

    if (!linhas.length) return Response.json({ payouts: [] });

    // As FSAs vêm numa consulta só: uma por visita transformaria a fila numa
    // rajada de leituras, e o D1 tem orçamento diário.
    const tickets = await db
      .select({
        attendanceId: activeAttendanceTickets.attendanceId,
        ticketKey: activeAttendanceTickets.ticketKey,
      })
      .from(activeAttendanceTickets)
      .where(inArray(activeAttendanceTickets.attendanceId, linhas.map((l) => l.attendanceId)))
      .all();

    const porVisita = new Map<number, string[]>();
    for (const t of tickets) {
      const lista = porVisita.get(t.attendanceId) ?? [];
      lista.push(t.ticketKey);
      porVisita.set(t.attendanceId, lista);
    }

    return Response.json({
      payouts: linhas.map((linha) => ({
        ...linha,
        ticketKeys: porVisita.get(linha.attendanceId) ?? [],
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar a fila de repasses.' }, { status: 500 });
  }
}
