import { and, asc, inArray, isNull } from 'drizzle-orm';
import {
  activeAttendances,
  activeAttendanceTickets,
  employeePresence,
  operationalAudit,
} from '@/db/schema';
import { getDb } from '@/db';
import { normalizeFsaKeys } from '@/lib/active-attendances';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraIssue, JiraError } from '@/lib/server/jira';

const MAX_TICKETS_PER_ATTENDANCE = 20;

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const db = getDb();
    const attendances = await db
      .select()
      .from(activeAttendances)
      .where(isNull(activeAttendances.endedAt))
      .orderBy(asc(activeAttendances.startedAt))
      .all();
    const attendanceIds = attendances.map((item) => item.id);
    const tickets = attendanceIds.length
      ? await db
          .select()
          .from(activeAttendanceTickets)
          .where(inArray(activeAttendanceTickets.attendanceId, attendanceIds))
          .orderBy(asc(activeAttendanceTickets.id))
          .all()
      : [];
    const owners = [...new Set(attendances.map((item) => item.ownerEmail.toLowerCase()))];
    const presence = owners.length
      ? await db
          .select({ email: employeePresence.email, displayName: employeePresence.displayName })
          .from(employeePresence)
          .where(inArray(employeePresence.email, owners))
          .all()
      : [];
    const displayNames = new Map(
      presence.map((item) => [item.email.toLowerCase(), item.displayName]),
    );

    return Response.json({
      attendances: attendances.map((attendance) => ({
        ...attendance,
        ownerName:
          displayNames.get(attendance.ownerEmail.toLowerCase()) ??
          attendance.ownerEmail.split('@')[0],
        tickets: tickets.filter((ticket) => ticket.attendanceId === attendance.id),
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar atendimentos em andamento.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = (await request.json()) as { ticketKeys?: unknown };
    const ticketKeys = normalizeFsaKeys(body.ticketKeys);
    if (!ticketKeys.length) return invalid('Informe pelo menos uma FSA no formato FSA-12345.');
    if (ticketKeys.length > MAX_TICKETS_PER_ATTENDANCE) return invalid(`Um atendimento pode ter até ${MAX_TICKETS_PER_ATTENDANCE} FSAs.`);

    const db = getDb();
    const knownTickets = await db
      .select({ ticketKey: activeAttendanceTickets.ticketKey, attendanceId: activeAttendanceTickets.attendanceId })
      .from(activeAttendanceTickets)
      .where(inArray(activeAttendanceTickets.ticketKey, ticketKeys))
      .all();
    if (knownTickets.length) {
      const sessionIds = [...new Set(knownTickets.map((item) => item.attendanceId))];
      const activeSessions = await db
        .select({ id: activeAttendances.id, ownerEmail: activeAttendances.ownerEmail })
        .from(activeAttendances)
        .where(and(inArray(activeAttendances.id, sessionIds), isNull(activeAttendances.endedAt)))
        .all();
      const ownerBySession = new Map(activeSessions.map((item) => [item.id, item.ownerEmail]));
      const occupied = knownTickets
        .filter((item) => ownerBySession.has(item.attendanceId))
        .map((item) => `${item.ticketKey} (${ownerBySession.get(item.attendanceId)})`);
      if (occupied.length) return invalid(`FSA já está em um atendimento ativo: ${occupied.join(', ')}.`);
    }

    const verification = await verifyIssues(ticketKeys);
    if (verification.invalid.length) {
      return Response.json(
        { error: `Não foi possível iniciar. FSAs inválidas: ${verification.invalid.join(', ')}.`, invalidKeys: verification.invalid },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const attendance = await db
      .insert(activeAttendances)
      .values({ ownerEmail: user.email, startedAt: now, createdAt: now, updatedAt: now })
      .returning()
      .get();
    await db.insert(activeAttendanceTickets).values(
      verification.valid.map((issue) => ({
        attendanceId: attendance.id,
        ticketKey: issue.key,
        summary: issue.summary,
        store: issue.store,
        city: issue.city,
        createdAt: now,
      })),
    );
    await db.insert(operationalAudit).values(
      verification.valid.map((issue) => ({
        ticketKey: issue.key,
        action: 'Atendimento iniciado',
        actorEmail: user.email,
        details: JSON.stringify({ attendanceId: attendance.id, ticketKeys, startedAt: now, origin: 'sistema' }),
        createdAt: now,
      })),
    );
    return Response.json({ attendance: { ...attendance, tickets: verification.valid } }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Não foi possível iniciar o atendimento.' }, { status: 500 });
  }
}

export async function verifyIssues(ticketKeys: string[]) {
  const outcomes = await Promise.all(
    ticketKeys.map(async (key) => {
      try {
        const issue = await getJiraIssue(key);
        return { type: 'valid' as const, key, issue };
      } catch (error) {
        if (error instanceof JiraError && [400, 404].includes(error.status)) {
          return { type: 'invalid' as const, key };
        }
        throw error;
      }
    }),
  );
  return {
    valid: outcomes.flatMap((outcome) =>
      outcome.type === 'valid'
        ? [{
            key: outcome.issue.key,
            summary: outcome.issue.summary,
            store: outcome.issue.store,
            city: outcome.issue.city,
          }]
        : [],
    ),
    invalid: outcomes.flatMap((outcome) => (outcome.type === 'invalid' ? [outcome.key] : [])),
  };
}

function invalid(error: string) {
  return Response.json({ error }, { status: 400 });
}
