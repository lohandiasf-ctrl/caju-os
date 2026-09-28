import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { technicians } from '@/db/schema';
import {
  ACCEPT_OFFER_SQL, dispatchModeOf, eligibleTechnicians, equipmentLine, groupByStore, holdReasons, LOOKBACK_HOURS, OFFER_HOURS,
  splitCity, storeKeyOf, whatsappPhone, type DispatchMode, type DispatchTicket, type OfferGroup,
} from '@/lib/dispatch';
import { getJiraIssue, searchJiraIssues, type JiraIssueSummary } from '@/lib/server/jira';

// Lado do servidor da distribuição (lib/dispatch.ts): acha os chamados novos,
// agrupa por loja, grava as ofertas e resolve a disputa pelo aceite.
// Envio de mensagens reais fica para a etapa com os templates aprovados; aqui,
// em dry_run, as ofertas e os destinatários são gravados como simulação.

export const dispatchMode = (): DispatchMode => dispatchModeOf((env as unknown as Record<string, string | undefined>).DISPATCH_MODE);

/** Teto de chamados detalhados por rodada (cada um é uma chamada ao Jira). */
const MAX_DETAILS = 25;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Chamado novo para oferecer: pendente de agendamento, sem técnico e aberto nas
 * últimas LOOKBACK_HOURS (na primeira ligada, a fila antiga não é disparada).
 * Direcionado, agendado e os demais ficam de fora.
 */
export function isNewForDispatch(issue: Pick<JiraIssueSummary, 'status' | 'technicianName' | 'createdAt'>, now: number) {
  const created = Date.parse(issue.createdAt);
  return norm(issue.status).includes('agendamento')
    && !issue.technicianName?.trim()
    && Number.isFinite(created) && now - created <= LOOKBACK_HOURS * 3_600_000;
}

async function loadQueue(): Promise<JiraIssueSummary[]> {
  const issues: JiraIssueSummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await searchJiraIssues({ maxResults: 100, nextPageToken: cursor });
    issues.push(...(r.issues as JiraIssueSummary[]));
    if (!r.nextPageToken || r.isLast) break;
    cursor = r.nextPageToken;
  }
  return issues;
}

async function toDispatchTicket(key: string): Promise<DispatchTicket> {
  const d = await getJiraIssue(key);
  const f = (d.operationalFields ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
  return {
    key: d.key,
    storeCode: text(f.storeCode) ?? d.store,
    storeName: text(f.storeName),
    city: d.city,
    equipment: text(f.equipmentModel) ?? text(f.equipment),
    pdv: text(f.pdvNumber),
    allegedDefect: text(f.allegedDefect),
  };
}

type Summary = { considered: number; created: number; held: number; expired: number; skipped: number; mode: DispatchMode };

/**
 * Uma rodada (cron a cada 10 min): expira o que venceu, acha os chamados novos
 * que ainda não estão em nenhuma oferta valendo e cria uma oferta por loja.
 * Idempotente: repetir a rodada não duplica oferta (índice único parcial).
 */
export async function runDispatch(now = new Date()): Promise<Summary> {
  const mode = dispatchMode();
  const summary: Summary = { considered: 0, created: 0, held: 0, expired: 0, skipped: 0, mode };
  if (mode === 'off') return summary;
  const db = env.DB;
  const iso = now.toISOString();

  // Oferta vencida libera os FSAs para uma nova oferta numa rodada futura.
  const expired = await db.prepare(`UPDATE dispatch_offers SET status = 'expired', updated_at = ?1 WHERE status = 'open' AND expires_at <= ?1 RETURNING id`).bind(iso).all<{ id: number }>();
  if (expired.results.length) {
    const ids = expired.results.map((r) => r.id);
    await db.batch([
      ...ids.map((id) => db.prepare(`UPDATE dispatch_offer_tickets SET active = 0 WHERE offer_id = ?1`).bind(id)),
      ...ids.map((id) => db.prepare(`INSERT INTO dispatch_events (offer_id, kind, created_at) VALUES (?1, 'expired', ?2)`).bind(id, iso)),
    ]);
  }
  summary.expired = expired.results.length;

  const queue = (await loadQueue()).filter((i) => isNewForDispatch(i, now.getTime()));
  summary.considered = queue.length;
  if (!queue.length) return summary;

  const taken = new Set((await db.prepare(`SELECT ticket_key FROM dispatch_offer_tickets WHERE active = 1`).all<{ ticket_key: string }>()).results.map((r) => r.ticket_key));
  const fresh = queue.filter((i) => !taken.has(i.key)).slice(0, MAX_DETAILS);
  summary.skipped = queue.length - fresh.length;
  if (!fresh.length) return summary;

  const tickets = await Promise.all(fresh.map((i) => toDispatchTicket(i.key)));
  const techs = await getDb().select({
    id: technicians.id, name: technicians.name, phone: technicians.phone, approved: technicians.approved,
    baseCity: technicians.baseCity, baseState: technicians.baseState, extraCities: technicians.extraCities,
  }).from(technicians).all();

  for (const group of groupByStore(tickets)) {
    const created = await createOffer(group, techs, mode, now);
    if (created === 'held') summary.held += 1;
    if (created) summary.created += 1;
  }
  return summary;
}

async function createOffer(group: OfferGroup, techs: Parameters<typeof eligibleTechnicians>[0], mode: DispatchMode, now: Date): Promise<'open' | 'held' | null> {
  const db = env.DB;
  const iso = now.toISOString();
  const first = group.tickets[0];
  const { city, uf } = splitCity(first.city);
  const eligible = eligibleTechnicians(techs, city, uf);
  const reasons = holdReasons(group, eligible.length);
  const status = reasons.length ? 'held' : 'open';
  const expires = new Date(now.getTime() + OFFER_HOURS * 3_600_000).toISOString();

  const offer = await db.prepare(`INSERT INTO dispatch_offers (store_key, store_name, city, status, hold_reasons, mode, expires_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING id`)
    .bind(storeKeyOf(first.storeCode) ?? group.storeKey, first.storeName, first.city, status, reasons.length ? JSON.stringify(reasons) : null, mode, expires, iso)
    .first<{ id: number }>();
  if (!offer) return null;

  try {
    // Tudo no mesmo lote (transação no D1): se um FSA já entrou em outra oferta
    // no meio do caminho, o índice único derruba o lote inteiro.
    await db.batch([
      ...group.tickets.map((t) => db.prepare(`INSERT INTO dispatch_offer_tickets (offer_id, ticket_key, active, equipment, alleged_defect) VALUES (?1, ?2, 1, ?3, ?4)`)
        // Guarda a linha já montada (equipamento + PDV): é o que o técnico lê.
        .bind(offer.id, t.key, equipmentLine(t), t.allegedDefect)),
      ...(status === 'open' ? eligible.map((tech) => db.prepare(`INSERT INTO dispatch_recipients (offer_id, technician_id, phone, status, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
        .bind(offer.id, tech.id, whatsappPhone(tech.phone), mode === 'dry_run' ? 'simulated' : 'pending', iso)) : []),
      db.prepare(`INSERT INTO dispatch_events (offer_id, kind, details, created_at) VALUES (?1, ?2, ?3, ?4)`)
        .bind(offer.id, status === 'held' ? 'held' : 'created', JSON.stringify({ tickets: group.tickets.map((t) => t.key), recipients: eligible.length, reasons }), iso),
    ]);
  } catch {
    await db.prepare(`DELETE FROM dispatch_offers WHERE id = ?1`).bind(offer.id).run();
    return null;
  }
  return status;
}

export type AcceptResult = 'won' | 'taken' | 'expired' | 'not_recipient' | 'unknown';

/**
 * O aceite. A atribuição é o UPDATE condicional (ACCEPT_OFFER_SQL): só a
 * primeira requisição muda a linha. Repetir o mesmo clique (webhook reenviado)
 * responde "won" de novo para quem já ganhou, sem gravar nada duas vezes.
 */
export async function acceptOffer(offerId: number, technicianId: number, now = new Date()): Promise<AcceptResult> {
  const db = env.DB;
  const iso = now.toISOString();
  const changed = await db.prepare(ACCEPT_OFFER_SQL).bind(technicianId, iso, offerId).run();
  if (changed.meta.changes === 1) {
    await db.batch([
      db.prepare(`UPDATE dispatch_recipients SET status = 'clicked', updated_at = ?3 WHERE offer_id = ?1 AND technician_id = ?2`).bind(offerId, technicianId, iso),
      db.prepare(`INSERT INTO dispatch_events (offer_id, technician_id, kind, created_at) VALUES (?1, ?2, 'assigned', ?3)`).bind(offerId, technicianId, iso),
    ]);
    return 'won';
  }
  const offer = await db.prepare(`SELECT status, assigned_technician_id, expires_at FROM dispatch_offers WHERE id = ?1`).bind(offerId).first<{ status: string; assigned_technician_id: number | null; expires_at: string }>();
  if (!offer) return 'unknown';
  if (offer.status === 'assigned') return offer.assigned_technician_id === technicianId ? 'won' : 'taken';
  const recipient = await db.prepare(`SELECT 1 AS ok FROM dispatch_recipients WHERE offer_id = ?1 AND technician_id = ?2`).bind(offerId, technicianId).first();
  if (!recipient) return 'not_recipient';
  await db.prepare(`INSERT INTO dispatch_events (offer_id, technician_id, kind, created_at) VALUES (?1, ?2, 'late_click', ?3)`).bind(offerId, technicianId, iso).run();
  // Aberta mas vencida, expirada, retida ou cancelada: não está mais disponível.
  return 'expired';
}
