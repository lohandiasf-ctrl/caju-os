import { and, eq } from 'drizzle-orm';
import {
  activeAttendances,
  activeAttendanceTickets,
  fsaClassifications,
  operationalAudit,
} from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { carregarRepasseDaVisita } from '@/lib/server/fsa-payment';
import { MOTIVOS_IMPRODUTIVO } from '@/lib/fsa-payment';

const TIPOS = ['servico', 'evidencia'] as const;

type Corpo = {
  ticketKey?: unknown;
  tipo?: unknown;
  improdutiva?: unknown;
  motivo?: unknown;
  observacao?: unknown;
  descobertaNaLoja?: unknown;
};

async function carregarVisita(id: number, email: string, role: string) {
  const db = getDb();
  const attendance = await db
    .select()
    .from(activeAttendances)
    .where(eq(activeAttendances.id, id))
    .get();
  if (!attendance) return { erro: Response.json({ error: 'Atendimento não encontrado.' }, { status: 404 }) };
  if (attendance.ownerEmail.toLowerCase() !== email.toLowerCase() && role !== 'gerencia') {
    return {
      erro: Response.json(
        { error: 'Apenas o responsável ou a gerência pode ver este repasse.' },
        { status: 403 },
      ),
    };
  }
  return { attendance };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'Atendimento inválido.' }, { status: 400 });
    }
    const { erro } = await carregarVisita(id, user.email, user.role);
    if (erro) return erro;
    return Response.json(await carregarRepasseDaVisita(id));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar o repasse.' }, { status: 500 });
  }
}

/**
 * Classifica uma FSA da visita.
 *
 * Reclassificar é livre — o técnico pode mudar de ideia a qualquer momento e o
 * valor acompanha. A única mudança que fica retida é evidência → serviço, que
 * aumenta o repasse: ela vale para o cálculo mas espera a gerência antes de
 * virar pagamento.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'Atendimento inválido.' }, { status: 400 });
    }
    const { erro } = await carregarVisita(id, user.email, user.role);
    if (erro) return erro;

    const body = (await request.json().catch(() => ({}))) as Corpo;

    const ticketKey = typeof body.ticketKey === 'string' ? body.ticketKey.trim().toUpperCase() : '';
    if (!ticketKey) return Response.json({ error: 'Informe a FSA.' }, { status: 400 });

    const tipo = TIPOS.find((t) => t === body.tipo);
    if (!tipo) {
      return Response.json({ error: 'Classifique a FSA como serviço ou evidência.' }, { status: 400 });
    }

    const improdutiva = body.improdutiva === true;
    const motivo = MOTIVOS_IMPRODUTIVO.find((m) => m === body.motivo) ?? null;
    // A regra é do negócio, não da tela: sem motivo não há como justificar
    // metade do valor depois.
    if (improdutiva && !motivo) {
      return Response.json({ error: 'Diga por que não foi possível resolver.' }, { status: 400 });
    }

    const db = getDb();
    const pertence = await db
      .select({ ticketKey: activeAttendanceTickets.ticketKey })
      .from(activeAttendanceTickets)
      .where(
        and(
          eq(activeAttendanceTickets.attendanceId, id),
          eq(activeAttendanceTickets.ticketKey, ticketKey),
        ),
      )
      .get();
    if (!pertence) {
      return Response.json({ error: 'Esta FSA não está neste atendimento.' }, { status: 404 });
    }

    const atual = await db
      .select()
      .from(fsaClassifications)
      .where(eq(fsaClassifications.ticketKey, ticketKey))
      .get();

    const virouServico = atual?.tipo === 'evidencia' && tipo === 'servico';
    const revisao = virouServico ? 'pendente' : (atual?.revisao ?? 'ok');
    const observacao = typeof body.observacao === 'string' ? body.observacao.trim() || null : null;
    const descobertaNaLoja = body.descobertaNaLoja === true;
    const now = new Date().toISOString();

    if (atual) {
      await db
        .update(fsaClassifications)
        .set({
          attendanceId: id,
          tipo,
          improdutiva,
          motivo: improdutiva ? motivo : null,
          observacao,
          descobertaNaLoja,
          revisao,
          updatedBy: user.email,
          updatedAt: now,
        })
        .where(eq(fsaClassifications.ticketKey, ticketKey));
    } else {
      await db.insert(fsaClassifications).values({
        ticketKey,
        attendanceId: id,
        tipo,
        improdutiva,
        motivo: improdutiva ? motivo : null,
        observacao,
        descobertaNaLoja,
        revisao,
        createdBy: user.email,
        createdAt: now,
        updatedBy: user.email,
        updatedAt: now,
      });
    }

    // Trilha append-only: o que mudou, quem mudou e quando, para a conferência
    // do repasse não depender da memória de ninguém.
    await db.insert(operationalAudit).values({
      ticketKey,
      action: atual ? 'FSA reclassificada' : 'FSA classificada',
      actorEmail: user.email,
      details: JSON.stringify({
        attendanceId: id,
        de: atual
          ? { tipo: atual.tipo, improdutiva: atual.improdutiva, motivo: atual.motivo }
          : null,
        para: { tipo, improdutiva, motivo, descobertaNaLoja, observacao },
        aguardandoRevisao: revisao === 'pendente',
        origin: 'sistema',
      }),
      createdAt: now,
    });

    return Response.json(await carregarRepasseDaVisita(id));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível salvar a classificação.' }, { status: 500 });
  }
}
