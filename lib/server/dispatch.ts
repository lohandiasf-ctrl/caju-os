import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { and, eq, inArray } from 'drizzle-orm';
import { appUsers, chatGroupMembers, chatGroupMessages, chatGroups, technicians } from '@/db/schema';
import {
  ACCEPT_OFFER_SQL, ACCEPT_REPLY_EXPIRED, ACCEPT_REPLY_TAKEN, ACCEPT_REPLY_WON, acceptedNotice, acceptPayloadOffer, allowedToReceive,
  DECLINE_REPLY, DECLINE_REPLY_ALREADY_WON, declinePayloadOffer, dispatchModeOf, eligibleTechnicians, equipmentLine, groupByStore, holdReasons, isTestOffer, LOOKBACK_HOURS, OFFER_HOURS, offerMessage,
  parseAllowlist, samePhone, splitCity, storeKeyOf, technicianDataBlock, templateSendPayload, TEST_MODE, testNotice, testOfferTicket,
  unansweredNotice, whatsappPhone,
  ACTIVE_OFFER_VERSION, HOLD_LABEL, pickOfferVersion, type HoldReason, type DispatchMode, type DispatchTicket, type OfferGroup, type OfferVersionKey,
} from '@/lib/dispatch';
import { getJiraIssue, searchJiraIssues, type JiraIssueSummary } from '@/lib/server/jira';
import { enqueueJiraSync, processJiraSyncJobs } from '@/lib/server/jira-sync';
import { sendPushToEmails } from '@/lib/server/push';
import { listTemplateStatuses, sendTemplateMessage, sendTextMessage } from '@/lib/server/whatsapp-cloud';

// Lado do servidor da distribuição (lib/dispatch.ts): acha os chamados novos,
// agrupa por loja, grava as ofertas e resolve a disputa pelo aceite.
// Em dry_run as ofertas e os destinatários são só gravados; em allowlist a
// oferta sai para os números de DISPATCH_ALLOWLIST; em live, para todos.

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

/**
 * Técnicos que nunca recebem oferta (pedido da gerência): ids em
 * DISPATCH_BLOCKLIST, separados por vírgula. Vale para a rodada e o reenvio.
 */
function notBlocked(t: { id: number }) {
  const raw = (env as unknown as Record<string, string | undefined>).DISPATCH_BLOCKLIST ?? '';
  return !raw.split(/[,;\s]+/).map(Number).filter(Number.isInteger).includes(t.id);
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
  const expired = await db.prepare(`UPDATE dispatch_offers SET status = 'expired', updated_at = ?1 WHERE status = 'open' AND expires_at <= ?1 RETURNING id, mode, store_key`).bind(iso).all<{ id: number; mode: string; store_key: string }>();
  if (expired.results.length) {
    const ids = expired.results.map((r) => r.id);
    const keysByOffer = await offerTicketKeys(ids);
    await db.batch([
      ...ids.map((id) => db.prepare(`UPDATE dispatch_offer_tickets SET active = 0 WHERE offer_id = ?1`).bind(id)),
      ...ids.map((id) => db.prepare(`INSERT INTO dispatch_events (offer_id, kind, created_at) VALUES (?1, 'expired', ?2)`).bind(id, iso)),
    ]);
    // Simulação não avisa ninguém: a oferta nem saiu.
    for (const offer of expired.results.filter((o) => o.mode !== 'dry_run' && !isTestOffer(o.mode))) {
      await notifyTeam(unansweredNotice(keysByOffer.get(offer.id) ?? [], offer.store_key), offer.id);
    }
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
  const techs = (await getDb().select({
    id: technicians.id, name: technicians.name, phone: technicians.phone, approved: technicians.approved,
    baseCity: technicians.baseCity, baseState: technicians.baseState, extraCities: technicians.extraCities,
  }).from(technicians).all()).filter(notBlocked);

  const allowlist = parseAllowlist((env as unknown as Record<string, string | undefined>).DISPATCH_ALLOWLIST);
  for (const group of groupByStore(tickets)) {
    const created = await createOffer(group, techs, mode, now);
    if (!created) continue;
    summary.created += 1;
    if (created.status === 'held') summary.held += 1;
    else if (mode !== 'dry_run') await sendOffer(created.id, group.tickets, mode, allowlist);
  }
  return summary;
}

async function offerTicketKeys(ids: number[]) {
  const byOffer = new Map<number, string[]>();
  if (!ids.length) return byOffer;
  const rows = (await env.DB.prepare(`SELECT offer_id, ticket_key FROM dispatch_offer_tickets WHERE offer_id IN (${ids.map(() => '?').join(',')}) ORDER BY ticket_key`).bind(...ids).all<{ offer_id: number; ticket_key: string }>()).results;
  for (const r of rows) byOffer.set(r.offer_id, [...(byOffer.get(r.offer_id) ?? []), r.ticket_key]);
  return byOffer;
}

/**
 * Manda a oferta (template aprovado) para cada destinatário. Um envio que
 * falha não impede os outros; fica marcado como "failed" no painel.
 */
async function sendOffer(offerId: number, tickets: DispatchTicket[], mode: DispatchMode, allowlist: string[]) {
  const db = env.DB;
  const recipients = (await db.prepare(`SELECT technician_id, phone FROM dispatch_recipients WHERE offer_id = ?1`).bind(offerId).all<{ technician_id: number; phone: string }>()).results;
  const message = offerMessage(offerId, tickets, await offerVersionInUse());
  for (const r of recipients) {
    const at = new Date().toISOString();
    if (!allowedToReceive(mode, allowlist, r.phone)) {
      await db.prepare(`UPDATE dispatch_recipients SET status = 'skipped', updated_at = ?3 WHERE offer_id = ?1 AND technician_id = ?2`).bind(offerId, r.technician_id, at).run();
      continue;
    }
    try {
      const wamid = await sendTemplateMessage(templateSendPayload(r.phone, message));
      await db.prepare(`UPDATE dispatch_recipients SET status = 'sent', wamid = ?3, updated_at = ?4 WHERE offer_id = ?1 AND technician_id = ?2`).bind(offerId, r.technician_id, wamid, at).run();
    } catch (error) {
      await db.batch([
        db.prepare(`UPDATE dispatch_recipients SET status = 'failed', updated_at = ?3 WHERE offer_id = ?1 AND technician_id = ?2`).bind(offerId, r.technician_id, at),
        db.prepare(`INSERT INTO dispatch_events (offer_id, technician_id, kind, details, created_at) VALUES (?1, ?2, 'send_failed', ?3, ?4)`)
          .bind(offerId, r.technician_id, JSON.stringify({ error: error instanceof Error ? error.message.slice(0, 300) : 'erro' }), at),
      ]);
    }
  }
}

let versionCache: { at: number; version: OfferVersionKey } | null = null;
/**
 * Versão do modelo da oferta que sai agora: a preferida assim que a Meta a
 * aprovar como Utilidade, senão a reserva (lib/dispatch.ts). Consulta a Meta
 * no máximo a cada 10 min; se a consulta falhar, fica com a última escolha.
 */
export async function offerVersionInUse(): Promise<OfferVersionKey> {
  if (versionCache && Date.now() - versionCache.at < 600_000) return versionCache.version;
  try {
    const version = pickOfferVersion(await listTemplateStatuses());
    versionCache = { at: Date.now(), version };
    return version;
  } catch {
    return versionCache?.version ?? ACTIVE_OFFER_VERSION;
  }
}

/** Status de entrega que a Meta devolve pelo webhook (delivered, read, failed). */
export async function recordDeliveryStatus(wamid: string, status: string, error?: string) {
  if (!['delivered', 'read', 'failed'].includes(status)) return;
  if (status === 'failed') {
    await env.DB.prepare(`INSERT INTO dispatch_events (offer_id, technician_id, kind, details, created_at)
      SELECT offer_id, technician_id, 'delivery_failed', ?2, ?3 FROM dispatch_recipients WHERE wamid = ?1`)
      .bind(wamid, JSON.stringify({ error: error ?? 'sem motivo' }), new Date().toISOString()).run();
  }
  await env.DB.prepare(`UPDATE dispatch_recipients SET status = ?2, updated_at = ?3 WHERE wamid = ?1 AND status NOT IN ('clicked', 'declined')`).bind(wamid, status, new Date().toISOString()).run();
}

// ─── Avisos para a equipe ──────────────────────────────
const DISPATCH_GROUP_NAME = 'Distribuição';
/** Remetente das mensagens automáticas no chat do Caju OS. */
const SYSTEM_SENDER = 'distribuicao@caju-os';

async function teamEmails() {
  const users = await getDb().select({ email: appUsers.email }).from(appUsers)
    .where(and(eq(appUsers.active, true), inArray(appUsers.role, ['gerencia', 'coordenador', 'analista']))).all();
  return users.map((u) => u.email.toLowerCase());
}

/**
 * Grupo "Distribuição" do chat do Caju OS, com gerência, coordenação e
 * analistas; quem entrou nesses perfis depois é incluído no próximo aviso.
 */
async function dispatchChatGroup(emails: string[]) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = await db.select({ id: chatGroups.id }).from(chatGroups).where(eq(chatGroups.name, DISPATCH_GROUP_NAME)).get();
  if (existing) {
    if (emails.length) {
      await db.insert(chatGroupMembers).values(emails.map((email) => ({ groupId: existing.id, email, memberRole: 'member' as const, joinedAt: now }))).onConflictDoNothing();
    }
    return existing.id;
  }
  const created = await db.insert(chatGroups).values({ name: DISPATCH_GROUP_NAME, createdBy: SYSTEM_SENDER, createdAt: now, updatedAt: now }).returning({ id: chatGroups.id }).get();
  if (emails.length) {
    await db.insert(chatGroupMembers).values(emails.map((email, i) => ({ groupId: created.id, email, memberRole: i === 0 ? 'owner' as const : 'member' as const, joinedAt: now }))).onConflictDoNothing();
  }
  return created.id;
}

/**
 * Aviso interno: push no app (tipo "Distribuição", que cada um pode desligar)
 * e mensagem no grupo "Distribuição" do chat. Nunca lança: o aceite já está
 * gravado, e o aviso é um extra.
 */
async function notifyTeam(notice: { title: string; body: string; chat: string }, offerId: number) {
  try {
    const emails = await teamEmails();
    const groupId = await dispatchChatGroup(emails);
    const now = new Date().toISOString();
    await getDb().insert(chatGroupMessages).values({ groupId, senderEmail: SYSTEM_SENDER, body: notice.chat, createdAt: now });
    await getDb().update(chatGroups).set({ updatedAt: now }).where(eq(chatGroups.id, groupId));
    await sendPushToEmails(emails, { title: notice.title, body: notice.body, data: { kind: 'group', groupId: String(groupId), offerId: String(offerId) } }, 'dispatch');
  } catch (error) {
    console.error('dispatch: aviso à equipe falhou', error instanceof Error ? error.message : 'erro');
  }
}

// ─── Clique em "Aceitar atendimento" ───────────────────
/**
 * Clique no botão do template, vindo do webhook. Identifica o técnico pelo
 * número que clicou (nunca por um id enviado pelo cliente), resolve a disputa
 * e devolve a resposta para mandar a ele. No aceite: vínculo no Caju OS, Jira
 * pela fila de sincronização (sem reabrir a disputa se o Jira falhar) e aviso
 * à equipe.
 */
export async function handleOfferClick(payload: string | null, fromPhone: string): Promise<string | null> {
  const declined = declinePayloadOffer(payload);
  if (declined) return handleDecline(declined, fromPhone);
  const offerId = acceptPayloadOffer(payload);
  if (!offerId) return null;
  const db = env.DB;
  const recipients = (await db.prepare(`SELECT r.technician_id, r.phone, t.name, t.cpf FROM dispatch_recipients r JOIN technicians t ON t.id = r.technician_id WHERE r.offer_id = ?1`)
    .bind(offerId).all<{ technician_id: number; phone: string; name: string; cpf: string | null }>()).results;
  const me = recipients.find((r) => samePhone(r.phone, fromPhone));
  if (!me) return 'Não encontramos esta oferta para o seu número. Fale com a coordenação da Caju Tech.';

  const result = await acceptOffer(offerId, me.technician_id);
  if (result !== 'won') return result === 'taken' ? ACCEPT_REPLY_TAKEN : ACCEPT_REPLY_EXPIRED;

  const offer = await db.prepare(`SELECT store_key, mode FROM dispatch_offers WHERE id = ?1`).bind(offerId).first<{ store_key: string; mode: string }>();
  const keys = (await offerTicketKeys([offerId])).get(offerId) ?? [];
  // Reenvio do mesmo clique: já ganhou antes, não repete vínculo nem aviso.
  const already = await db.prepare(`SELECT 1 AS ok FROM dispatch_events WHERE offer_id = ?1 AND kind = 'linked'`).bind(offerId).first();
  if (!already && isTestOffer(offer?.mode)) {
    // Teste: o chamado é fictício. Só marca o aceite e avisa a equipe.
    await db.prepare(`INSERT INTO dispatch_events (offer_id, technician_id, kind, created_at) VALUES (?1, ?2, 'linked', ?3)`).bind(offerId, me.technician_id, new Date().toISOString()).run();
    await notifyTeam(testNotice(acceptedNotice(keys, offer?.store_key ?? '', me.name)), offerId);
  } else if (!already) {
    const now = new Date().toISOString();
    await db.batch([
      ...keys.map((key) => db.prepare(`INSERT INTO operational_workflows (ticket_key, status, technician_id, created_by, created_at, updated_at)
        VALUES (?1, 'scheduling', ?2, ?3, ?4, ?4)
        ON CONFLICT(ticket_key) DO UPDATE SET technician_id = excluded.technician_id, updated_at = excluded.updated_at`).bind(key, me.technician_id, SYSTEM_SENDER, now)),
      db.prepare(`INSERT INTO dispatch_events (offer_id, technician_id, kind, created_at) VALUES (?1, ?2, 'linked', ?3)`).bind(offerId, me.technician_id, now),
    ]);
    for (const key of keys) {
      await enqueueJiraSync(key, 'update', { technicianData: technicianDataBlock(me.name, me.cpf) }, SYSTEM_SENDER, `dispatch:${offerId}:${key}`).catch(() => undefined);
    }
    await processJiraSyncJobs(Math.max(1, keys.length)).catch(() => []);
    await notifyTeam(acceptedNotice(keys, offer?.store_key ?? '', me.name), offerId);
  }
  return ACCEPT_REPLY_WON;
}

/**
 * "Recusar": só registra no painel e agradece. A oferta continua aberta para
 * os outros técnicos; quem recusou continua recebendo as próximas.
 */
async function handleDecline(offerId: number, fromPhone: string): Promise<string> {
  const db = env.DB;
  const recipients = (await db.prepare(`SELECT technician_id, phone FROM dispatch_recipients WHERE offer_id = ?1`).bind(offerId).all<{ technician_id: number; phone: string }>()).results;
  const me = recipients.find((r) => samePhone(r.phone, fromPhone));
  if (!me) return 'Não encontramos esta oferta para o seu número. Fale com a coordenação da Caju Tech.';
  const offer = await db.prepare(`SELECT assigned_technician_id FROM dispatch_offers WHERE id = ?1`).bind(offerId).first<{ assigned_technician_id: number | null }>();
  if (offer?.assigned_technician_id === me.technician_id) return DECLINE_REPLY_ALREADY_WON;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE dispatch_recipients SET status = 'declined', updated_at = ?3 WHERE offer_id = ?1 AND technician_id = ?2`).bind(offerId, me.technician_id, now),
    db.prepare(`INSERT INTO dispatch_events (offer_id, technician_id, kind, created_at) VALUES (?1, ?2, 'declined', ?3)`).bind(offerId, me.technician_id, now),
  ]);
  return DECLINE_REPLY;
}

/**
 * Oferta de teste (botão no painel, gerência): loja e chamado fictícios,
 * enviada só aos técnicos cujo telefone está em DISPATCH_ALLOWLIST, com o
 * template aprovado de verdade. Serve para conferir o caminho inteiro sem
 * esperar um chamado novo.
 */
export async function sendTestOffer(now = new Date()): Promise<{ id: number; sent: number; failed: number; reason?: string } | { error: string }> {
  const allowlist = parseAllowlist((env as unknown as Record<string, string | undefined>).DISPATCH_ALLOWLIST);
  if (!allowlist.length) return { error: 'Cadastre ao menos um número em DISPATCH_ALLOWLIST para enviar o teste.' };
  const techs = (await getDb().select({ id: technicians.id, phone: technicians.phone, baseCity: technicians.baseCity, baseState: technicians.baseState })
    .from(technicians).all()).filter((t) => allowlist.some((p) => samePhone(p, t.phone)));
  // O mesmo número pode estar em mais de um cadastro: a mensagem sai uma vez só.
  const byPhone = new Map(techs.map((t) => [whatsappPhone(t.phone), t]));
  byPhone.delete(null);
  if (!byPhone.size) return { error: 'Nenhum técnico cadastrado com os números da lista de teste.' };

  const db = env.DB;
  const iso = now.toISOString();
  const first = [...byPhone.values()][0];
  const city = `${first.baseCity}/${first.baseState}`;
  const expires = new Date(now.getTime() + OFFER_HOURS * 3_600_000).toISOString();
  const offer = await db.prepare(`INSERT INTO dispatch_offers (store_key, store_name, city, status, mode, expires_at, created_at, updated_at)
    VALUES ('L999', 'Loja de teste', ?1, 'open', ?2, ?3, ?4, ?4) RETURNING id`).bind(city, TEST_MODE, expires, iso).first<{ id: number }>();
  if (!offer) return { error: 'Não foi possível criar a oferta de teste.' };
  const ticket = testOfferTicket(offer.id, city);
  await db.batch([
    db.prepare(`INSERT INTO dispatch_offer_tickets (offer_id, ticket_key, active, equipment, alleged_defect) VALUES (?1, ?2, 1, ?3, ?4)`)
      .bind(offer.id, ticket.key, equipmentLine(ticket), ticket.allegedDefect),
    ...[...byPhone].map(([phone, t]) => db.prepare(`INSERT INTO dispatch_recipients (offer_id, technician_id, phone, status, updated_at) VALUES (?1, ?2, ?3, 'pending', ?4)`)
      .bind(offer.id, t.id, phone, iso)),
    db.prepare(`INSERT INTO dispatch_events (offer_id, kind, details, created_at) VALUES (?1, 'created', ?2, ?3)`)
      .bind(offer.id, JSON.stringify({ test: true, tickets: [ticket.key], recipients: byPhone.size }), iso),
  ]);
  await sendOffer(offer.id, [ticket], 'allowlist', allowlist);
  return { id: offer.id, ...await sendSummary(offer.id) };
}

/** Quantos envios saíram e, se algum falhou, o motivo que a Meta deu. */
async function sendSummary(offerId: number) {
  const db = env.DB;
  const statuses = (await db.prepare(`SELECT status FROM dispatch_recipients WHERE offer_id = ?1`).bind(offerId).all<{ status: string }>()).results;
  const failure = await db.prepare(`SELECT details FROM dispatch_events WHERE offer_id = ?1 AND kind = 'send_failed' ORDER BY id DESC LIMIT 1`).bind(offerId).first<{ details: string }>();
  return {
    sent: statuses.filter((s) => s.status === 'sent').length, failed: statuses.filter((s) => s.status === 'failed').length,
    reason: failure ? (JSON.parse(failure.details) as { error?: string }).error : undefined,
  };
}

export type ResendResult = { id: number; status: 'open' | 'held'; sent: number; failed: number; reason?: string } | { error: string };

/**
 * Botão "Reenviar" do painel: cancela a oferta (se ainda não foi aceita) e cria
 * outra para os mesmos chamados, com os dados de agora do Jira, os técnicos de
 * agora e um prazo novo. O cancelamento é condicional: se alguém aceitou no
 * meio do caminho, o aceite vale e nada é reenviado.
 */
export async function resendOffer(offerId: number, by: string, now = new Date()): Promise<ResendResult> {
  const db = env.DB;
  const offer = await db.prepare(`SELECT mode, status FROM dispatch_offers WHERE id = ?1`).bind(offerId).first<{ mode: string; status: string }>();
  if (!offer) return { error: 'Oferta não encontrada.' };
  if (offer.status === 'assigned') return { error: 'Esta oferta já foi aceita. Não dá para reenviar.' };
  const mode = dispatchMode();
  if (!isTestOffer(offer.mode) && mode === 'off') return { error: 'A distribuição está desligada.' };

  const iso = now.toISOString();
  const cancelled = await db.prepare(`UPDATE dispatch_offers SET status = 'cancelled', updated_at = ?2 WHERE id = ?1 AND status <> 'assigned'`).bind(offerId, iso).run();
  if (cancelled.meta.changes !== 1) return { error: 'Esta oferta acabou de ser aceita. Não dá para reenviar.' };
  await db.batch([
    db.prepare(`UPDATE dispatch_offer_tickets SET active = 0 WHERE offer_id = ?1`).bind(offerId),
    db.prepare(`INSERT INTO dispatch_events (offer_id, kind, details, created_at) VALUES (?1, 'resent', ?2, ?3)`).bind(offerId, JSON.stringify({ by }), iso),
  ]);

  if (isTestOffer(offer.mode)) {
    const test = await sendTestOffer(now);
    return 'error' in test ? test : { ...test, status: 'open' };
  }
  const keys = (await offerTicketKeys([offerId])).get(offerId) ?? [];
  if (!keys.length) return { error: 'A oferta não tem chamados.' };
  const tickets = await Promise.all(keys.map((key) => toDispatchTicket(key)));
  const techs = (await getDb().select({
    id: technicians.id, name: technicians.name, phone: technicians.phone, approved: technicians.approved,
    baseCity: technicians.baseCity, baseState: technicians.baseState, extraCities: technicians.extraCities,
  }).from(technicians).all()).filter(notBlocked);
  const created = await createOffer({ storeKey: storeKeyOf(tickets[0].storeCode) ?? `sem-loja:${tickets[0].key}`, tickets }, techs, mode, now);
  if (!created) return { error: 'Não foi possível criar a nova oferta.' };
  if (created.status === 'open' && mode !== 'dry_run') {
    await sendOffer(created.id, tickets, mode, parseAllowlist((env as unknown as Record<string, string | undefined>).DISPATCH_ALLOWLIST));
  }
  return { id: created.id, status: created.status, ...await sendSummary(created.id) };
}

export type TicketOfferInfo = {
  offerId: number; status: string; mode: string; createdAt: string; expiresAt: string; assignedTo: string | null;
  holdReasons: string[]; counts: Record<string, number>; total: number;
} | null;

/** A oferta mais recente de um chamado e o que aconteceu com cada envio (tela do chamado). */
export async function ticketOffer(key: string): Promise<TicketOfferInfo> {
  const db = env.DB;
  const o = await db.prepare(`SELECT o.id, o.status, o.mode, o.created_at, o.expires_at, o.hold_reasons, t2.name AS assigned
    FROM dispatch_offer_tickets t JOIN dispatch_offers o ON o.id = t.offer_id LEFT JOIN technicians t2 ON t2.id = o.assigned_technician_id
    WHERE t.ticket_key = ?1 AND o.mode <> 'test' ORDER BY o.id DESC LIMIT 1`).bind(key)
    .first<{ id: number; status: string; mode: string; created_at: string; expires_at: string; hold_reasons: string | null; assigned: string | null }>();
  if (!o) return null;
  const rows = (await db.prepare(`SELECT status, count(*) AS n FROM dispatch_recipients WHERE offer_id = ?1 GROUP BY status`).bind(o.id).all<{ status: string; n: number }>()).results;
  const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return {
    offerId: o.id, status: o.status, mode: o.mode, createdAt: o.created_at, expiresAt: o.expires_at, assignedTo: o.assigned,
    holdReasons: (o.hold_reasons ? JSON.parse(o.hold_reasons) as HoldReason[] : []).map((r) => HOLD_LABEL[r] ?? r),
    counts, total: rows.reduce((a, r) => a + r.n, 0),
  };
}

/**
 * Botão "Oferecer aos técnicos" na tela do chamado (qualquer etapa até o
 * técnico em campo): se ele está numa oferta ainda sem aceite, reenvia
 * (resendOffer); se a oferta já foi aceita, libera só este chamado dela e cria
 * uma oferta nova (o técnico atual continua até outro aceitar; quem aceitar
 * passa a ficar com o chamado no Caju OS e no Jira); se não há oferta, cria.
 */
export async function offerTicket(key: string, by: string, now = new Date()): Promise<ResendResult> {
  const db = env.DB;
  const current = await db.prepare(`SELECT o.id, o.status FROM dispatch_offer_tickets t JOIN dispatch_offers o ON o.id = t.offer_id
    WHERE t.ticket_key = ?1 AND t.active = 1 ORDER BY o.id DESC LIMIT 1`).bind(key).first<{ id: number; status: string }>();
  if (current && current.status !== 'assigned') return resendOffer(current.id, by, now);
  if (current) {
    await db.batch([
      db.prepare(`UPDATE dispatch_offer_tickets SET active = 0 WHERE offer_id = ?1 AND ticket_key = ?2`).bind(current.id, key),
      db.prepare(`INSERT INTO dispatch_events (offer_id, kind, details, created_at) VALUES (?1, 'reoffered', ?2, ?3)`).bind(current.id, JSON.stringify({ by, ticket: key }), now.toISOString()),
    ]);
  }
  const mode = dispatchMode();
  if (mode === 'off') return { error: 'A distribuição está desligada.' };
  const ticket = await toDispatchTicket(key);
  const techs = (await getDb().select({
    id: technicians.id, name: technicians.name, phone: technicians.phone, approved: technicians.approved,
    baseCity: technicians.baseCity, baseState: technicians.baseState, extraCities: technicians.extraCities,
  }).from(technicians).all()).filter(notBlocked);
  const created = await createOffer({ storeKey: storeKeyOf(ticket.storeCode) ?? `sem-loja:${ticket.key}`, tickets: [ticket] }, techs, mode, now);
  if (!created) return { error: 'Não foi possível criar a oferta. Tente de novo.' };
  await db.prepare(`INSERT INTO dispatch_events (offer_id, kind, details, created_at) VALUES (?1, 'manual', ?2, ?3)`).bind(created.id, JSON.stringify({ by }), now.toISOString()).run();
  if (created.status === 'open' && mode !== 'dry_run') {
    await sendOffer(created.id, [ticket], mode, parseAllowlist((env as unknown as Record<string, string | undefined>).DISPATCH_ALLOWLIST));
  }
  return { id: created.id, status: created.status, ...await sendSummary(created.id) };
}

/** Resposta ao técnico logo depois do clique (a janela de 24 h está aberta). */
export async function replyToTechnician(to: string, text: string) {
  try { await sendTextMessage(to, text); } catch (error) {
    console.error('dispatch: resposta ao técnico falhou', error instanceof Error ? error.message : 'erro');
  }
}

async function createOffer(group: OfferGroup, techs: Parameters<typeof eligibleTechnicians>[0], mode: DispatchMode, now: Date): Promise<{ id: number; status: 'open' | 'held' } | null> {
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
  return { id: offer.id, status };
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
