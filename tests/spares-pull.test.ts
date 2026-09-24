import test from 'node:test';
import assert from 'node:assert/strict';
import { looksTruncated, MAX_PULL_ROWS, normalizeRow } from '../lib/spares-pull.ts';

test('a connector page-size response is treated as truncated', () => {
  // The real incident: the pull flow returned exactly 256 rows of a 381-row
  // spreadsheet with HTTP 200, so FSA-132148 never reached the system while
  // the sync still reported success.
  assert.equal(looksTruncated(256), true);
  assert.equal(looksTruncated(512), true);
  assert.equal(looksTruncated(1000), true);
  assert.equal(looksTruncated(2048), true);
});

test('an ordinary row count is not flagged', () => {
  for (const count of [1, 255, 257, 381, 999, 1001]) {
    assert.equal(looksTruncated(count), false);
  }
});

test('an empty spreadsheet is not reported as truncated', () => {
  // Zero rows is a legitimate answer from an empty table; warning on it would
  // train people to ignore the warning.
  assert.equal(looksTruncated(0), false);
});

test('the pull cap leaves room above the current spreadsheet size', () => {
  assert.ok(MAX_PULL_ROWS > 381);
});

test('normalizeRow converte números seriais do Excel em datas DD/MM/AAAA', async () => {
  // Caso real da planilha (linha 424: 132327, SSD (120GB), 46290 e 46293)
  const row424 = {
    STATUS: 'ENVIADO',
    FSA: '132327',
    CIDADE: 'NOVA LIMA/MG',
    EQUIPAMENTO: 'SSD (120GB)',
    'CÓDIGO DE RASTREIO': 'BR261818679053Y',
    'PREVISÃO DE ENTREGA': 46290,
    'TÉCNICO RESPONSÁVEL': 'MATHEUS RIBEIRO',
    'PREVISÃO DE ATENDIMENTO': 46293,
    FORNECEDOR: 'NÃO INFORMADO',
  };

  const record = await normalizeRow(row424);
  assert.ok(record);
  assert.equal(record.ticketKey, 'FSA-132327');
  assert.equal(record.city, 'NOVA LIMA/MG');
  assert.equal(record.equipment, 'SSD (120GB)');
  assert.equal(record.trackingCode, 'BR261818679053Y');
  assert.equal(record.expectedDelivery, '25/09/2026');
  assert.equal(record.technician, 'MATHEUS RIBEIRO');
  assert.equal(record.expectedService, '28/09/2026');
  assert.equal(record.status, 'ENVIADO');
});

test('normalizeRow preserva datas já formatadas ou formato ISO', async () => {
  const rowFormatada = {
    STATUS: 'ENVIADO',
    FSA: 'FSA-132327',
    CIDADE: 'NOVA LIMA/MG',
    EQUIPAMENTO: 'SSD (120GB)',
    'PREVISÃO DE ENTREGA': '25/09/2026',
    'PREVISÃO DE ATENDIMENTO': '2026-09-28',
  };

  const record = await normalizeRow(rowFormatada);
  assert.ok(record);
  assert.equal(record.expectedDelivery, '25/09/2026');
  assert.equal(record.expectedService, '28/09/2026');
});
