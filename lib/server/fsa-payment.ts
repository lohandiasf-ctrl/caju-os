import { asc, eq } from 'drizzle-orm';
import { fsaClassifications, fsaGroups, technicians } from '@/db/schema';
import { getDb } from '@/db';
import { calcularRepasse, type Fsa, type Repasse } from '@/lib/fsa-payment';

export type FsaDoGrupo = {
  id: number;
  ticketKey: string;
  summary: string | null;
  store: string | null;
  tipo: 'servico' | 'evidencia' | null;
  improdutiva: boolean;
  motivo: string | null;
  observacao: string | null;
  descobertaNaLoja: boolean;
  revisao: 'ok' | 'pendente';
  updatedBy: string;
  updatedAt: string;
};

export type GrupoDeRepasse = {
  id: number;
  nome: string | null;
  technicianId: number;
  tecnico: string;
  dia: string;
  status: 'aberto' | 'pronto' | 'aprovado' | 'pago' | 'bloqueado';
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdBy: string;
  fsas: FsaDoGrupo[];
  // FSAs ainda sem classificação. Enquanto houver alguma, o valor mostrado é
  // parcial e o grupo não pode ser fechado.
  naoClassificadas: string[];
  // Alguma FSA saiu de evidência para atuação e espera a gerência. O cálculo
  // continua valendo — o que trava é o pagamento.
  aguardandoRevisao: string[];
  repasse: Repasse;
};

/**
 * Monta o grupo a partir das FSAs que estão nele agora.
 *
 * O valor nunca é lido de volta do total guardado: sai sempre das
 * classificações atuais, para que reclassificar não deixe para trás um número
 * que não fecha mais com as regras. O que está guardado no grupo é a fotografia
 * apresentada à gerência, e serve para outra coisa: provar o que foi aprovado.
 */
export async function carregarGrupo(groupId: number): Promise<GrupoDeRepasse | null> {
  const db = getDb();

  const grupo = await db
    .select({
      id: fsaGroups.id,
      nome: fsaGroups.nome,
      technicianId: fsaGroups.technicianId,
      tecnico: technicians.name,
      dia: fsaGroups.dia,
      status: fsaGroups.status,
      approvedBy: fsaGroups.approvedBy,
      approvedAt: fsaGroups.approvedAt,
      paidAt: fsaGroups.paidAt,
      createdBy: fsaGroups.createdBy,
    })
    .from(fsaGroups)
    .innerJoin(technicians, eq(technicians.id, fsaGroups.technicianId))
    .where(eq(fsaGroups.id, groupId))
    .get();
  if (!grupo) return null;

  const linhas = await db
    .select()
    .from(fsaClassifications)
    .where(eq(fsaClassifications.groupId, groupId))
    .orderBy(asc(fsaClassifications.id))
    .all();

  const fsas: FsaDoGrupo[] = linhas.map((l) => ({
    id: l.id,
    ticketKey: l.ticketKey,
    summary: l.summary,
    store: l.store,
    tipo: l.tipo,
    improdutiva: l.improdutiva,
    motivo: l.motivo,
    observacao: l.observacao,
    descobertaNaLoja: l.descobertaNaLoja,
    revisao: l.revisao,
    updatedBy: l.updatedBy,
    updatedAt: l.updatedAt,
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
    ...grupo,
    fsas,
    naoClassificadas: fsas.filter((f) => !f.tipo).map((f) => f.ticketKey),
    aguardandoRevisao: fsas.filter((f) => f.revisao === 'pendente').map((f) => f.ticketKey),
    repasse: calcularRepasse(paraCalcular),
  };
}

/**
 * Todas as passadas já registradas de um chamado, em todos os grupos.
 *
 * Um chamado volta para a fila — vira "aguardando spare", o spare chega, outro
 * técnico atende — e cada passada foi um trabalho pago à parte. A tela mostra o
 * histórico para ninguém classificar de novo achando que está corrigindo o que
 * ficou para trás.
 */
export async function carregarPassesDaFsa(ticketKey: string) {
  const db = getDb();
  return db
    .select({
      id: fsaClassifications.id,
      groupId: fsaClassifications.groupId,
      grupo: fsaGroups.nome,
      dia: fsaGroups.dia,
      status: fsaGroups.status,
      tecnico: technicians.name,
      tipo: fsaClassifications.tipo,
      improdutiva: fsaClassifications.improdutiva,
      motivo: fsaClassifications.motivo,
      updatedBy: fsaClassifications.updatedBy,
      updatedAt: fsaClassifications.updatedAt,
    })
    .from(fsaClassifications)
    .innerJoin(fsaGroups, eq(fsaGroups.id, fsaClassifications.groupId))
    .innerJoin(technicians, eq(technicians.id, fsaGroups.technicianId))
    .where(eq(fsaClassifications.ticketKey, ticketKey))
    .orderBy(asc(fsaGroups.dia))
    .all();
}

/** R$ 1.234,56 a partir de centavos, para a tela e para o relatório. */
export function formatarCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
