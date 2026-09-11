import { desc, eq, or } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { spares } from '@/db/schema';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { MAX_PULL_ROWS } from '@/lib/spares-pull';
import {
  pullSparesFromSpreadsheet,
  pushSpareToSpreadsheet,
  spareSyncConfiguration,
  type SpareSyncRecord,
} from '@/lib/server/spares-sync';

const WRITE_ROLES = ['gerencia'] as const;

function text(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim())
      return String(value).trim();
  }
  return '';
}

function normalizedTicket(value: string) {
  const compact = value.toUpperCase().replace(/\s+/g, '');
  return compact.startsWith('FSA-')
    ? compact
    : `FSA-${compact.replace(/^FSA-?/, '')}`;
}

async function externalKey(
  row: Record<string, unknown>,
  record: Omit<SpareSyncRecord, 'externalKey'>,
) {
  const supplied = text(row, 'externalKey', 'external_key', 'ID', 'Id', 'id');
  if (supplied) return supplied.slice(0, 160);
  const bytes = new TextEncoder().encode(
    [
      record.ticketKey,
      record.equipment,
      record.trackingCode,
      record.supplier,
    ].join('|'),
  );
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `sheet-${Array.from(new Uint8Array(hash))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

async function normalizeRow(value: unknown): Promise<SpareSyncRecord | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fsa = text(row, 'ticketKey', 'FSA', 'fsa');
  const equipment = text(row, 'equipment', 'EQUIPAMENTO', 'Equipamento');
  if (!fsa || !equipment) return null;
  const record = {
    status: text(row, 'status', 'STATUS', 'Status').toUpperCase() || 'PENDENTE',
    ticketKey: normalizedTicket(fsa),
    city: text(row, 'city', 'CIDADE', 'Cidade').toUpperCase(),
    equipment: equipment.toUpperCase(),
    trackingCode:
      text(row, 'trackingCode', 'CÓDIGO DE RASTREIO', 'CODIGO DE RASTREIO') ||
      null,
    expectedDelivery:
      text(
        row,
        'expectedDelivery',
        'PREVISÃO DE ENTREGA',
        'PREVISAO DE ENTREGA',
      ) || null,
    technician:
      text(row, 'technician', 'TÉCNICO RESPONSÁVEL', 'TECNICO RESPONSAVEL') ||
      null,
    expectedService:
      text(
        row,
        'expectedService',
        'PREVISÃO DE ATENDIMENTO',
        'PREVISAO DE ATENDIMENTO',
      ) || null,
    note: text(row, 'note', 'OBSERVAÇÃO', 'OBSERVACAO') || null,
    address: text(row, 'address', 'ENDEREÇO', 'ENDERECO') || null,
    supplier:
      text(row, 'supplier', 'FORNECEDOR', 'Fornecedor').toUpperCase() ||
      'NÃO INFORMADO',
  };
  return { externalKey: await externalKey(row, record), ...record };
}

export async function POST(request: Request) {
  try {
    // The Worker calls this same route every ten minutes. The cron secret is
    // required, so this does not turn the spreadsheet connector into a public
    // endpoint; a logged-in manager can still run it on demand from the UI.
    const cron = request.headers.get('x-cron-secret');
    const isScheduled = Boolean(env.CRON_SECRET && cron && cron === env.CRON_SECRET);
    const user = isScheduled
      ? { email: 'sistema@caju-os.local' }
      : await requireApiUser(request, [...WRITE_ROLES]);
    const settings = spareSyncConfiguration();
    if (!settings.push && !settings.pull) {
      return Response.json(
        {
          error:
            'A sincronização do SharePoint ainda não foi configurada no Worker.',
        },
        { status: 409 },
      );
    }
    const db = getDb();
    let imported = 0;
    let sent = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (settings.pull) {
      try {
        const { items, truncated } = await pullSparesFromSpreadsheet();
        if (truncated)
          warnings.push(
            `O conector devolveu exatamente ${items.length} linhas, que e o tamanho de pagina padrao do Power Automate. ` +
              'Ative a paginacao na acao "List rows present in a table" (Settings -> Pagination, Threshold 5000); ' +
              'sem isso as linhas seguintes da planilha nunca chegam ao sistema.',
          );
        if (items.length > MAX_PULL_ROWS)
          warnings.push(
            `A planilha devolveu ${items.length} linhas e o limite desta rota e ${MAX_PULL_ROWS}. ` +
              'As excedentes foram ignoradas nesta execucao.',
          );
        for (const value of items.slice(0, MAX_PULL_ROWS)) {
          const record = await normalizeRow(value);
          if (!record) continue;
          const now = new Date().toISOString();
          await db
            .insert(spares)
            .values({
              ...record,
              source: 'spreadsheet',
              syncStatus: 'synced',
              syncError: null,
              createdBy: user.email,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: spares.externalKey,
              set: {
                ...record,
                source: 'spreadsheet',
                syncStatus: 'synced',
                syncError: null,
                updatedAt: now,
              },
            });
          imported += 1;
        }
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'Falha ao ler a planilha.',
        );
      }
    }

    if (settings.push) {
      const pending = await db
        .select()
        .from(spares)
        .where(
          or(eq(spares.syncStatus, 'pending'), eq(spares.syncStatus, 'failed')),
        )
        .orderBy(desc(spares.updatedAt))
        .limit(100)
        .all();
      for (const row of pending) {
        const record: SpareSyncRecord = {
          externalKey: row.externalKey,
          status: row.status,
          ticketKey: row.ticketKey,
          city: row.city,
          equipment: row.equipment,
          trackingCode: row.trackingCode,
          expectedDelivery: row.expectedDelivery,
          technician: row.technician,
          expectedService: row.expectedService,
          note: row.note,
          address: row.address,
          supplier: row.supplier,
        };
        try {
          await pushSpareToSpreadsheet(record);
          await db
            .update(spares)
            .set({
              syncStatus: 'synced',
              syncError: null,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(spares.id, row.id));
          sent += 1;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Falha ao escrever na planilha.';
          await db
            .update(spares)
            .set({
              syncStatus: 'failed',
              syncError: message,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(spares.id, row.id));
          errors.push(`${row.ticketKey}: ${message}`);
        }
      }
    }

    return Response.json({
      // A truncated pull is not an error the connector reported — it answered
      // 200 — but the sync is incomplete, so it must not read as a clean run.
      ok: errors.length === 0 && warnings.length === 0,
      imported,
      sent,
      errors: errors.slice(0, 10),
      warnings: warnings.slice(0, 10),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: 'Não foi possível sincronizar os spares.' },
      { status: 500 },
    );
  }
}
