import assert from 'node:assert/strict';
import test from 'node:test';
import { apiErrorMessage, detectedCourier, knownCourier, toSnapshot, trackingData } from '../lib/tracking.ts';

test('a domestic Correios code skips carrier detection', () => {
  assert.equal(knownCourier('AD123456789BR'), 'brazil-correios');
  assert.equal(knownCourier(' ad 123456789 br '), 'brazil-correios');
});

test('codes outside the Correios pattern are left for the API to detect', () => {
  assert.equal(knownCourier('BR2512345678901'), null);
  assert.equal(knownCourier('LB123456789CN'), null);
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
