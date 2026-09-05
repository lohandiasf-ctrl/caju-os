import { desc } from 'drizzle-orm';
import { n1TicketAssignments, operationalAudit, operationalVisits, operationalWorkflows } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

const closed = new Set(['archived', 'resolved', 'cancelled', 'validated']);
const slaHours: Record<string, number> = { triage: 2, scheduling: 4, operational_preparation: 4, in_service: 12, technical_pending: 24, awaiting_approval: 24, awaiting_spare: 24, awaiting_payment: 24 };

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const db = getDb();
    const [workflows, assignments, visits, audit] = await Promise.all([
      db.select().from(operationalWorkflows).all(),
      db.select().from(n1TicketAssignments).all(),
      db.select().from(operationalVisits).all(),
      db.select().from(operationalAudit).orderBy(desc(operationalAudit.createdAt)).all(),
    ]);
    const now = Date.now();
    const alerts = workflows.flatMap((workflow) => {
      if (closed.has(workflow.status)) return [];
      const opened = Date.parse(workflow.updatedAt || workflow.createdAt);
      const limit = slaHours[workflow.status] ?? 24;
      const overdueMinutes = Number.isFinite(opened) ? Math.max(0, Math.floor((now - opened - limit * 3_600_000) / 60_000)) : 0;
      const dueSchedule = workflow.status === 'scheduled' && workflow.scheduledAt ? Date.parse(workflow.scheduledAt) - now : null;
      if (overdueMinutes > 0) return [{ ticketKey: workflow.ticketKey, level: overdueMinutes > 120 ? 'critical' : 'warning', message: `SLA excedido em ${workflow.status}: ${Math.ceil(overdueMinutes / 60)}h` }];
      if (dueSchedule !== null && dueSchedule >= 0 && dueSchedule <= 2 * 3_600_000) return [{ ticketKey: workflow.ticketKey, level: 'warning', message: 'Atendimento agendado nas próximas 2 horas' }];
      return [];
    }).sort((a, b) => a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1);
    const active = workflows.filter((item) => !closed.has(item.status));
    const clientCents = workflows.reduce((sum, item) => sum + (item.clientValueCents ?? 0), 0);
    const costCents = workflows.reduce((sum, item) => sum + (item.payoutCents ?? 0) + (item.partsValueCents ?? 0), 0);
    const n1ByEmail = Object.entries(assignments.reduce<Record<string, number>>((result, item) => { result[item.n1Email] = (result[item.n1Email] ?? 0) + 1; return result; }, {})).map(([email, count]) => ({ email, count }));
    return Response.json({
      alerts: alerts.slice(0, 12),
      metrics: { active: active.length, overdue: alerts.filter((item) => item.message.startsWith('SLA')).length, scheduled: active.filter((item) => item.status === 'scheduled').length, visits: visits.length, revenueCents: clientCents, costCents, marginCents: clientCents - costCents },
      n1: n1ByEmail.sort((a, b) => b.count - a.count),
      recentAudit: audit.slice(0, 12),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar painel operacional.' }, { status: 500 });
  }
}
