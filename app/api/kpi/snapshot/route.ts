import { env } from 'cloudflare:workers';
import { searchJiraIssues } from '@/lib/server/jira';
import { kpiRowOf } from '@/lib/kpi-history';

// Chamado pela rotina agendada (scripts/worker-entry.js, a cada 10 min): grava o
// retrato do dia da fila de chamados (daily_kpis). O último valor do dia fica.
export async function POST(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('x-cron-secret') !== secret) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const issues: Array<{ status: string; technicianName?: string | null }> = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await searchJiraIssues({ maxResults: 100, nextPageToken: cursor });
      issues.push(...(r.issues as Array<{ status: string; technicianName?: string | null }>));
      if (!r.nextPageToken || r.isLast) break;
      cursor = r.nextPageToken;
    }
    // O dia é o de Brasília ("2026-10-02"), não o UTC do servidor.
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const row = kpiRowOf(day, issues);
    await env.DB.prepare(`INSERT INTO daily_kpis (day, open, pending_schedule, scheduled, directed, awaiting_spare, in_field, with_technician, captured_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(day) DO UPDATE SET open = excluded.open, pending_schedule = excluded.pending_schedule, scheduled = excluded.scheduled, directed = excluded.directed,
        awaiting_spare = excluded.awaiting_spare, in_field = excluded.in_field, with_technician = excluded.with_technician, captured_at = excluded.captured_at`)
      .bind(row.day, row.open, row.pendingSchedule, row.scheduled, row.directed, row.awaitingSpare, row.inField, row.withTechnician, new Date().toISOString()).run();
    return Response.json(row);
  } catch (error) {
    console.error('kpi snapshot failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'Não foi possível gravar o retrato do dia.' }, { status: 500 });
  }
}
