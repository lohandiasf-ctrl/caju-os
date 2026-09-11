import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { shipmentTracking, spares } from '@/db/schema';
import { normalizeTrackingCode } from '@/lib/tracking';
import { requireApiUser } from '@/lib/server/firebase-auth';
import {
  pushSpareToSpreadsheet,
  spareSyncConfiguration,
  type SpareSyncRecord,
} from '@/lib/server/spares-sync';
import { trackShipment } from '@/lib/server/trackingmore';

const WRITE_ROLES = ['gerencia'] as const;

function clean(value: unknown, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function ticketKey(value: unknown) {
  const raw = clean(value, 30).toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  return raw.startsWith('FSA-') ? raw : `FSA-${raw.replace(/^FSA-?/, '')}`;
}

export async function GET(request: Request) {
  try {
    await requireApiUser(request, [...WRITE_ROLES]);
    const items = await getDb()
      .select()
      .from(spares)
      .orderBy(desc(spares.updatedAt))
      .limit(1000)
      .all();
    return Response.json(
      { items, sync: spareSyncConfiguration() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: 'Não foi possível carregar os spares cadastrados.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, [...WRITE_ROLES]);
    const body = (await request.json()) as Record<string, unknown>;
    const record: SpareSyncRecord = {
      externalKey: crypto.randomUUID(),
      status: clean(body.status, 40).toUpperCase() || 'PENDENTE',
      ticketKey: ticketKey(body.ticketKey),
      city: clean(body.city, 120).toUpperCase(),
      equipment: clean(body.equipment, 180).toUpperCase(),
      trackingCode: clean(body.trackingCode, 120).toUpperCase() || null,
      expectedDelivery: clean(body.expectedDelivery, 30) || null,
      technician: clean(body.technician, 160).toUpperCase() || null,
      expectedService: clean(body.expectedService, 30) || null,
      note: clean(body.note, 1000) || null,
      address: clean(body.address, 300) || null,
      supplier: clean(body.supplier, 100).toUpperCase(),
    };
    if (!record.ticketKey || !/^FSA-\d+$/i.test(record.ticketKey)) {
      return Response.json(
        { error: 'Informe um chamado no formato FSA-123456.' },
        { status: 400 },
      );
    }
    if (!record.city)
      return Response.json(
        { error: 'Informe a cidade do envio.' },
        { status: 400 },
      );
    if (!record.equipment)
      return Response.json(
        { error: 'Informe a peça ou equipamento.' },
        { status: 400 },
      );
    if (!record.supplier)
      return Response.json(
        { error: 'Informe o fornecedor do spare.' },
        { status: 400 },
      );

    const now = new Date().toISOString();
    const created = await getDb()
      .insert(spares)
      .values({
        ...record,
        source: 'system',
        syncStatus: 'pending',
        createdBy: user.email,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    try {
      const pushed = await pushSpareToSpreadsheet(record);
      if (pushed.configured) {
        await getDb()
          .update(spares)
          .set({
            syncStatus: 'synced',
            syncError: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(spares.id, created.id));
        created.syncStatus = 'synced';
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao sincronizar com a planilha.';
      await getDb()
        .update(spares)
        .set({
          syncStatus: 'failed',
          syncError: message,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(spares.id, created.id));
      created.syncStatus = 'failed';
      created.syncError = message;
    }

    const tracking = created.trackingCode
      ? await trackNewSpare(created, user.email)
      : null;

    return Response.json(
      { item: created, sync: spareSyncConfiguration(), tracking },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: 'Não foi possível cadastrar o spare.' },
      { status: 500 },
    );
  }
}

// Consulta o código informado no cadastro e grava no mesmo registro que o fluxo
// do chamado ("Rastreios e entregas") exibe. Uma falha aqui nunca desfaz o
// cadastro: o spare já está salvo, só fica sem o status automático.
async function trackNewSpare(
  spare: typeof spares.$inferSelect,
  actorEmail: string,
) {
  try {
    const trackingCode = normalizeTrackingCode(spare.trackingCode ?? '');
    const snapshot = await trackShipment(trackingCode);
    if (!snapshot) return { configured: false as const };

    const now = new Date().toISOString();
    // Meio-dia de Brasília, como o diálogo do chamado grava: meia-noite UTC
    // apareceria como o dia anterior no fuso do Brasil.
    const expectedAt = snapshot.expectedAt
      ? `${snapshot.expectedAt}T15:00:00.000Z`
      : null;
    await getDb()
      .insert(shipmentTracking)
      .values({
        ticketKey: spare.ticketKey,
        source: spare.supplier.includes('DELFIA') ? 'Delfia' : 'Caju',
        trackingCode,
        carrier: snapshot.carrier,
        status: snapshot.status,
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
          ...(expectedAt ? { expectedAt } : {}),
          updatedAt: now,
        },
      });

    if (snapshot.expectedAt && !spare.expectedDelivery) {
      await getDb()
        .update(spares)
        .set({ expectedDelivery: snapshot.expectedAt, updatedAt: now })
        .where(eq(spares.id, spare.id));
      spare.expectedDelivery = snapshot.expectedAt;
    }
    return { configured: true as const, ...snapshot };
  } catch (error) {
    console.error('Falha ao consultar o rastreio do spare', error);
    return {
      configured: true as const,
      error:
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar o rastreio.',
    };
  }
}
