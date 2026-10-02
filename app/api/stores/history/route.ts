import { desc } from 'drizzle-orm';
import { getDb } from '@/db';
import { ticketArchives } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { storeCodeKey, storeVisits } from '@/lib/store-history';

// Histórico de uma loja (código "L158"): chamados já registrados, com o que foi
// feito, quando, por quê e quanto foi lançado. Vem dos chamados arquivados.
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    const code = new URL(request.url).searchParams.get('code') ?? '';
    if (!storeCodeKey(code)) return Response.json({ error: 'Código de loja inválido.' }, { status: 400 });
    const archives = await getDb().select({
      ticketKey: ticketArchives.ticketKey, title: ticketArchives.title, jiraStatus: ticketArchives.jiraStatus, operationalStatus: ticketArchives.operationalStatus,
      storeName: ticketArchives.storeName, city: ticketArchives.city, capturedAt: ticketArchives.capturedAt, snapshot: ticketArchives.snapshot,
    }).from(ticketArchives).orderBy(desc(ticketArchives.capturedAt)).all();
    const visits = storeVisits(archives, code).slice(0, 200);
    const total = visits.reduce((sum, v) => sum + (v.total ?? 0), 0);
    return Response.json({ code, visits, total, count: visits.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar o histórico da loja.' }, { status: 500 });
  }
}
