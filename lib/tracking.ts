// Rastreio de envios pela TrackingMore (Correios e Shopee Express Brasil).
// Módulo puro: interpreta códigos e respostas da API v4. A chamada HTTP fica em
// lib/server/trackingmore.ts.

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

const ERROR_MESSAGE: Record<number, string> = {
  401: 'A chave da TrackingMore é inválida.',
  429: 'Muitas consultas à TrackingMore em sequência; tente de novo em instantes.',
  4110: 'A TrackingMore considerou o código de rastreio inválido.',
  4120: 'A TrackingMore não aceitou a transportadora deste código.',
  4121: 'A TrackingMore não reconheceu a transportadora deste código.',
  4190: 'A cota do plano da TrackingMore acabou.',
};

export function normalizeTrackingCode(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
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

function dateOnly(value: unknown) {
  if (typeof value !== 'string') return null;
  return value.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}
