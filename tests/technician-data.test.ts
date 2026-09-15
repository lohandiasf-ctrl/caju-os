import assert from 'node:assert/strict';
import test from 'node:test';
import { scrubTechnicianPhone } from '../lib/technician-data.ts';

test('TEL line is replaced by a dot, other lines untouched', () => {
  assert.equal(
    scrubTechnicianPhone('Nome: João Silva\nCPF: 123\nRG: \nTEL: (81) 99999-0000'),
    'Nome: João Silva\nCPF: 123\nRG: \nTEL: .',
  );
});

test('telefone label variants and casing are covered', () => {
  assert.equal(scrubTechnicianPhone('Telefone: 81999990000'), 'Telefone: .');
  assert.equal(scrubTechnicianPhone('  tel:81 9999'), '  tel: .');
  assert.equal(scrubTechnicianPhone('Telefone do Técnico: 123'), 'Telefone do Técnico: .');
});

test('text without a phone line is unchanged', () => {
  assert.equal(scrubTechnicianPhone('Nome completo: Ana\nCPF: 1'), 'Nome completo: Ana\nCPF: 1');
});
