import { desc } from 'drizzle-orm';
import { getDb } from '@/db';
import { employeeActivity, jiraSyncJobs, operationalAudit, operationalStores, operationalTasks, operationalVisits, operationalWorkflows, requesterHistory, shipmentTracking, technicians, ticketSnapshots, voiceCallHistory } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request, ['gerencia']);
    const db = getDb();
    const [workflows, visits, stores, technicianRows, audit, syncJobs, calls, requesters, shipments, tasks, activities, snapshots] = await Promise.all([
      db.select().from(operationalWorkflows).all(), db.select().from(operationalVisits).all(), db.select().from(operationalStores).all(), db.select().from(technicians).all(),
      db.select().from(operationalAudit).orderBy(desc(operationalAudit.createdAt)).limit(10_000).all(), db.select().from(jiraSyncJobs).orderBy(desc(jiraSyncJobs.createdAt)).limit(10_000).all(), db.select().from(voiceCallHistory).orderBy(desc(voiceCallHistory.startedAt)).limit(10_000).all(),
      db.select().from(requesterHistory).orderBy(desc(requesterHistory.createdAt)).limit(10_000).all(), db.select().from(shipmentTracking).orderBy(desc(shipmentTracking.updatedAt)).limit(10_000).all(), db.select().from(operationalTasks).orderBy(desc(operationalTasks.updatedAt)).limit(10_000).all(), db.select().from(employeeActivity).orderBy(desc(employeeActivity.createdAt)).limit(10_000).all(), db.select().from(ticketSnapshots).orderBy(desc(ticketSnapshots.createdAt)).limit(10_000).all(),
    ]);
    const payload = { exportedAt: new Date().toISOString(), exportedBy: user.email, version: 2, data: { workflows, visits, stores, technicians: technicianRows, audit, syncJobs, calls, requesters, shipments, tasks, activities, snapshots } };
    return new Response(JSON.stringify(payload, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="caju-os-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'no-store' } });
  } catch (error) { if (error instanceof Response) return error; return Response.json({ error: 'Não foi possível gerar o backup.' }, { status: 500 }); }
}
