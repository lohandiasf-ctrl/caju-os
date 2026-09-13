import { desc } from 'drizzle-orm';
import { getDb } from '@/db';
import { ticketArchives } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';

const LIMIT = 300;

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const query = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
    const archives = await getDb().select({
      ticketKey: ticketArchives.ticketKey,
      title: ticketArchives.title,
      jiraStatus: ticketArchives.jiraStatus,
      operationalStatus: ticketArchives.operationalStatus,
      storeName: ticketArchives.storeName,
      city: ticketArchives.city,
      capturedAt: ticketArchives.capturedAt,
      capturedBy: ticketArchives.capturedBy,
      captureReason: ticketArchives.captureReason,
    }).from(ticketArchives).orderBy(desc(ticketArchives.capturedAt)).limit(LIMIT).all();
    const items = query
      ? archives.filter((item) => [item.ticketKey, item.title, item.storeName, item.city, item.jiraStatus, item.operationalStatus].some((value) => value?.toLowerCase().includes(query)))
      : archives;
    return Response.json({ items, limited: archives.length === LIMIT }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar o histórico de chamados.' }, { status: 500 });
  }
}
