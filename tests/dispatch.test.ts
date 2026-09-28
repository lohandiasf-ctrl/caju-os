import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  ACCEPT_OFFER_SQL, acceptPayloadOffer, DISPATCH_TEMPLATES, dispatchModeOf, eligibleTechnicians, equipmentLine, groupByStore,
  holdReasons, offerMessage, samePhone, splitCity, storeKeyOf, storeLine, templateParam, templateSendPayload, whatsappPhone,
  type DispatchTechnician, type DispatchTicket,
} from '../lib/dispatch.ts';

const ticket = (partial: Partial<DispatchTicket> & { key: string }): DispatchTicket => ({
  storeCode: 'L330', storeName: 'Loja Centro', city: 'Patos de Minas/MG', equipment: 'CPU', pdv: '308', allegedDefect: 'PC não liga', ...partial,
});
const tech = (partial: Partial<DispatchTechnician> & { id: number }): DispatchTechnician => ({
  name: `Técnico ${partial.id}`, phone: '(34) 99999-0000', approved: true, baseCity: 'Patos de Minas', baseState: 'MG', extraCities: null, ...partial,
});

test('modo desligado por padrão', () => {
  assert.equal(dispatchModeOf(undefined), 'off');
  assert.equal(dispatchModeOf('qualquer'), 'off');
  assert.equal(dispatchModeOf(' DRY_RUN '), 'dry_run');
});

test('identidade da loja estável: Loja 330, L330 e 0330 são a mesma', () => {
  assert.equal(storeKeyOf('Loja 330'), 'L330');
  assert.equal(storeKeyOf('L330'), 'L330');
  assert.equal(storeKeyOf('0330'), 'L330');
  assert.equal(storeKeyOf(''), null);
  assert.deepEqual(splitCity('Candeias/BA'), { city: 'Candeias', uf: 'BA' });
  assert.deepEqual(splitCity('Ji-Paraná - RO'), { city: 'Ji-Paraná', uf: 'RO' });
  assert.deepEqual(splitCity('Recife'), { city: 'Recife', uf: null });
});

test('agrupa FSAs da mesma loja e separa lojas diferentes da mesma cidade', () => {
  const groups = groupByStore([
    ticket({ key: 'FSA-3', storeCode: 'Loja 497' }), ticket({ key: 'FSA-1', storeCode: 'L497' }),
    ticket({ key: 'FSA-2', storeCode: 'L500' }), ticket({ key: 'FSA-9', storeCode: null }), ticket({ key: 'FSA-8', storeCode: null }),
  ]);
  const byStore = Object.fromEntries(groups.map((g) => [g.storeKey, g.tickets.map((t) => t.key)]));
  assert.deepEqual(byStore.L497, ['FSA-1', 'FSA-3']);
  assert.deepEqual(byStore.L500, ['FSA-2']);
  // Sem código de loja, cada chamado fica sozinho: nunca junta lojas por engano.
  assert.deepEqual(byStore['sem-loja:FSA-9'], ['FSA-9']);
  assert.deepEqual(byStore['sem-loja:FSA-8'], ['FSA-8']);
});

test('técnicos elegíveis: aprovados, com WhatsApp, da cidade ou com ela nas extras', () => {
  const techs = [
    tech({ id: 1 }),
    tech({ id: 2, approved: false }),
    tech({ id: 3, phone: null }),
    tech({ id: 4, baseCity: 'Uberlândia', extraCities: 'Patos de Minas, Araxá' }),
    tech({ id: 5, baseCity: 'Patos de Minas', baseState: 'SP' }),
    tech({ id: 6, baseCity: 'patos de minas' }),
  ];
  assert.deepEqual(eligibleTechnicians(techs, 'Patos de Minas', 'MG').map((t) => t.id), [1, 4, 6]);
});

test('telefone no formato do WhatsApp e comparação sem o nono dígito', () => {
  assert.equal(whatsappPhone('(81) 99173-8635'), '5581991738635');
  assert.equal(whatsappPhone('+55 81 99173-8635'), '5581991738635');
  assert.equal(whatsappPhone('123'), null);
  assert.ok(samePhone('558191738635', '(81) 99173-8635'));
  assert.ok(!samePhone('5581991738635', '5511991738635'));
});

test('mensagem individual: resumo vem só do Defeito alegado, sem quebra de linha nas variáveis', () => {
  const m = offerMessage(42, [ticket({ key: 'FSA-132506', allegedDefect: 'PC deu\n\npau   de   novo' })]);
  assert.equal(m.name, 'atendimento_disponivel');
  assert.deepEqual(m.body, ['FSA-132506', 'L330 - Patos de Minas/MG', 'CPU - PDV 308', 'PC deu pau de novo']);
  assert.equal(m.urlSuffix, 'FSA-132506');
  assert.equal(m.payload, 'aceitar:42');
  for (const p of m.body) assert.ok(!/\n|\t| {5}/.test(p));
  assert.equal(templateParam('x'.repeat(300)).length, 160);
});

test('mensagem agrupada: um botão para todos os FSAs da loja', () => {
  const m = offerMessage(7, [ticket({ key: 'FSA-1', equipment: 'CPU' }), ticket({ key: 'FSA-2', equipment: 'Teclado' }), ticket({ key: 'FSA-3', equipment: 'CPU' })]);
  assert.equal(m.name, 'atendimento_disponivel_grupo');
  assert.deepEqual(m.body, ['3', 'L330 - Patos de Minas/MG', 'CPU, Teclado']);
  assert.equal(m.urlSuffix, '7');
  const send = templateSendPayload('5534999990000', m);
  assert.equal(send.template.components[1].parameters[0].payload, 'aceitar:7');
});

test('oferta retida: sem Defeito alegado, sem loja ou sem técnico não sai', () => {
  assert.deepEqual(holdReasons({ storeKey: 'L1', tickets: [ticket({ key: 'A', allegedDefect: '  ' })] }, 2), ['sem_defeito']);
  assert.deepEqual(holdReasons({ storeKey: 'L1', tickets: [ticket({ key: 'A' })] }, 0), ['sem_tecnico']);
  assert.deepEqual(holdReasons({ storeKey: 'x', tickets: [ticket({ key: 'A', storeCode: null })] }, 1), ['sem_loja']);
  assert.equal(equipmentLine({ equipment: null, pdv: null }), 'Equipamento não informado');
  assert.equal(storeLine({ storeCode: 'Loja 12', city: 'Recife' }), 'L12 - Recife');
});

test('payload do botão Aceitar', () => {
  assert.equal(acceptPayloadOffer('aceitar:15'), 15);
  assert.equal(acceptPayloadOffer('Aceitar atendimento'), null);
  assert.equal(acceptPayloadOffer(null), null);
});

test('templates: botão Aceitar primeiro, link depois (índices usados no envio)', () => {
  for (const t of DISPATCH_TEMPLATES) {
    const buttons = t.components.find((c) => c.type === 'BUTTONS');
    assert.ok(buttons && 'buttons' in buttons);
    assert.equal(buttons.buttons[0].type, 'QUICK_REPLY');
    assert.equal(buttons.buttons[1].type, 'URL');
    const body = t.components.find((c) => c.type === 'BODY');
    assert.ok(body && 'text' in body && !/^\{\{|\}\}$/.test(body.text.trim()), 'a Meta recusa corpo que começa ou termina com variável');
  }
});

// ─── A disputa no banco: a migration de verdade, num SQLite em memória ───
function database() {
  const db = new DatabaseSync(':memory:');
  // Só o que a migration referencia; a tabela real vem das migrations anteriores.
  db.exec(`CREATE TABLE technicians (id integer PRIMARY KEY)`);
  for (const id of [10, 11, 99]) db.prepare(`INSERT INTO technicians (id) VALUES (?)`).run(id);
  db.exec(readFileSync(new URL('../drizzle/0046_dispatch_offers.sql', import.meta.url), 'utf8'));
  const now = '2026-09-28T12:00:00.000Z';
  db.prepare(`INSERT INTO dispatch_offers (id, store_key, status, mode, expires_at, created_at, updated_at) VALUES (1, 'L330', 'open', 'live', '2026-09-28T14:00:00.000Z', ?, ?)`).run(now, now);
  for (const id of [10, 11]) db.prepare(`INSERT INTO dispatch_recipients (offer_id, technician_id, phone, status, updated_at) VALUES (1, ?, '5534999990000', 'sent', ?)`).run(id, now);
  return db;
}
const accept = (db: DatabaseSync, techId: number, at = '2026-09-28T12:05:00.000Z') => Number(db.prepare(ACCEPT_OFFER_SQL).run(techId, at, 1).changes);

test('primeiro clique vence; o segundo não muda nada', () => {
  const db = database();
  assert.equal(accept(db, 10), 1);
  assert.equal(accept(db, 11), 0);
  assert.equal(accept(db, 10), 0);
  const row = db.prepare(`SELECT status, assigned_technician_id FROM dispatch_offers WHERE id = 1`).get() as { status: string; assigned_technician_id: number };
  assert.deepEqual({ ...row }, { status: 'assigned', assigned_technician_id: 10 });
});

test('quem não recebeu a oferta não aceita; oferta vencida também não', () => {
  const db = database();
  assert.equal(accept(db, 99), 0);
  assert.equal(accept(db, 10, '2026-09-28T14:00:00.000Z'), 0);
  assert.equal(accept(db, 11), 1);
});

test('o mesmo FSA não fica em duas ofertas valendo; depois de expirar, pode', () => {
  const db = database();
  db.prepare(`INSERT INTO dispatch_offers (id, store_key, status, mode, expires_at, created_at, updated_at) VALUES (2, 'L330', 'open', 'live', 'x', 'x', 'x')`).run();
  db.prepare(`INSERT INTO dispatch_offer_tickets (offer_id, ticket_key, active) VALUES (1, 'FSA-1', 1)`).run();
  assert.throws(() => db.prepare(`INSERT INTO dispatch_offer_tickets (offer_id, ticket_key, active) VALUES (2, 'FSA-1', 1)`).run(), /UNIQUE/);
  db.prepare(`UPDATE dispatch_offer_tickets SET active = 0 WHERE offer_id = 1`).run();
  db.prepare(`INSERT INTO dispatch_offer_tickets (offer_id, ticket_key, active) VALUES (2, 'FSA-1', 1)`).run();
});
