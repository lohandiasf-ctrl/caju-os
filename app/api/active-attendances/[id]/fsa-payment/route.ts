import { and, eq } from 'drizzle-orm';
import {
  activeAttendances,
  activeAttendanceTickets,
  fsaClassifications,
  fsaPayouts,
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

/**
 * Ciclo de vida do repasse da visita.
 *
 * Fechar tira uma fotografia do cálculo; aprovar, bloquear e pagar mexem só
 * nessa fotografia. O Caju não paga ninguém — 'pago' é o gerente registrando
 * que a folha já saiu, para a visita não aparecer de novo na fila.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'Atendimento inválido.' }, { status: 400 });
    }
    const { erro } = await carregarVisita(id, user.email, user.role);
    if (erro) return erro;

    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    const action = typeof body.action === 'string' ? body.action : '';
    const daGerencia = user.role === 'gerencia';
    // Fechar é do técnico, que esteve na loja. O resto é dinheiro: só gerência.
    if (action !== 'fechar' && !daGerencia) {
      return Response.json({ error: 'Apenas a gerência pode revisar o repasse.' }, { status: 403 });
    }

    const db = getDb();
    const visita = await carregarRepasseDaVisita(id);
    const atual = await db.select().from(fsaPayouts).where(eq(fsaPayouts.attendanceId, id)).get();
    const now = new Date().toISOString();

    const registrar = async (acao: string, detalhes: Record<string, unknown>) => {
      const tickets = visita.fsas.map((f) => f.ticketKey);
      if (!tickets.length) return;
      await db.insert(operationalAudit).values(
        tickets.map((ticketKey) => ({
          ticketKey,
          action: acao,
          actorEmail: user.email,
          details: JSON.stringify({ attendanceId: id, ...detalhes, origin: 'sistema' }),
          createdAt: now,
        })),
      );
    };

    if (action === 'fechar') {
      // Toda FSA precisa estar classificada: fechar com pendência guardaria um
      // valor que já se sabe incompleto.
      if (visita.naoClassificadas.length) {
        return Response.json(
          { error: `Ainda falta classificar: ${visita.naoClassificadas.join(', ')}.` },
          { status: 409 },
        );
      }
      if (atual && atual.status !== 'aberto' && atual.status !== 'pronto' && atual.status !== 'bloqueado') {
        return Response.json({ error: 'Este repasse já foi aprovado.' }, { status: 409 });
      }
      // Evidência que virou serviço aumenta o valor, então a visita chega à
      // gerência já sinalizada em vez de entrar na fila como se estivesse ok.
      const status = visita.aguardandoRevisao.length ? ('bloqueado' as const) : ('pronto' as const);
      const valores = {
        status,
        servicosCents: visita.repasse.servicos.totalCents,
        evidenciasCents: visita.repasse.evidencias.totalCents,
        descontoImprodutivoCents: visita.repasse.descontoImprodutivoCents,
        totalCents: visita.repasse.totalCents,
        memoria: JSON.stringify(visita.repasse),
        updatedAt: now,
      };
      if (atual) {
        await db.update(fsaPayouts).set(valores).where(eq(fsaPayouts.attendanceId, id));
      } else {
        await db.insert(fsaPayouts).values({ attendanceId: id, ...valores, createdAt: now });
      }
      await registrar('Repasse fechado', { status, totalCents: visita.repasse.totalCents });
      return Response.json(await carregarRepasseDaVisita(id));
    }

    if (!atual) {
      return Response.json({ error: 'Este repasse ainda não foi fechado.' }, { status: 409 });
    }

    if (action === 'liberar') {
      await db
        .update(fsaClassifications)
        .set({ revisao: 'ok', updatedBy: user.email, updatedAt: now })
        .where(eq(fsaClassifications.attendanceId, id));
      // O valor não muda ao liberar: ele já contava. O que sai é a trava.
      if (atual.status === 'bloqueado') {
        await db
          .update(fsaPayouts)
          .set({ status: 'pronto', updatedAt: now })
          .where(eq(fsaPayouts.attendanceId, id));
      }
      await registrar('Reclassificação liberada', { de: 'bloqueado', para: 'pronto' });
      return Response.json(await carregarRepasseDaVisita(id));
    }

    if (action === 'aprovar') {
      if (atual.status !== 'pronto') {
        return Response.json(
          { error: 'Só é possível aprovar um repasse pronto e sem pendência.' },
          { status: 409 },
        );
      }
      // Aprova-se o que está na tela agora, não o que foi fechado antes: se a
      // classificação mudou no meio, a fotografia é refeita.
      await db
        .update(fsaPayouts)
        .set({
          status: 'aprovado',
          servicosCents: visita.repasse.servicos.totalCents,
          evidenciasCents: visita.repasse.evidencias.totalCents,
          descontoImprodutivoCents: visita.repasse.descontoImprodutivoCents,
          totalCents: visita.repasse.totalCents,
          memoria: JSON.stringify(visita.repasse),
          approvedBy: user.email,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(fsaPayouts.attendanceId, id));
      await registrar('Repasse aprovado', { totalCents: visita.repasse.totalCents });
      return Response.json(await carregarRepasseDaVisita(id));
    }

    if (action === 'bloquear') {
      if (atual.status === 'pago') {
        return Response.json({ error: 'Este repasse já foi pago.' }, { status: 409 });
      }
      await db
        .update(fsaPayouts)
        .set({ status: 'bloqueado', approvedBy: null, approvedAt: null, updatedAt: now })
        .where(eq(fsaPayouts.attendanceId, id));
      await registrar('Repasse bloqueado', { de: atual.status });
      return Response.json(await carregarRepasseDaVisita(id));
    }

    if (action === 'pagar') {
      if (atual.status !== 'aprovado') {
        return Response.json({ error: 'Só é possível pagar um repasse aprovado.' }, { status: 409 });
      }
      await db
        .update(fsaPayouts)
        .set({ status: 'pago', paidAt: now, updatedAt: now })
        .where(eq(fsaPayouts.attendanceId, id));
      await registrar('Repasse pago', { totalCents: atual.totalCents });
      return Response.json(await carregarRepasseDaVisita(id));
    }

    return Response.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível atualizar o repasse.' }, { status: 500 });
  }
}
