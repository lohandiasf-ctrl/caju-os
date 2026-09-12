import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiErrorMessage,
  carrierLabel,
  courierFor,
  detectedCourier,
  isAccountError,
  knownCourier,
  looksLikeTrackingCode,
  pickDueTrackings,
  REFRESH_AFTER_MS,
  toSnapshot,
  trackingData,
} from '../lib/tracking.ts';

test('Correios and Shopee Express codes are recognised without calling detection', () => {
  assert.equal(knownCourier('AD123456789BR'), 'brazil-correios');
  assert.equal(knownCourier(' ad 123456789 br '), 'brazil-correios');
  assert.equal(knownCourier('BR263068264737M'), 'spx-br');
});

test('other codes are left for the API to detect', () => {
  assert.equal(knownCourier('LB123456789CN'), null);
  assert.equal(knownCourier('BR26306826473'), null);
});

test('a known format wins over the carrier stored by an earlier wrong detection', () => {
  assert.equal(courierFor('BR263068264737M', 'followmont'), 'spx-br');
  assert.equal(courierFor('LB123456789CN', 'northline'), 'northline');
  assert.equal(courierFor('LB123456789CN', 'Transportadora digitada'), null);
  assert.equal(courierFor('LB123456789CN'), null);
});

test('text typed in place of a code is not a tracking code', () => {
  assert.equal(looksLikeTrackingCode('SEM INFORMAÇÕES'), false);
  assert.equal(looksLikeTrackingCode('VIA TÉCNICO'), false);
  assert.equal(looksLikeTrackingCode('AGUARDANDO CÓDIGO'), false);
  assert.equal(looksLikeTrackingCode('12345'), false);
  assert.equal(looksLikeTrackingCode(null), false);
  assert.equal(looksLikeTrackingCode('AD123456789BR'), true);
  assert.equal(looksLikeTrackingCode('BR263068264737M'), true);
});

test('the detected carrier is the first suggestion of a successful detect call', () => {
  assert.equal(detectedCourier({ meta: { code: 200 }, data: [{ courier_code: 'spx-br' }, { courier_code: 'other' }] }), 'spx-br');
  assert.equal(detectedCourier({ meta: { code: 4121, message: 'Cannot detect courier.' }, data: [] }), null);
});

test('the tracking record is read whether the API returns an object or a list', () => {
  const item = { courier_code: 'spx-br', delivery_status: 'transit' };
  assert.deepEqual(trackingData({ meta: { code: 200 }, data: item }), item);
  assert.deepEqual(trackingData({ meta: { code: 200 }, data: [item] }), item);
  assert.equal(trackingData({ meta: { code: 200 }, data: [] }), null);
});

test('a tracking record becomes a Portuguese status with the scheduled date', () => {
  assert.deepEqual(toSnapshot({
    courier_code: 'spx-br',
    delivery_status: 'transit',
    latest_event: '  Objeto em trânsito para a unidade de distribuição ',
    scheduled_delivery_date: '2026-09-15 18:00:00',
  }, 'fallback'), {
    carrier: 'spx-br',
    status: 'Em trânsito',
    deliveryStatus: 'transit',
    latestEvent: 'Objeto em trânsito para a unidade de distribuição',
    expectedAt: '2026-09-15',
  });
});

test('a fresh tracking without data yet keeps the requested carrier and no date', () => {
  const snapshot = toSnapshot({ delivery_status: '', scheduled_delivery_date: null }, 'brazil-correios');
  assert.equal(snapshot.carrier, 'brazil-correios');
  assert.equal(snapshot.status, 'Aguardando informações');
  assert.equal(snapshot.expectedAt, null);
});

test('API errors are explained in Portuguese, with the API message as fallback', () => {
  assert.match(apiErrorMessage(4190, null), /cota/);
  assert.match(apiErrorMessage(401, null), /chave/);
  assert.equal(apiErrorMessage(4999, { meta: { message: 'Something new' } }), 'A TrackingMore respondeu 4999: Something new.');
});

test('only account-wide errors stop a refresh round', () => {
  assert.equal(isAccountError(401), true);
  assert.equal(isAccountError(4190), true);
  assert.equal(isAccountError(4121), false);
});

test('carriers are shown by name, unknown codes as they are', () => {
  assert.equal(carrierLabel('brazil-correios'), 'Correios');
  assert.equal(carrierLabel('spx-br'), 'Shopee Express');
  assert.equal(carrierLabel('jtexpress-br'), 'jtexpress-br');
  assert.equal(carrierLabel(null), '');
});

const NOW = Date.parse('2026-09-11T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const spare = (ticketKey: string, trackingCode: string | null, status = 'ENVIADO') => ({ ticketKey, trackingCode, status });

test('closed spares, spares without a usable code and repeated codes are not looked up', () => {
  const { batch } = pickDueTrackings([
    spare('FSA-1', 'AD123456789BR', 'FINALIZADO'),
    spare('FSA-2', null),
    spare('FSA-4', 'SEM INFORMAÇÕES'),
    spare('FSA-5', 'VIA TÉCNICO'),
    spare('FSA-3', 'AD111111111BR'),
    spare('FSA-3', 'ad 111111111 br', 'RECEBIDO'),
  ], [], NOW, 10);
  assert.deepEqual(batch.map((item) => item.spare.ticketKey), ['FSA-3']);
});

test('delivered codes and codes checked within the refresh window are skipped', () => {
  const tracked = [
    { ticketKey: 'FSA-1', trackingCode: 'AD000000001BR', status: 'Entregue', carrier: 'brazil-correios', updatedAt: hoursAgo(48) },
    { ticketKey: 'FSA-2', trackingCode: 'AD000000002BR', status: 'Em trânsito', carrier: 'brazil-correios', updatedAt: hoursAgo(1) },
    { ticketKey: 'FSA-3', trackingCode: 'BR265767777434W', status: 'Aguardando informações', carrier: 'followmont', updatedAt: new Date(NOW - REFRESH_AFTER_MS - 1).toISOString() },
  ];
  const { batch } = pickDueTrackings([
    spare('FSA-1', 'AD000000001BR'),
    spare('FSA-2', 'AD000000002BR'),
    spare('FSA-3', 'BR265767777434W'),
  ], tracked, NOW, 10);
  // O código da Shopee volta com a transportadora certa, não com a detectada errada.
  assert.deepEqual(batch.map((item) => [item.spare.ticketKey, item.courierHint]), [['FSA-3', 'spx-br']]);
});

test('never-tracked spares go first, then the stalest, within the batch limit', () => {
  const tracked = [
    { ticketKey: 'FSA-1', trackingCode: 'AD000000010BR', status: 'Em trânsito', carrier: 'Transportadora digitada', updatedAt: hoursAgo(30) },
    { ticketKey: 'FSA-2', trackingCode: 'AD000000020BR', status: 'Em trânsito', carrier: 'brazil-correios', updatedAt: hoursAgo(10) },
  ];
  const { batch, remaining } = pickDueTrackings([
    spare('FSA-2', 'AD000000020BR'),
    spare('FSA-1', 'AD000000010BR'),
    spare('FSA-9', 'LB123456789CN'),
  ], tracked, NOW, 2);
  assert.deepEqual(batch.map((item) => item.spare.ticketKey), ['FSA-9', 'FSA-1']);
  assert.equal(batch[0].courierHint, null);
  assert.equal(batch[1].courierHint, 'brazil-correios');
  assert.equal(remaining, 1);
});
