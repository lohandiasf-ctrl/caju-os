import { env } from 'cloudflare:workers';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { appUsers, employeeMessages, operationalAudit, operationalTasks } from '@/db/schema';

// Swept by the Worker's scheduled handler. Delegated-task follow-ups used to be
// labels computed when someone happened to open the ticket, so nobody was ever
// actually told. This runs without anyone looking.
const SYSTEM_SENDER = 'sistema@cajutech.net';
const FOLLOW_UP_MINUTES = 30;
const OPEN_STATUSES = ['open', 'accepted', 'in_progress'] as const;

function link(task: { ticketKey: string | null; title: string }) {
  return task.ticketKey ? `${task.title} (chamado ${task.ticketKey})` : task.title;
}

export async function POST(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const db = getDb();
    const now = new Date();
    const nowIso = now.toISOString();
    const tasks = await db.select().from(operationalTasks)
      .where(inArray(operationalTasks.status, [...OPEN_STATUSES])).all();

    const managers = await db.select({ email: appUsers.email }).from(appUsers)
      .where(and(eq(appUsers.role, 'gerencia'), eq(appUsers.active, true))).all();

    const messages: typeof employeeMessages.$inferInsert[] = [];
    const audits: typeof operationalAudit.$inferInsert[] = [];
    let followUps = 0;
    let escalations = 0;

    for (const task of tasks) {
      const due = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
      const check = Date.parse(task.nextCheckAt);

      // Overdue: tell every manager, once.
      if (Number.isFinite(due) && now.getTime() >= due && !task.escalatedAt) {
        for (const manager of managers) {
          messages.push({
            senderEmail: SYSTEM_SENDER, recipientEmail: manager.email,
            body: `Tarefa vencida sem conclusão: ${link(task)}. Responsável: ${task.acceptedBy || task.assignedTo || 'ninguém aceitou'}.`,
            createdAt: nowIso,
          });
        }
        if (task.ticketKey) {
          audits.push({
            ticketKey: task.ticketKey, action: 'tarefa_vencida', actorEmail: SYSTEM_SENDER,
            details: JSON.stringify({ collaborator: SYSTEM_SENDER, origin: 'sistema', reason: 'Tarefa delegada venceu sem conclusão', taskId: task.id, assignedTo: task.assignedTo, acceptedBy: task.acceptedBy }),
            createdAt: nowIso,
          });
        }
        await db.update(operationalTasks).set({ escalatedAt: nowIso, updatedAt: nowIso })
          .where(eq(operationalTasks.id, task.id));
        escalations += 1;
        continue;
      }

      // Follow-up: ask the owner how it is going, then push the next check out.
      if (Number.isFinite(check) && now.getTime() >= check) {
        const owner = task.acceptedBy || task.assignedTo;
        if (owner) {
          messages.push({
            senderEmail: SYSTEM_SENDER, recipientEmail: owner,
            body: `Como está o andamento de: ${link(task)}?`,
            createdAt: nowIso,
          });
          followUps += 1;
        }
        const next = new Date(now.getTime() + FOLLOW_UP_MINUTES * 60_000).toISOString();
        await db.update(operationalTasks).set({ nextCheckAt: next, updatedAt: nowIso })
          .where(eq(operationalTasks.id, task.id));
      }
    }

    if (messages.length) await db.insert(employeeMessages).values(messages);
    if (audits.length) await db.insert(operationalAudit).values(audits);

    return Response.json({ verificadas: tasks.length, followUps, escalations, at: nowIso });
  } catch (error) {
    return Response.json({ error: 'Falha ao varrer tarefas.', detail: String(error).slice(0, 200) }, { status: 500 });
  }
}
