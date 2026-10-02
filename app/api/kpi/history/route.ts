import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import type { KpiRow } from '@/lib/kpi-history';

// Série diária da fila (daily_kpis) para a comparação de períodos da Visão geral.
export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const rows = (await env.DB.prepare(`SELECT day, open, pending_schedule AS pendingSchedule, scheduled, directed, awaiting_spare AS awaitingSpare, in_field AS inField, with_technician AS withTechnician
      FROM daily_kpis ORDER BY day DESC LIMIT 800`).all<KpiRow>()).results;
    return Response.json({ rows }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 });
  }
}
