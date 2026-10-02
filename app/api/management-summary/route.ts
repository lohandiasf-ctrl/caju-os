import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { DEFAULT_ACCOUNT } from '@/lib/whatsapp-accounts';
import { foldCity } from '@/lib/management-summary';

// Números da Visão geral que não estão na fila do Jira: contatos novos no
// WhatsApp, técnicos e cidades novas, agendamentos por analista e as cidades que
// têm técnico cadastrado. Só gerência e coordenação.
export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador']);
    const db = env.DB;
    // Meia-noite de Brasília (UTC-3) de hoje e de 7 dias atrás.
    const brasilia = new Date(Date.now() - 3 * 3_600_000);
    const startToday = new Date(Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), brasilia.getUTCDate(), 3, 0, 0)).toISOString();
    const startWeek = new Date(new Date(startToday).getTime() - 6 * 86_400_000).toISOString();
    const one = async (sql: string, ...binds: unknown[]) => Number((await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0);
    const newContacts = (since: string) => one(`SELECT count(*) AS n FROM whatsapp_conversations c WHERE c.account = ?1 AND c.contact_phone NOT LIKE '%@g.us' AND c.created_at >= ?2
      AND EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.account = c.account AND m.contact_phone = c.contact_phone AND m.direction = 'incoming')`, DEFAULT_ACCOUNT, since);
    const [contactsToday, contactsWeek, messagesToday, techsToday, techsWeek, newCitiesWeek] = await Promise.all([
      newContacts(startToday),
      newContacts(startWeek),
      one(`SELECT count(*) AS n FROM whatsapp_messages WHERE account = ?1 AND direction = 'incoming' AND occurred_at >= ?2`, DEFAULT_ACCOUNT, startToday),
      one(`SELECT count(*) AS n FROM technicians WHERE created_at >= ?1`, startToday),
      one(`SELECT count(*) AS n FROM technicians WHERE created_at >= ?1`, startWeek),
      one(`SELECT count(*) AS n FROM (SELECT base_city, base_state, MIN(created_at) AS first FROM technicians WHERE base_city <> '' GROUP BY 1, 2) WHERE first >= ?1`, startWeek),
    ]);
    const analysts = (await db.prepare(`SELECT scheduled_by_email AS email, count(*) AS n FROM operational_workflows WHERE scheduled_by_email IS NOT NULL AND scheduled_by_email <> 'sistema' AND updated_at >= ?1
      GROUP BY 1 ORDER BY n DESC`).bind(startToday).all<{ email: string; n: number }>()).results;
    const cities = (await db.prepare(`SELECT DISTINCT base_city FROM technicians WHERE base_city <> ''`).all<{ base_city: string }>()).results;
    return Response.json({
      contactsToday, contactsWeek, messagesToday, techsToday, techsWeek, newCitiesWeek,
      citiesWithTechnician: cities.length,
      techCities: [...new Set(cities.map((c) => foldCity(c.base_city)))],
      scheduledByAnalyst: analysts.map((a) => ({ email: a.email, count: a.n })),
    }, { headers: { 'Cache-Control': 'private, max-age=120' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('management summary failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'Não foi possível montar o resumo.' }, { status: 500 });
  }
}
