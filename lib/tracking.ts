// Rastreio de envios pela TrackingMore (Correios e Shopee Express Brasil).
// Módulo puro: interpreta códigos e respostas da API v4 e decide quais spares
// consultar. A chamada HTTP fica em lib/server/trackingmore.ts.

export type TrackingSnapshot = {
  /** courier_code da TrackingMore, ex.: brazil-correios, spx-br. */
  carrier: string;
  /** Rótulo em português do delivery_status. */
  status: string;
  /** Valor cru do delivery_status (pending, transit, delivered...). */
  deliveryStatus: string;
  latestEvent: string | null;
  /** Data prevista (YYYY-MM-DD), quando a transportadora informa. */
  expectedAt: string | null;
};

export const CORREIOS = 'brazil-correios';

/** Status de spare que encerram o acompanhamento (mesma lista da tela de spares). */
export const CLOSED_SPARE_STATUSES = ['FINALIZADO', 'ENCERRADO', 'FECHADO', 'CANCELADO'] as const;
/** Status de rastreio que não mudam mais; não vale reconsultar. */
export const FINAL_TRACKING_STATUSES = ['Entregue', 'Rastreio expirado'];
export const UNAVAILABLE_STATUS = 'Rastreio indisponível';
/** Intervalo mínimo entre duas consultas do mesmo código. */
export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando informações',
  notfound: 'Não encontrado',
  inforeceived: 'Postado',
  transit: 'Em trânsito',
  pickup: 'Saiu para entrega',
  delivered: 'Entregue',
  undelivered: 'Falha na entrega',
  exception: 'Exceção na entrega',
  expired: 'Rastreio expirado',
};

const CARRIER_LABEL: Record<string, string> = {
  'brazil-correios': 'Correios',
  'spx-br': 'Shopee Express',
};

const ERROR_MESSAGE: Record<number, string> = {
  401: 'A chave da TrackingMore é inválida.',
  429: 'Muitas consultas à TrackingMore em sequência; tente de novo em instantes.',
  4110: 'A TrackingMore considerou o código de rastreio inválido.',
  4120: 'A TrackingMore não aceitou a transportadora deste código.',
  4121: 'A TrackingMore não reconheceu a transportadora deste código.',
  4190: 'A cota do plano da TrackingMore acabou.',
};

export class TrackingApiError extends Error {
  // Campo declarado à parte: `node --experimental-strip-types` (usado nos
  // testes) não aceita parameter properties no construtor.
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'TrackingApiError';
    this.code = code;
  }
}

/** Erro da conta, não do código: vale para qualquer consulta, então a rodada deve parar. */
export function isAccountError(code: number) {
  return code === 401 || code === 429 || code === 4190;
}

export function normalizeTrackingCode(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function trackingKey(ticketKey: string, trackingCode: string) {
  return `${ticketKey.trim().toUpperCase()}|${normalizeTrackingCode(trackingCode)}`;
}

export function carrierLabel(code: string | null | undefined) {
  if (!code) return '';
  return CARRIER_LABEL[code] ?? code;
}

/** Só courier_codes gravados pela integração servem de atalho; texto livre não. */
export function looksLikeCourierCode(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-z0-9][a-z0-9-]*$/.test(value));
}

// Padrão S10 da UPU usado pelos Correios em envios nacionais: 2 letras, 9
// dígitos e BR. Evita gastar uma chamada de detecção no caso mais comum.
export function knownCourier(trackingCode: string) {
  return /^[A-Z]{2}\d{9}BR$/.test(normalizeTrackingCode(trackingCode)) ? CORREIOS : null;
}

export function metaCode(payload: unknown) {
  const code = (payload as { meta?: { code?: unknown } } | null)?.meta?.code;
  return typeof code === 'number' ? code : 0;
}

export function apiErrorMessage(code: number, payload: unknown) {
  const detail = (payload as { meta?: { message?: unknown } } | null)?.meta?.message;
  return ERROR_MESSAGE[code] ?? `A TrackingMore respondeu ${code}${typeof detail === 'string' && detail ? `: ${detail}` : ''}.`;
}

/** Primeiro courier_code sugerido por POST /couriers/detect. */
export function detectedCourier(payload: unknown) {
  if (metaCode(payload) !== 200) return null;
  const data = (payload as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : data;
  const code = (first as { courier_code?: unknown } | undefined)?.courier_code;
  return typeof code === 'string' && code ? code : null;
}

/** O registro de rastreio da resposta; a API devolve objeto ou lista conforme o endpoint. */
export function trackingData(payload: unknown) {
  const data = (payload as { data?: unknown } | null)?.data;
  const item = Array.isArray(data) ? data[0] : data;
  return item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
}

export function toSnapshot(item: Record<string, unknown>, courier: string): TrackingSnapshot {
  const deliveryStatus = typeof item.delivery_status === 'string' && item.delivery_status ? item.delivery_status : 'pending';
  return {
    carrier: typeof item.courier_code === 'string' && item.courier_code ? item.courier_code : courier,
    status: STATUS_LABEL[deliveryStatus] ?? deliveryStatus,
    deliveryStatus,
    latestEvent: typeof item.latest_event === 'string' && item.latest_event.trim() ? item.latest_event.trim() : null,
    expectedAt: dateOnly(item.scheduled_delivery_date),
  };
}

type SpareRef = { ticketKey: string; trackingCode: string | null; status: string };
type TrackedRef = { ticketKey: string; trackingCode: string; status: string; carrier: string | null; updatedAt: string };

/**
 * Quais spares consultar nesta rodada: ativos, com código, uma vez por chamado +
 * código, sem os já entregues e sem os consultados há menos de REFRESH_AFTER_MS.
 * Nunca consultados primeiro, depois os mais antigos.
 */
export function pickDueTrackings<T extends SpareRef>(spareRows: T[], tracked: TrackedRef[], now: number, limit: number) {
  const byKey = new Map(tracked.map((row) => [trackingKey(row.ticketKey, row.trackingCode), row]));
  const closed: readonly string[] = CLOSED_SPARE_STATUSES;
  const seen = new Set<string>();
  const due: Array<{ spare: T; courierHint: string | null; lastUpdate: number }> = [];
  for (const spare of spareRows) {
    const code = normalizeTrackingCode(spare.trackingCode ?? '');
    if (!code || closed.includes(spare.status.trim().toUpperCase())) continue;
    const key = trackingKey(spare.ticketKey, code);
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byKey.get(key);
    if (row && FINAL_TRACKING_STATUSES.includes(row.status)) continue;
    const lastUpdate = row ? Date.parse(row.updatedAt) || 0 : 0;
    if (row && now - lastUpdate < REFRESH_AFTER_MS) continue;
    due.push({ spare, courierHint: looksLikeCourierCode(row?.carrier) ? row.carrier : null, lastUpdate });
  }
  due.sort((a, b) => a.lastUpdate - b.lastUpdate);
  return { batch: due.slice(0, limit), remaining: Math.max(0, due.length - limit) };
}

function dateOnly(value: unknown) {
  if (typeof value !== 'string') return null;
  return value.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}
