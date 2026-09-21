import { and, eq } from 'drizzle-orm';
import { fsaClassifications, fsaGroups, operationalAudit } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { carregarGrupo } from '@/lib/server/fsa-payment';
import { MOTIVOS_IMPRODUTIVO } from '@/lib/fsa-payment';

const TIPOS = ['servico', 'evidencia'] as const;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

async function abrir(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  const { id: bruto } = await context.params;
  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) {
    return { erro: Response.json({ error: 'Grupo inválido.' }, { status: 400 }) };
  }
  const grupo = await carregarGrupo(id);
  if (!grupo) return { erro: Response.json({ error: 'Grupo não encontrado.' }, { status: 404 }) };
  if (user.role !== 'gerencia' && grupo.createdBy.toLowerCase() !== user.email.toLowerCase()) {
    return {
      erro: Response.json(
        { error: 'Apenas quem montou o grupo ou a gerência pode vê-lo.' },
        { status: 403 },
      ),
    };
  }
  return { user, id, grupo };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { erro, grupo } = await abrir(request, context);
    if (erro) return erro;
    return Response.json({ grupo });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar o grupo.' }, { status: 500 });
  }
}

/**
 * Classifica uma FSA do grupo.
 *
 * Reclassificar é livre — o técnico pode mudar de ideia a qualquer momento e o
 * valor acompanha. A única mudança retida é evidência → atuação, que aumenta o
 * repasse: ela vale para o cálculo mas espera a gerência antes de virar
 * pagamento.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { erro, user, grupo } = await abrir(request, context);
    if (erro) return erro;

    if (grupo!.status === 'aprovado' || grupo!.status === 'pago') {
      return Response.json(
        { error: `Este grupo já foi ${grupo!.status} e não aceita mais mudança.` },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ticketKey = typeof body.ticketKey === 'string' ? body.ticketKey.trim().toUpperCase() : '';
    const atual = grupo!.fsas.find((f) => f.ticketKey === ticketKey);
    if (!atual) return Response.json({ error: 'Esta FSA não está neste grupo.' }, { status: 404 });

    const tipo = TIPOS.find((t) => t === body.tipo);
    if (!tipo) {
      return Response.json({ error: 'Classifique a FSA como atuação ou evidência.' }, { status: 400 });
    }

    // Evidência não tem improdutiva: entregar a evidência é o trabalho inteiro.
    const improdutiva = tipo === 'servico' && body.improdutiva === true;
    const motivo = MOTIVOS_IMPRODUTIVO.find((m) => m === body.motivo) ?? null;
    // A regra é do negócio, não da tela: sem motivo não há como justificar
    // metade do valor depois.
    if (improdutiva && !motivo) {
      return Response.json({ error: 'Diga por que não foi possível resolver.' }, { status: 400 });
    }

    const virouAtuacao = atual.tipo === 'evidencia' && tipo === 'servico';
    const revisao = virouAtuacao ? 'pendente' : atual.revisao;
    const observacao = typeof body.observacao === 'string' ? body.observacao.trim() || null : null;
    const descobertaNaLoja = body.descobertaNaLoja === true;
    const now = new Date().toISOString();

    const db = getDb();
    await db
      .update(fsaClassifications)
      .set({
        tipo,
        improdutiva,
        motivo: improdutiva ? motivo : null,
        observacao,
        descobertaNaLoja,
        revisao,
        updatedBy: user!.email,
        updatedAt: now,
      })
      .where(eq(fsaClassifications.id, atual.id));

    // Trilha append-only: o que mudou, quem mudou e quando, para a conferência
    // do repasse não depender da memória de ninguém.
    await db.insert(operationalAudit).values({
      ticketKey,
      action: atual.tipo ? 'FSA reclassificada' : 'FSA classificada',
      actorEmail: user!.email,
      details: JSON.stringify({
        groupId: grupo!.id,
        dia: grupo!.dia,
        tecnico: grupo!.tecnico,
        de: atual.tipo ? { tipo: atual.tipo, improdutiva: atual.improdutiva, motivo: atual.motivo } : null,
        para: { tipo, improdutiva, motivo, descobertaNaLoja, observacao },
        aguardandoRevisao: revisao === 'pendente',
        origin: 'sistema',
      }),
      createdAt: now,
    });

    return Response.json({ grupo: await carregarGrupo(grupo!.id) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível salvar a classificação.' }, { status: 500 });
  }
}

/**
 * Ciclo de vida do repasse do grupo.
 *
 * Fechar tira uma fotografia do cálculo; aprovar, bloquear e pagar mexem só
 * nessa fotografia. O Caju não paga ninguém — 'pago' é o gerente registrando
 * que a folha já saiu, para o grupo não aparecer de novo na fila.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { erro, user, grupo } = await abrir(request, context);
    if (erro) return erro;

    const body = (await request.json().catch(() => ({}))) as { action?: unknown; dataPagamento?: unknown };
    const action = typeof body.action === 'string' ? body.action : '';
    const dataPagamento =
      typeof body.dataPagamento === 'string' && DIA.test(body.dataPagamento) ? body.dataPagamento : null;
    const daGerencia = user!.role === 'gerencia';
    // Fechar é de quem montou o grupo. O resto é dinheiro: só gerência.
    if (action !== 'fechar' && !daGerencia) {
      return Response.json({ error: 'Apenas a gerência pode revisar o repasse.' }, { status: 403 });
    }

    const db = getDb();
    const now = new Date().toISOString();

    const registrar = async (acao: string, detalhes: Record<string, unknown>) =>
      db.insert(operationalAudit).values(
        grupo!.fsas.map((f) => ({
          ticketKey: f.ticketKey,
          action: acao,
          actorEmail: user!.email,
          details: JSON.stringify({ groupId: grupo!.id, dia: grupo!.dia, ...detalhes, origin: 'sistema' }),
          createdAt: now,
        })),
      );

    const fotografia = {
      // Só a parte produtiva em cada categoria: o que as improdutivas renderam
      // vai na linha delas, não descontado das outras duas.
      servicosCents: grupo!.repasse.servicos.produtivosCents,
      evidenciasCents: grupo!.repasse.evidencias.totalCents,
      improdutivasCents: grupo!.repasse.improdutivas.totalCents,
      descontoImprodutivoCents: grupo!.repasse.descontoImprodutivoCents,
      totalCents: grupo!.repasse.totalCents,
      memoria: JSON.stringify(grupo!.repasse),
    };

    if (action === 'fechar') {
      // Toda FSA precisa estar classificada: fechar com pendência guardaria um
      // valor que já se sabe incompleto.
      if (grupo!.naoClassificadas.length) {
        return Response.json(
          { error: `Ainda falta classificar: ${grupo!.naoClassificadas.join(', ')}.` },
          { status: 409 },
        );
      }
      if (grupo!.status === 'aprovado' || grupo!.status === 'pago') {
        return Response.json({ error: 'Este repasse já foi aprovado.' }, { status: 409 });
      }
      // Evidência que virou atuação aumenta o valor, então o grupo chega à
      // gerência já sinalizado em vez de entrar na fila como se estivesse ok.
      const status = grupo!.aguardandoRevisao.length ? ('bloqueado' as const) : ('pronto' as const);
      await db
        .update(fsaGroups)
        .set({ status, ...fotografia, updatedAt: now })
        .where(eq(fsaGroups.id, grupo!.id));
      await registrar('Repasse do grupo fechado', { status, totalCents: grupo!.repasse.totalCents });
      return Response.json({ grupo: await carregarGrupo(grupo!.id) });
    }

    if (grupo!.status === 'aberto') {
      return Response.json({ error: 'Este repasse ainda não foi fechado.' }, { status: 409 });
    }

    if (action === 'liberar') {
      await db
        .update(fsaClassifications)
        .set({ revisao: 'ok', updatedBy: user!.email, updatedAt: now })
        .where(and(eq(fsaClassifications.groupId, grupo!.id), eq(fsaClassifications.revisao, 'pendente')));
      // O valor não muda ao liberar: ele já contava. O que sai é a trava.
      if (grupo!.status === 'bloqueado') {
        await db
          .update(fsaGroups)
          .set({ status: 'pronto', updatedAt: now })
          .where(eq(fsaGroups.id, grupo!.id));
      }
      await registrar('Reclassificação liberada', { de: 'bloqueado', para: 'pronto' });
      return Response.json({ grupo: await carregarGrupo(grupo!.id) });
    }

    if (action === 'aprovar') {
      if (grupo!.status !== 'pronto') {
        return Response.json(
          { error: 'Só é possível aprovar um repasse pronto e sem pendência.' },
          { status: 409 },
        );
      }
      // A folha não sai no dia da aprovação. Sem a data, o painel não saberia
      // em que dia contar a saída.
      if (!dataPagamento) {
        return Response.json({ error: 'Informe a data em que o repasse vai ser pago.' }, { status: 400 });
      }
      // Aprova-se o que está na tela agora, não o que foi fechado antes: se a
      // classificação mudou no meio, a fotografia é refeita.
      await db
        .update(fsaGroups)
        .set({
          status: 'aprovado',
          ...fotografia,
          dataPagamento,
          approvedBy: user!.email,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(fsaGroups.id, grupo!.id));
      await registrar('Repasse aprovado', { totalCents: grupo!.repasse.totalCents, dataPagamento });
      return Response.json({ grupo: await carregarGrupo(grupo!.id) });
    }

    // A folha pode atrasar ou adiantar. Enquanto não foi pago, a data muda sem
    // precisar desaprovar e aprovar de novo.
    if (action === 'reagendar') {
      if (grupo!.status !== 'aprovado') {
        return Response.json(
          { error: 'Só dá para mudar a data de um repasse aprovado e ainda não pago.' },
          { status: 409 },
        );
      }
      if (!dataPagamento) {
        return Response.json({ error: 'Informe a nova data de pagamento.' }, { status: 400 });
      }
      await db
        .update(fsaGroups)
        .set({ dataPagamento, updatedAt: now })
        .where(eq(fsaGroups.id, grupo!.id));
      await registrar('Data de pagamento alterada', { de: grupo!.dataPagamento, para: dataPagamento });
      return Response.json({ grupo: await carregarGrupo(grupo!.id) });
    }

    if (action === 'bloquear') {
      if (grupo!.status === 'pago') {
        return Response.json({ error: 'Este repasse já foi pago.' }, { status: 409 });
      }
      await db
        .update(fsaGroups)
        .set({ status: 'bloqueado', approvedBy: null, approvedAt: null, dataPagamento: null, updatedAt: now })
        .where(eq(fsaGroups.id, grupo!.id));
      await registrar('Repasse bloqueado', { de: grupo!.status });
      return Response.json({ grupo: await carregarGrupo(grupo!.id) });
    }

    if (action === 'pagar') {
      if (grupo!.status !== 'aprovado') {
        return Response.json({ error: 'Só é possível pagar um repasse aprovado.' }, { status: 409 });
      }
      await db
        .update(fsaGroups)
        .set({ status: 'pago', paidAt: now, updatedAt: now })
        .where(eq(fsaGroups.id, grupo!.id));
      await registrar('Repasse pago', { totalCents: grupo!.repasse.totalCents });
      return Response.json({ grupo: await carregarGrupo(grupo!.id) });
    }

    return Response.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível atualizar o repasse.' }, { status: 500 });
  }
}
