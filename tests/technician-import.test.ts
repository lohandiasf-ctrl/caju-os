import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTechnicianCsv } from '../lib/technician-import.ts';

test('imports the qualified technician CSV including the WhatsApp column', () => {
  const csv = [
    'ID;Identificador;Nome Completo;WhatsApp;Cidade;Estado;UF;Desloc.;Qual(is) seria(m) sua(s) modalidade(s) de deslocamento?;Base de Conhecimento',
    '1;TEC-0001;Ewerton Rennan Ferreira da Silva;81991230754;Timbaúba;Pernambuco;PE;Sim;"Carro próprio;Transporte Público";"Microinformática;Telefonia"',
  ].join('\r\n');
  const [row] = parseTechnicianCsv(csv);
  assert.equal(row.technicianExternalId, '1');
  assert.equal(row.technicianCode, 'TEC-0001');
  assert.equal(row.phone, '81991230754');
  assert.equal(row.city, 'Timbaúba');
  assert.equal(row.state, 'PE');
  assert.equal(row.hasVehicle, 'Sim');
  assert.equal(row.specialties, 'Microinformática;Telefonia');
});

test('accepts Windows-style headers and quoted line breaks without splitting a technician', () => {
  const csv = 'Nome Completo;WhatsApp;Cidade;Estado;Base de Conhecimento\r\n"Ana Souza";"11999990000";"São Paulo";"São Paulo";"Redes\r\ne infraestrutura"';
  const rows = parseTechnicianCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'SP');
  assert.equal(rows[0].specialties, 'Redes\r\ne infraestrutura');
});
