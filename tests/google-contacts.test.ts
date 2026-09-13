import assert from 'node:assert/strict';
import test from 'node:test';
import { GOOGLE_CONTACTS_HEADER, googleContactsCsv, technicianShortName } from '../lib/google-contacts.ts';

test('shortens and capitalizes technician names using the first two words', () => {
  assert.equal(technicianShortName('JOÃO PEDRO DE LIMA'), 'João Pedro');
  assert.equal(technicianShortName('José de Almeida Ferreira Lima'), 'José de Almeida');
  assert.equal(technicianShortName('Augusto dos Santos Firmino'), 'Augusto dos Santos');
  assert.equal(technicianShortName('EdiR MacEDO'), 'Edir Macedo');
});

test('exports Google Contacts header and continues TCP numbering', () => {
  const csv = googleContactsCsv([{ name: 'EWERTON RENANN', phone: '(81) 99123-0754', city: 'Timbaúba', state: 'pe' }], 125);
  const [header, row] = csv.split('\r\n');
  assert.equal(header, GOOGLE_CONTACTS_HEADER.join(','));
  assert.equal(row?.split(',').length, GOOGLE_CONTACTS_HEADER.length);
  assert.match(row ?? '', /^TCP - Ewerton Renann \(Timbaúba\/PE\) \| #TCP-0126,/);
  assert.match(row ?? '', /,Mobile,\+5581991230754,Work,/);
});
