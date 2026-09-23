import { desc, eq, inArray } from 'drizzle-orm';
import { fsaClassifications, fsaGroups, operationalAudit, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { carregarGrupo, carregarPassesDaFsa } from '@/lib/server/fsa-payment';
import { operationDate } from '@/lib/assistant';
import { cidadesDosChamados, erroDeCidades, nomeDoGrupo } from '@/lib/group-name';
import { cidadeEUf, erroDoNomeDoTecnico, nomeDoTecnico, tecnicoComMesmoNome } from '@/lib/repasse-tecnico';

const STATUS = ['aberto', 'pronto', 'aprovado', 'pago', 'bloqueado'] as const;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
// Um grupo é uma visita, não um lote de importação. O teto existe para um erro
// de seleção não virar um grupo de cem chamados.
const MAX_FSAS = 60;

/**
 * Lista grupos, ou as passadas de um chamado.
 *
 * `ticketKey` devolve o histórico daquele chamado em todos os grupos — é o que a
 * tela do chamado mostra para ninguém reclassificar achando que corrige o que
 * ficou para trás.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const url = new URL(request.url);

    const ticketKey = url.searchParams.get('ticketKey')?.trim().toUpperCase();
    if (ticketKey) return Response.json({ passes: await carregarPassesDaFsa(ticketKey) });

    const pedido = url.searchParams.get('status');
    const filtro = STATUS.filter((s) => (pedido ? pedido.split(',').includes(s) : true));
    if (!filtro.length) return Response.json({ grupos: [] });

    const db = getDb();
    const grupos = await db
      .select({
        id: fsaGroups.id,
        nome: fsaGroups.nome,
        technicianId: fsaGroups.technicianId,
        tecnico: technicians.name,
        dia: fsaGroups.dia,
        status: fsaGroups.status,
        servicosCents: fsaGroups.servicosCents,
        evidenciasCents: fsaGroups.evidenciasCents,
        improdutivasCents: fsaGroups.improdutivasCents,
        totalCents: fsaGroups.totalCents,
        approvedBy: fsaGroups.approvedBy,
        dataPagamento: fsaGroups.dataPagamento,
        createdBy: fsaGroups.createdBy,
        updatedAt: fsaGroups.updatedAt,
      })
      .from(fsaGroups)
      .innerJoin(technicians, eq(technicians.id, fsaGroups.technicianId))
      .where(inArray(fsaGroups.status, filtro))
      .orderBy(desc(fsaGroups.dia), desc(fsaGroups.id))
      .limit(200)
      .all();

    // Quem não é gerência vê só o que montou: a fila inteira é dinheiro de
    // terceiros.
    const visiveis =
      user.role === 'gerencia'
        ? grupos
        : grupos.filter((g) => g.createdBy.toLowerCase() === user.email.toLowerCase());
    if (!visiveis.length) return Response.json({ grupos: [] });

    // As FSAs de todos os grupos numa consulta só: uma por grupo transformaria a
    // lista numa rajada de leituras, e o D1 tem orçamento diário.
    const linhas = await db
      .select({
        groupId: fsaClassifications.groupId,
        ticketKey: fsaClassifications.ticketKey,
        tipo: fsaClassifications.tipo,
      })
      .from(fsaClassifications)
      .where(inArray(fsaClassifications.groupId, visiveis.map((g) => g.id)))
      .all();

    const porGrupo = new Map<number, { ticketKeys: string[]; semClassificar: number }>();
    for (const l of linhas) {
      const atual = porGrupo.get(l.groupId) ?? { ticketKeys: [], semClassificar: 0 };
      atual.ticketKeys.push(l.ticketKey);
      if (!l.tipo) atual.semClassificar += 1;
      porGrupo.set(l.groupId, atual);
    }

    return Response.json({
      grupos: visiveis.map((g) => ({
        ...g,
        ...(porGrupo.get(g.id) ?? { ticketKeys: [], semClassificar: 0 }),
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar os grupos.' }, { status: 500 });
  }
}

/**
 * Cria um grupo a partir dos chamados selecionados.
 *
 * O grupo é a unidade de pagamento: é ele que define a faixa de preço. Não
 * depende do atendimento preparado da operação ao vivo, e o mesmo chamado pode
 * entrar em outro grupo depois, se voltar para a fila e for atendido de novo.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Técnico da lista (id) ou só o nome digitado. Nome digitado vira
    // cadastro depois de validar os chamados, para não criar técnico à toa.
    const idInformado = Number(body.technicianId);
    const nomeInformado = typeof body.technicianName === 'string' ? nomeDoTecnico(body.technicianName) : '';
    const temId = Number.isInteger(idInformado) && idInformado > 0;
    if (!temId) {
      const erroNome = erroDoNomeDoTecnico(nomeInformado);
      if (erroNome) return Response.json({ error: nomeInformado ? erroNome : 'Escolha o técnico que vai atender.' }, { status: 400 });
    }

    const brutos = Array.isArray(body.tickets) ? body.tickets : [];
    const tickets = brutos
      .map((t) => (typeof t === 'string' ? { key: t } : (t as Record<string, unknown>)))
      .map((t) => ({
        key: typeof t.key === 'string' ? t.key.trim().toUpperCase() : '',
        summary: typeof t.summary === 'string' ? t.summary.slice(0, 300) : null,
        store: typeof t.store === 'string' ? t.store.slice(0, 200) : null,
        city: typeof t.city === 'string' ? t.city.slice(0, 120) : null,
      }))
      .filter((t) => t.key);
    const unicos = [...new Map(tickets.map((t) => [t.key, t])).values()];

    if (!unicos.length) return Response.json({ error: 'Selecione ao menos uma FSA.' }, { status: 400 });
    if (unicos.length > MAX_FSAS) {
      return Response.json(
        { error: `Um grupo aceita no máximo ${MAX_FSAS} FSAs.` },
        { status: 400 },
      );
    }

    const cidadesDiferentes = erroDeCidades(unicos);
    if (cidadesDiferentes) return Response.json({ error: cidadesDiferentes }, { status: 400 });

    // O dia define o relatório, então é o da operação e não o do Worker: depois
    // das 21h de Brasília o UTC já virou amanhã.
    const dia = typeof body.dia === 'string' && DIA.test(body.dia) ? body.dia : operationDate();
    // O nome é a cidade e o número da loja, tirados dos próprios chamados. Não
    // se aceita nome digitado: quem olha a fila reconhece o grupo pelo lugar, e
    // um apelido qualquer não diz nada a mais ninguém.
    const nome = nomeDoGrupo(unicos);

    const db = getDb();
    const now = new Date().toISOString();
    let tecnico: { id: number; name: string } | undefined;
    let tecnicoCriado = false;
    if (temId) {
      tecnico = await db
        .select({ id: technicians.id, name: technicians.name })
        .from(technicians)
        .where(eq(technicians.id, idInformado))
        .get();
      if (!tecnico) return Response.json({ error: 'Técnico não encontrado.' }, { status: 404 });
    } else {
      // Mesmo nome sem acento/maiúscula é a mesma pessoa: reaproveita o
      // cadastro para o relatório não pagar dois técnicos que são um só.
      const cadastro = await db.select({ id: technicians.id, name: technicians.name }).from(technicians).all();
      tecnico = tecnicoComMesmoNome(cadastro, nomeInformado) ?? undefined;
      if (!tecnico) {
        const { cidade, uf } = cidadeEUf(cidadesDosChamados(unicos)[0]);
        tecnico = await db
          .insert(technicians)
          .values({
            name: nomeInformado,
            baseCity: cidade,
            baseState: uf,
            approved: false,
            sourceStatus: 'Cadastro rápido pelo grupo de repasse',
            createdAt: now,
          })
          .returning({ id: technicians.id, name: technicians.name })
          .get();
        tecnicoCriado = true;
      }
    }
    const technicianId = tecnico.id;

    const grupo = await db
      .insert(fsaGroups)
      .values({
        nome,
        technicianId,
        dia,
        status: 'aberto',
        createdBy: user.email,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: fsaGroups.id })
      .get();

    await db.insert(fsaClassifications).values(
      unicos.map((t) => ({
        groupId: grupo.id,
        ticketKey: t.key,
        summary: t.summary,
        store: t.store,
        createdBy: user.email,
        createdAt: now,
        updatedBy: user.email,
        updatedAt: now,
      })),
    );

    await db.insert(operationalAudit).values(
      unicos.map((t) => ({
        ticketKey: t.key,
        action: 'Chamado agrupado',
        actorEmail: user.email,
        details: JSON.stringify({
          groupId: grupo.id,
          nome,
          technicianId,
          tecnico: tecnico.name,
          ...(tecnicoCriado ? { tecnicoCriado: true } : {}),
          dia,
          ticketKeys: unicos.map((x) => x.key),
          origin: 'sistema',
        }),
        createdAt: now,
      })),
    );

    return Response.json({ grupo: await carregarGrupo(grupo.id) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível criar o grupo.' }, { status: 500 });
  }
}
