// Pure helpers for the spreadsheet pull, kept out of `lib/server/spares-sync.ts`
// so they can be unit tested — that module imports `cloudflare:workers`, which
// does not resolve under `node --test`.

// Converte datas que vieram como número serial do Excel (ex: 46290) ou ISO para DD/MM/AAAA
export function formatarDataExcelOuIso(
  valor: string | number | null | undefined,
): string | null {
  if (valor === null || valor === undefined || valor === '') return null;

  const str = String(valor).trim();
  if (!str) return null;

  // 1. Se for número serial do Excel (ex: 46252, 46290 -> anos entre 1982 e 2077)
  const serial = Number(str);
  if (!isNaN(serial) && serial >= 30000 && serial <= 65000) {
    const dias = Math.floor(serial);
    const milissegundos = (dias - 25569) * 86400 * 1000 + 12 * 3600 * 1000;
    const data = new Date(milissegundos);
    return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  // 2. Se for data no formato ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match && !str.includes('T') && !str.includes(':')) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    const data = new Date(str);
    if (!isNaN(data.getTime())) {
      return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    }
  }

  // 3. Se for data no formato americano M/D/YYYY ou MM/DD/YYYY onde dia > 12
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const p1 = parseInt(usMatch[1], 10);
    const p2 = parseInt(usMatch[2], 10);
    const year = usMatch[3];
    if (p1 <= 12 && p2 > 12) {
      return `${String(p2).padStart(2, '0')}/${String(p1).padStart(2, '0')}/${year}`;
    }
  }

  return str;
}

export type SpareSyncRecord = {
  externalKey: string;
  status: string;
  ticketKey: string;
  city: string;
  equipment: string;
  trackingCode: string | null;
  expectedDelivery: string | null;
  technician: string | null;
  expectedService: string | null;
  note: string | null;
  address: string | null;
  supplier: string;
};

// Power Automate's "List rows present in a table" answers with only its first
// page — 256 rows — unless Pagination is switched on in the action's settings.
// The truncation is silent: the flow still returns HTTP 200, so a sync that
// imported 256 of 381 rows reported success and the spares past that point
// looked like they had never been added to the spreadsheet. Landing exactly on
// one of these sizes is the only signal the connector gives that there is more
// table behind the response.
const CONNECTOR_DEFAULT_PAGE_SIZES = new Set([256, 512, 1000, 2048, 5000]);

export function looksTruncated(received: number) {
  return received > 0 && CONNECTOR_DEFAULT_PAGE_SIZES.has(received);
}

// The spreadsheet held ~381 rows when this was last reviewed; the headroom is
// for growth, and going over it now reports a warning instead of silently
// dropping the tail the way the connector's own page limit did.
export const MAX_PULL_ROWS = 5000;

export function text(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim())
      return String(value).trim();
  }
  return '';
}

export function normalizedTicket(value: string) {
  const compact = value.toUpperCase().replace(/\s+/g, '');
  return compact.startsWith('FSA-')
    ? compact
    : `FSA-${compact.replace(/^FSA-?/, '')}`;
}

export async function externalKey(
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

export async function normalizeRow(
  value: unknown,
): Promise<SpareSyncRecord | null> {
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
      formatarDataExcelOuIso(
        text(
          row,
          'expectedDelivery',
          'PREVISÃO DE ENTREGA',
          'PREVISAO DE ENTREGA',
        ),
      ) || null,
    technician:
      text(row, 'technician', 'TÉCNICO RESPONSÁVEL', 'TECNICO RESPONSAVEL') ||
      null,
    expectedService:
      formatarDataExcelOuIso(
        text(
          row,
          'expectedService',
          'PREVISÃO DE ATENDIMENTO',
          'PREVISAO DE ATENDIMENTO',
        ),
      ) || null,
    note: text(row, 'note', 'OBSERVAÇÃO', 'OBSERVACAO') || null,
    address: text(row, 'address', 'ENDEREÇO', 'ENDERECO') || null,
    supplier:
      text(row, 'supplier', 'FORNECEDOR', 'Fornecedor').toUpperCase() ||
      'NÃO INFORMADO',
  };
  return { externalKey: await externalKey(row, record), ...record };
}
