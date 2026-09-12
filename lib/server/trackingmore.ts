import { env } from 'cloudflare:workers';
import {
  apiErrorMessage,
  courierFor,
  detectedCourier,
  metaCode,
  normalizeTrackingCode,
  toSnapshot,
  TrackingApiError,
  trackingData,
  type TrackingSnapshot,
} from '@/lib/tracking';

// API v4 da TrackingMore. "create" já devolve o resultado (create & get), então
// uma única chamada basta; 4101 = o código já estava registrado, e aí só se
// consulta — sem consumir outro crédito.
const BASE_URL = 'https://api.trackingmore.com/v4';
const ALREADY_EXISTS = 4101;

function apiKey() {
  return (env as unknown as { TRACKINGMORE_API_KEY?: string }).TRACKINGMORE_API_KEY?.trim() ?? '';
}

async function call(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${BASE_URL}/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Tracking-Api-Key': apiKey() },
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    return { payload, code: metaCode(payload) || response.status };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('A TrackingMore demorou demais para responder.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Status atual do envio, ou null quando a chave da TrackingMore não está
 * configurada. `courierHint` pula a detecção quando o código já foi consultado.
 */
export async function trackShipment(rawCode: string, courierHint: string | null = null): Promise<TrackingSnapshot | null> {
  if (!apiKey()) return null;
  const trackingNumber = normalizeTrackingCode(rawCode);

  let courier = courierFor(trackingNumber, courierHint);
  if (!courier) {
    const detected = await call('couriers/detect', { method: 'POST', body: JSON.stringify({ tracking_number: trackingNumber }) });
    courier = detectedCourier(detected.payload);
    if (!courier) {
      const code = detected.code === 200 ? 4121 : detected.code;
      throw new TrackingApiError(code, apiErrorMessage(code, detected.payload));
    }
  }

  let result = await call('trackings/create', {
    method: 'POST',
    body: JSON.stringify({ tracking_number: trackingNumber, courier_code: courier }),
  });
  if (result.code === ALREADY_EXISTS) {
    result = await call(`trackings/get?${new URLSearchParams({ tracking_numbers: trackingNumber, courier_code: courier })}`);
  }
  if (result.code !== 200) throw new TrackingApiError(result.code, apiErrorMessage(result.code, result.payload));

  const item = trackingData(result.payload);
  if (!item) throw new Error('A TrackingMore não devolveu dados para este código.');
  return toSnapshot(item, courier);
}
