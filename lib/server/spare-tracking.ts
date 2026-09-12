import { eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { shipmentTracking, spares } from '@/db/schema';
import {
  isAccountError,
  looksLikeTrackingCode,
  normalizeTrackingCode,
  pickDueTrackings,
  TrackingApiError,
  UNAVAILABLE_STATUS,
  type TrackingSnapshot,
} from '@/lib/tracking';
import { trackShipment } from '@/lib/server/trackingmore';

type Spare = typeof spares.$inferSelect;

export type SpareTrackingResult =
  | { configured: false }
  | ({ configured: true } & TrackingSnapshot)
  | { configured: true; error: string; accountError: boolean };

export const SYSTEM_ACTOR = 'sistema@caju-os.local';
// Por rodada do cron (a cada 10 min): folga para os limites da API e para o
// tempo do Worker, e ainda cobre os spares ativos em menos de uma hora.
const BATCH_SIZE = 8;

/**
 * Consulta o código do spare e grava no registro que "Rastreios e entregas" do
 * chamado exibe. Nunca lança: o spare já existe, falha só o deixa sem status.
 */
export async function recordSpareTracking(
  spare: Spare,
  actorEmail: string,
  courierHint: string | null = null,
): Promise<SpareTrackingResult> {
  const db = getDb();
  const trackingCode = normalizeTrackingCode(spare.trackingCode ?? '');
  const source = spare.supplier.toUpperCase().includes('DELFIA') ? 'Delfia' : 'Caju';
  const now = new Date().toISOString();
  if (!looksLikeTrackingCode(trackingCode)) {
    return { configured: true, error: 'O campo de rastreio não tem um código válido.', accountError: false };
  }
  try {
    const snapshot = await trackShipment(trackingCode, courierHint);
    if (!snapshot) return { configured: false };

    // Meio-dia de Brasília, como o diálogo do chamado grava: meia-noite UTC
    // apareceria como o dia anterior no fuso do Brasil.
    const expectedAt = snapshot.expectedAt ? `${snapshot.expectedAt}T15:00:00.000Z` : null;
    await db
      .insert(shipmentTracking)
      .values({
        ticketKey: spare.ticketKey,
        source,
        trackingCode,
        carrier: snapshot.carrier,
        status: snapshot.status,
        lastEvent: snapshot.latestEvent,
        expectedAt,
        createdBy: actorEmail,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [shipmentTracking.ticketKey, shipmentTracking.trackingCode],
        set: {
          carrier: snapshot.carrier,
          status: snapshot.status,
          lastEvent: snapshot.latestEvent,
          ...(expectedAt ? { expectedAt } : {}),
          updatedAt: now,
        },
      });

    if (snapshot.expectedAt && !spare.expectedDelivery) {
      await db.update(spares).set({ expectedDelivery: snapshot.expectedAt, updatedAt: now }).where(eq(spares.id, spare.id));
      spare.expectedDelivery = snapshot.expectedAt;
    }
    return { configured: true, ...snapshot };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível consultar o rastreio.';
    const accountError = error instanceof TrackingApiError && isAccountError(error.code);
    // Problema do código (não reconhecido, inválido, API lenta): registra a
    // tentativa para só voltar a ele na próxima janela, sem travar a fila.
    if (!accountError) {
      await db
        .insert(shipmentTracking)
        .values({ ticketKey: spare.ticketKey, source, trackingCode, status: UNAVAILABLE_STATUS, createdBy: actorEmail, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [shipmentTracking.ticketKey, shipmentTracking.trackingCode], set: { updatedAt: now } })
        .catch(() => undefined);
    }
    console.error('Falha ao consultar o rastreio do spare', spare.id, message);
    return { configured: true, error: message, accountError };
  }
}

/**
 * Uma rodada do cron: consulta os spares ativos que ainda não têm rastreio
 * (inclusive os cadastrados antes da integração) e reconsulta os que não foram
 * entregues. Para na primeira falha de conta (chave, cota, limite).
 */
export async function refreshSpareTracking() {
  const db = getDb();
  const [candidates, tracked] = await Promise.all([
    db.select().from(spares).where(isNotNull(spares.trackingCode)).all(),
    db.select().from(shipmentTracking).all(),
  ]);
  const { batch, remaining } = pickDueTrackings(candidates, tracked, Date.now(), BATCH_SIZE);
  let updated = 0;
  const errors: string[] = [];
  for (const { spare, courierHint } of batch) {
    const result = await recordSpareTracking(spare, SYSTEM_ACTOR, courierHint);
    if (!result.configured) return { configured: false, updated, remaining: remaining + batch.length, errors };
    if ('error' in result) {
      errors.push(`${spare.ticketKey} ${spare.trackingCode}: ${result.error}`);
      if (result.accountError) break;
    } else {
      updated += 1;
    }
  }
  return { configured: true, updated, remaining, errors };
}
