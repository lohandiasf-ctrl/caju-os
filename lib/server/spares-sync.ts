import { env } from 'cloudflare:workers';

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

type SyncEnv = {
  SPARES_SYNC_PUSH_URL?: string;
  SPARES_SYNC_PUSH_URL_ORIGINAL?: string;
  SPARES_SYNC_PULL_URL?: string;
  SPARES_SYNC_TOKEN?: string;
};

function syncEnv(): SyncEnv {
  return env as unknown as SyncEnv;
}

function syncHeaders() {
  const token = syncEnv().SPARES_SYNC_TOKEN?.trim();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'x-caju-sync-token': token } : {}),
  };
}

function pushUrls() {
  const settings = syncEnv();
  return [settings.SPARES_SYNC_PUSH_URL, settings.SPARES_SYNC_PUSH_URL_ORIGINAL]
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url));
}

async function checkedFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok)
      throw new Error(
        `Conector da planilha respondeu HTTP ${response.status}.`,
      );
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('A planilha demorou demais para responder.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function spareSyncConfiguration() {
  const settings = syncEnv();
  return {
    push: pushUrls().length > 0,
    pushOriginal: Boolean(settings.SPARES_SYNC_PUSH_URL_ORIGINAL?.trim()),
    pushTargets: pushUrls().length,
    pull: Boolean(settings.SPARES_SYNC_PULL_URL?.trim()),
  };
}

export async function pushSpareToSpreadsheet(spare: SpareSyncRecord) {
  const urls = pushUrls();
  if (urls.length === 0) return { configured: false as const };
  const failures: string[] = [];
  for (const url of urls) {
    try {
      await checkedFetch(url, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({ spare }),
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Falha no conector.');
    }
  }
  if (failures.length > 0) {
    throw new Error(
      failures.length === urls.length
        ? failures[0]
        : `Uma das planilhas não foi atualizada: ${failures.join(' | ')}`,
    );
  }
  return { configured: true as const };
}

export async function pullSparesFromSpreadsheet(): Promise<unknown[]> {
  const url = syncEnv().SPARES_SYNC_PULL_URL?.trim();
  if (!url) return [];
  const response = await checkedFetch(url, {
    // Power Automate's "When an HTTP request is received" trigger only
    // accepts POST. Using GET here made a correctly configured pull flow
    // unreachable before it could return the spreadsheet rows.
    method: 'POST',
    headers: syncHeaders(),
    // O gatilho legado do Power Automate mantém `spare` como propriedade
    // obrigatória mesmo para a operação de leitura. Enviamos um objeto vazio
    // apenas para satisfazer esse contrato; o fluxo ignora-o no ramo de pull.
    body: JSON.stringify({
      action: 'list-spares',
      spare: {
        externalKey: '',
        status: '',
        ticketKey: '',
        city: '',
        equipment: '',
        supplier: '',
      },
    }),
  });
  const body = (await response.json()) as { items?: unknown[] } | unknown[];
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.items)) return body.items;
  throw new Error('O conector da planilha retornou um formato inválido.');
}
