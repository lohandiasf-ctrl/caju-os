import { eq } from 'drizzle-orm';
import { activeAttendanceTickets, fsaClassifications } from '@/db/schema';
import { getDb } from '@/db';
import { calcularRepasse, type Fsa, type Repasse } from '@/lib/fsa-payment';

export type FsaDaVisita = {
  ticketKey: string;
  summary: string;
  store: string | null;
  classificacao: {
    tipo: 'servico' | 'evidencia';
    improdutiva: boolean;
    motivo: string | null;
    observacao: string | null;
    descobertaNaLoja: boolean;
    revisao: 'ok' | 'pendente';
    updatedBy: string;
    updatedAt: string;
  } | null;
};

export type RepasseDaVisita = {
  fsas: FsaDaVisita[];
  // FSAs ainda sem classificação. Enquanto houver alguma, o repasse mostrado é
  // parcial e a visita não pode ser fechada: toda FSA precisa ser classificada.
  naoClassificadas: string[];
  // Alguma FSA saiu de evidência para serviço e espera a gerência. O cálculo
  // continua valendo — o que trava é o pagamento.
  aguardandoRevisao: string[];
  repasse: Repasse;
};

/**
 * Monta o repasse de uma visita a partir das FSAs que estão nela agora.
 *
 * O valor nunca é lido de volta de um total guardado: ele sai sempre das
 * classificações atuais, para que reclassificar não deixe para trás um número
 * que não fecha mais com as regras.
 */
export async function carregarRepasseDaVisita(attendanceId: number): Promise<RepasseDaVisita> {
  const db = getDb();

  const tickets = await db
    .select()
    .from(activeAttendanceTickets)
    .where(eq(activeAttendanceTickets.attendanceId, attendanceId))
    .all();

  const classificacoes = await db
    .select()
    .from(fsaClassifications)
    .where(eq(fsaClassifications.attendanceId, attendanceId))
    .all();

  const porTicket = new Map(classificacoes.map((c) => [c.ticketKey, c]));

  const fsas: FsaDaVisita[] = tickets.map((ticket) => {
    const c = porTicket.get(ticket.ticketKey);
    return {
      ticketKey: ticket.ticketKey,
      summary: ticket.summary,
      store: ticket.store,
      classificacao: c
        ? {
            tipo: c.tipo,
            improdutiva: c.improdutiva,
            motivo: c.motivo,
            observacao: c.observacao,
            descobertaNaLoja: c.descobertaNaLoja,
            revisao: c.revisao,
            updatedBy: c.updatedBy,
            updatedAt: c.updatedAt,
          }
        : null,
    };
  });

  const paraCalcular: Fsa[] = fsas
    .filter((f) => f.classificacao)
    .map((f) => ({
      tipo: f.classificacao!.tipo,
      improdutiva: f.classificacao!.improdutiva,
      motivo: (f.classificacao!.motivo ?? undefined) as Fsa['motivo'],
      descobertaNaLoja: f.classificacao!.descobertaNaLoja,
    }));

  return {
    fsas,
    naoClassificadas: fsas.filter((f) => !f.classificacao).map((f) => f.ticketKey),
    aguardandoRevisao: fsas
      .filter((f) => f.classificacao?.revisao === 'pendente')
      .map((f) => f.ticketKey),
    repasse: calcularRepasse(paraCalcular),
  };
}

/** R$ 1.234,56 a partir de centavos, para a tela e para o relatório. */
export function formatarCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
