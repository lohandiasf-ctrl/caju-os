import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVcf, phoneKey } from '../lib/whatsapp-contacts.ts';

test('chave do telefone casa com e sem o nono dígito, com ou sem formatação', () => {
  assert.equal(phoneKey('5581991738635'), '8191738635');
  assert.equal(phoneKey('558191738635'), '8191738635');
  assert.equal(phoneKey('+55 (81) 99173-8635'), '8191738635');
  assert.equal(phoneKey('5581991738635@c.us'), '8191738635');
  assert.equal(phoneKey('81991738635'), '8191738635');
});

test('grupo, lid e número curto não têm chave', () => {
  assert.equal(phoneKey('120363410809472542@g.us'), null);
  assert.equal(phoneKey('209479127822392@lid'), null);
  assert.equal(phoneKey('12345'), null);
  assert.equal(phoneKey(null), null);
});

test('vCard 2.1 com texto simples e com quoted-printable UTF-8 quebrado em linhas', () => {
  const vcf = [
    'BEGIN:VCARD', 'VERSION:2.1', 'N:;TEC - Mayllane (Roteiro/AL) | #TEC-493;;;', 'FN:TEC - Mayllane (Roteiro/AL) | #TEC-493', 'TEL;CELL:+5582920005009', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=54=45=43=20=2D=20=42=72=75=6E=6E=6F=20=41=73=73=75=6E=C3=A7=C3=A3=6F=', '=20=7C;;;',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=54=45=43=20=2D=20=42=72=75=6E=6E=6F=20=41=73=73=75=6E=C3=A7=C3=A3=6F=', '=20=7C=20=23=54=45=43=2D=34=37=38',
    'TEL;CELL:+5586995378546', 'TEL;HOME:(86) 3333-4444', 'END:VCARD',
  ].join('\r\n');
  const contacts = parseVcf(vcf);
  assert.deepEqual(contacts[0], { name: 'TEC - Mayllane (Roteiro/AL) | #TEC-493', phone: '+5582920005009' });
  assert.equal(contacts[1].name, 'TEC - Brunno Assunção | #TEC-478');
  assert.equal(contacts.length, 3);
  assert.equal(contacts[2].phone, '(86) 3333-4444');
});
