import { asc, eq } from 'drizzle-orm';
import { n1TicketAssignments, operationalAudit, ticketEvidence } from '@/db/schema';
import { getDb } from '@/db';
import { requireApiUser } from '@/lib/server/firebase-auth';

const validKinds = new Set(['photo', 'video', 'rat']);

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    await requireApiUser(request);
    const ticketKey = safeKey((await context.params).key);
    if (!ticketKey) return bad('Chamado inválido.');
    const db = getDb();
    const [assignment, evidence] = await Promise.all([
      db.select().from(n1TicketAssignments).where(eq(n1TicketAssignments.ticketKey, ticketKey)).get(),
      db.select({ id: ticketEvidence.id, kind: ticketEvidence.kind, name: ticketEvidence.name, mimeType: ticketEvidence.mimeType, data: ticketEvidence.data, createdAt: ticketEvidence.createdAt, uploadedBy: ticketEvidence.uploadedBy }).from(ticketEvidence).where(eq(ticketEvidence.ticketKey, ticketKey)).orderBy(asc(ticketEvidence.createdAt)).all(),
    ]);
    return Response.json({ assignment: assignment ?? null, evidence });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar atendimento N1.' }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireApiUser(request, ['n1']);
    const ticketKey = safeKey((await context.params).key);
    if (!ticketKey) return bad('Chamado inválido.');
    const body = await request.json() as { action?: unknown; evidence?: unknown };
    const action = body.action;
    const db = getDb();
    const now = new Date().toISOString();
    const current = await db.select().from(n1TicketAssignments).where(eq(n1TicketAssignments.ticketKey, ticketKey)).get();
    if (action === 'claim') {
      if (current && current.n1Email.toLowerCase() !== user.email.toLowerCase()) return Response.json({ error: `Chamado já assumido por ${current.n1Email}.` }, { status: 409 });
      await db.insert(n1TicketAssignments).values({ ticketKey, n1Email: user.email, status: 'claimed', claimedAt: now, updatedAt: now }).onConflictDoUpdate({ target: n1TicketAssignments.ticketKey, set: { n1Email: user.email, status: 'claimed', updatedAt: now } });
      await db.insert(operationalAudit).values({ ticketKey, action: 'Chamado assumido por N1', actorEmail: user.email, details: null, createdAt: now });
    } else if (action === 'validate') {
      if (!current || current.n1Email.toLowerCase() !== user.email.toLowerCase()) return Response.json({ error: 'Assuma chamado antes de validar.' }, { status: 403 });
      const attachments = parseEvidence(body.evidence);
      if (attachments.length) {
        await db.insert(ticketEvidence).values(attachments.map((item) => ({ ticketKey, ...item, uploadedBy: user.email, createdAt: now })));
        await db.insert(operationalAudit).values({ ticketKey, action: `${attachments.length} evidência(s) anexada(s)`, actorEmail: user.email, details: JSON.stringify(attachments.map((item) => ({ kind: item.kind, name: item.name }))), createdAt: now });
      }
      const evidence = await db.select({ kind: ticketEvidence.kind }).from(ticketEvidence).where(eq(ticketEvidence.ticketKey, ticketKey)).all();
      const kinds = new Set(evidence.map((item) => item.kind));
      if ((!kinds.has('photo') && !kinds.has('video')) || !kinds.has('rat')) return Response.json({ error: 'Anexe ao menos uma foto ou vídeo de evidência e o RAT antes de validar.' }, { status: 400 });
      await db.update(n1TicketAssignments).set({ status: 'validated', validatedAt: now, updatedAt: now }).where(eq(n1TicketAssignments.ticketKey, ticketKey));
      await db.insert(operationalAudit).values({ ticketKey, action: 'Chamado validado com evidências e RAT', actorEmail: user.email, details: null, createdAt: now });
    } else return bad('Ação inválida.');
    const [assignment, evidence] = await Promise.all([
      db.select().from(n1TicketAssignments).where(eq(n1TicketAssignments.ticketKey, ticketKey)).get(),
      db.select({ id: ticketEvidence.id, kind: ticketEvidence.kind, name: ticketEvidence.name, mimeType: ticketEvidence.mimeType, data: ticketEvidence.data, createdAt: ticketEvidence.createdAt, uploadedBy: ticketEvidence.uploadedBy }).from(ticketEvidence).where(eq(ticketEvidence.ticketKey, ticketKey)).orderBy(asc(ticketEvidence.createdAt)).all(),
    ]);
    return Response.json({ assignment, evidence });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível atualizar atendimento N1.' }, { status: 500 });
  }
}

function parseEvidence(value: unknown) {
  if (!Array.isArray(value) || value.length > 6) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const kind = record.kind;
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 180) : '';
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType.slice(0, 100) : '';
    const data = typeof record.data === 'string' ? record.data : '';
    if (!validKinds.has(String(kind)) || !name || !mimeType || !data.startsWith('data:') || data.length > 1_800_000) return [];
    if (kind === 'photo' && !mimeType.startsWith('image/')) return [];
    if (kind === 'video' && !mimeType.startsWith('video/')) return [];
    if (kind === 'rat' && !(mimeType === 'application/pdf' || mimeType.startsWith('image/'))) return [];
    return [{ kind: kind as 'photo' | 'video' | 'rat', name, mimeType, data }];
  });
}
function safeKey(value: unknown) { return typeof value === 'string' && /^[A-Z][A-Z0-9]+-\d+$/i.test(value) ? value.toUpperCase() : null; }
function bad(error: string) { return Response.json({ error }, { status: 400 }); }
