import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db';
import { assistantActions } from '@/db/schema';
import {
  canConfirm, describeAction, isMissingTable, parseAction, type AssistantAction,
} from '@/lib/assistant-actions';
import { addJiraInternalComment, transitionJiraIssue, updateJiraIssue } from '@/lib/server/jira';

// A tabela é criada por migration (0034), que roda separado do deploy. Enquanto
// não rodar, a escrita assistida precisa dizer isso em vez de estourar um 500 —
// assim o deploy e a migration deixam de depender de ordem.
export class MigrationPendingError extends Error {
  constructor() { super('A escrita assistida ainda não foi liberada: falta rodar a migration do banco.'); }
}

// Guarda a proposta e devolve o id. A linha nasce aqui, na proposta, para que
// uma sugestão recusada também apareça na auditoria.
export async function recordProposal(action: AssistantAction, proposedTo: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await getDb().insert(assistantActions).values({
      id,
      ticketKey: action.ticketKey,
      kind: action.kind,
      payload: JSON.stringify(action),
      description: describeAction(action),
      status: 'pending',
      proposedTo,
      createdAt: now,
    });
  } catch (error) {
    if (isMissingTable(error)) throw new MigrationPendingError();
    throw error;
  }
  return { id, description: describeAction(action), createdAt: now };
}

export async function loadProposal(id: string) {
  return getDb().select().from(assistantActions).where(eq(assistantActions.id, id)).get();
}

// Aplica a ação no Jira. O payload é relido do banco: o cliente manda só o id,
// então não há como confirmar uma coisa e executar outra.
export async function confirmProposal(id: string, confirmedBy: string) {
  const row = await loadProposal(id);
  if (!row) throw new Error('Sugestão não encontrada.');
  const allowed = canConfirm(row.status, row.createdAt);
  if (!allowed.ok) throw new Error(allowed.reason ?? 'Esta ação não pode ser confirmada.');

  // Revalida o payload gravado antes de escrever: a lista fechada de ações
  // vale na confirmação, não só na proposta.
  const action = parseAction(JSON.parse(row.payload), row.ticketKey);
  const resolvedAt = new Date().toISOString();
  try {
    await applyAction(action, confirmedBy);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao aplicar no Jira.';
    await getDb().update(assistantActions)
      .set({ status: 'failed', confirmedBy, error: message, resolvedAt })
      .where(eq(assistantActions.id, id));
    throw error;
  }
  await getDb().update(assistantActions)
    .set({ status: 'applied', confirmedBy, resolvedAt })
    .where(eq(assistantActions.id, id));
  return { description: row.description };
}

export async function cancelProposal(id: string, email: string) {
  const row = await loadProposal(id);
  if (!row || row.status !== 'pending') return false;
  await getDb().update(assistantActions)
    .set({ status: 'cancelled', confirmedBy: email, resolvedAt: new Date().toISOString() })
    .where(eq(assistantActions.id, id));
  return true;
}

async function applyAction(action: AssistantAction, author: string) {
  if (action.kind === 'comment') return addJiraInternalComment(action.ticketKey, action.body, author);
  if (action.kind === 'transition') {
    await transitionJiraIssue(action.ticketKey, action.status);
    return;
  }
  await updateJiraIssue(action.ticketKey, { scheduledDateTime: toJiraDateTime(action.scheduledDateTime) });
}

// Mesmo formato usado no lote de chamados: Jira quer offset explícito.
function toJiraDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00.000-0300` : value;
}

export async function listAudit(options: { days?: number; ticketKey?: string; limit?: number } = {}) {
  try {
    return await queryAudit(options);
  } catch (error) {
    if (isMissingTable(error)) throw new MigrationPendingError();
    throw error;
  }
}

async function queryAudit(options: { days?: number; ticketKey?: string; limit?: number }) {
  const since = new Date(Date.now() - (options.days ?? 30) * 86_400_000).toISOString();
  const filters = [gte(assistantActions.createdAt, since)];
  if (options.ticketKey) filters.push(eq(assistantActions.ticketKey, options.ticketKey));
  return getDb().select().from(assistantActions)
    .where(and(...filters))
    .orderBy(desc(assistantActions.createdAt))
    .limit(Math.min(options.limit ?? 200, 500))
    .all();
}
