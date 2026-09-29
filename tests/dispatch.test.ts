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
  assert.equal(m.name, 'oferta_atendimento');
  assert.deepEqual(m.body, ['FSA-132506', 'L330 - Patos de Minas/MG', 'CPU - PDV 308', 'PC deu pau de novo']);
  assert.equal(m.payload, 'aceitar:42');
  assert.equal(m.declinePayload, 'recusar:42');
  for (const p of m.body) assert.ok(!/\n|\t| {5}/.test(p));
  assert.equal(templateParam('x'.repeat(300)).length, 160);
});

test('mensagem agrupada: um botão para todos os FSAs da loja', () => {
  const m = offerMessage(7, [ticket({ key: 'FSA-1', equipment: 'CPU' }), ticket({ key: 'FSA-2', equipment: 'Teclado' }), ticket({ key: 'FSA-3', equipment: 'CPU' })]);
  assert.equal(m.name, 'oferta_atendimento_grupo');
  assert.deepEqual(m.body, ['3', 'L330 - Patos de Minas/MG', 'CPU, Teclado']);
  const send = templateSendPayload('5534999990000', m);
  assert.equal(send.template.components[1].parameters[0].payload, 'aceitar:7');
  assert.equal(send.template.components[2].parameters[0].payload, 'recusar:7');
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
  assert.equal(acceptPayloadOffer('recusar:15'), null);
});

test('templates: Aceitar e Recusar, sem link (índices usados no envio)', () => {
  for (const t of DISPATCH_TEMPLATES) {
    const buttons = t.components.find((c) => c.type === 'BUTTONS');
    assert.ok(buttons && 'buttons' in buttons);
    assert.deepEqual(buttons.buttons.map((b) => [b.type, b.text]), [['QUICK_REPLY', 'Aceitar'], ['QUICK_REPLY', 'Recusar']]);
    const body = t.components.find((c) => c.type === 'BODY');
    assert.ok(body && 'text' in body && !/^\{\{|\}\}$/.test(body.text.trim()), 'a Meta recusa corpo que começa ou termina com variável');
    assert.ok(/a partir de R\$ 70,00|Valor: /.test(body.text), 'toda oferta diz o valor');
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

test('lista de teste: só os números dela recebem no modo allowlist', async () => {
  const { parseAllowlist, allowedToReceive } = await import('../lib/dispatch.ts');
  const list = parseAllowlist('81 99173-8635, lixo, +55 (11) 98888-7777');
  assert.deepEqual(list, ['5581991738635', '5511988887777']);
  assert.equal(allowedToReceive('allowlist', list, '(81) 99173-8635'), true);
  assert.equal(allowedToReceive('allowlist', list, '(81) 99999-0000'), false);
  assert.equal(allowedToReceive('live', [], '(81) 99999-0000'), true);
  assert.equal(allowedToReceive('dry_run', list, '(81) 99173-8635'), false);
});

test('depois do aceite: bloco do técnico no formato do Jira e avisos', async () => {
  const { technicianDataBlock, acceptedNotice, unansweredNotice, NOTICE_TEMPLATES } = await import('../lib/dispatch.ts');
  assert.equal(technicianDataBlock('Fulano de Tal', null), 'Nome: Fulano de Tal\nCPF: Não informado\nRG: \nTEL: .');
  const n = acceptedNotice(['FSA-1', 'FSA-2'], 'L330', 'Fulano');
  assert.equal(n.title, 'Atendimento aceito · FSA-1, FSA-2');
  assert.match(n.chat, /FSA-1, FSA-2 \(L330\) aceito por Fulano/);
  assert.match(unansweredNotice(['FSA-9'], 'L12').body, /expirou em 2 h/);
  for (const t of NOTICE_TEMPLATES) {
    const body = t.components[0];
    assert.ok(!/^\{\{|\}\}$/.test(body.text.trim()), `${t.name}: corpo não pode começar ou terminar com variável`);
    assert.equal(t.category, 'UTILITY');
  }
});

test('oferta de teste: chamado fictício, mensagem válida e avisos marcados', async () => {
  const { testOfferTicket, testNotice, isTestOffer, acceptedNotice } = await import('../lib/dispatch.ts');
  const t = testOfferTicket(9, 'Vitória da Conquista/BA');
  assert.equal(t.key, 'TESTE-9');
  const m = offerMessage(9, [t]);
  assert.equal(m.name, 'oferta_atendimento');
  assert.equal(m.payload, 'aceitar:9');
  assert.deepEqual(m.body, ['TESTE-9', 'L999 - Vitória da Conquista/BA', 'CPU - PDV 1', 'Teste da distribuição, não é um chamado real']);
  assert.ok(isTestOffer('test') && !isTestOffer('live') && !isTestOffer(null));
  const n = testNotice(acceptedNotice(['TESTE-9'], 'L999', 'Fulano'));
  assert.match(n.title, /^Teste · Atendimento aceito/);
  assert.match(n.chat, /^\[Teste\] /);
});

test('recusar: payload próprio e respostas sem citar o Caju OS', async () => {
  const { declinePayloadOffer, ACCEPT_REPLY_WON, DECLINE_REPLY, previewText } = await import('../lib/dispatch.ts');
  assert.equal(declinePayloadOffer('recusar:15'), 15);
  assert.equal(declinePayloadOffer('aceitar:15'), null);
  assert.doesNotMatch(ACCEPT_REPLY_WON, /Caju OS/);
  assert.match(ACCEPT_REPLY_WON, /entrar em contato/);
  assert.ok(DECLINE_REPLY.length > 0);
  const p = previewText(offerMessage(3, [ticket({ key: 'FSA-1' })]));
  assert.match(p, /🔧 Chamado: FSA-1/);
  assert.match(p, /\[Aceitar\] \[Recusar\]/);
  assert.doesNotMatch(p, /Ver chamado/);
});

test('versões da oferta: em uso a de R$ 70 (Utilidade); a candidata é aviso sem emoji', async () => {
  const { OFFER_VERSIONS, ACTIVE_OFFER_VERSION, DISPATCH_TEMPLATES } = await import('../lib/dispatch.ts');
  assert.equal(ACTIVE_OFFER_VERSION, 'r70');
  assert.deepEqual(DISPATCH_TEMPLATES.map((t) => t.name), ['oferta_atendimento', 'oferta_atendimento_grupo', 'chamado_disponivel', 'chamados_disponiveis', 'oferta_valor', 'oferta_valor_grupo']);
  const aviso = OFFER_VERSIONS.aviso.singleBody('1', '2', '3', '4');
  assert.doesNotMatch(aviso, /\p{Extended_Pictographic}|Agora é com você/u);
  assert.match(aviso, /Valor: a combinar com a equipe/);
});

test('modelo em uso: Utilidade primeiro; sem nenhuma, a preferida aprovada em Marketing', async () => {
  const { pickOfferVersion } = await import('../lib/dispatch.ts');
  const ok = (name: string, category = 'UTILITY') => ({ name, status: 'APPROVED', category });
  assert.equal(pickOfferVersion([]), 'r70');
  assert.equal(pickOfferVersion([ok('chamado_disponivel'), ok('chamados_disponiveis')]), 'aviso');
  assert.equal(pickOfferVersion([ok('chamado_disponivel'), ok('chamados_disponiveis'), ok('oferta_valor'), ok('oferta_valor_grupo')]), 'valor');
  assert.equal(pickOfferVersion([ok('chamado_disponivel'), ok('chamados_disponiveis', 'MARKETING')]), 'aviso', 'nenhuma em Utilidade: a aprovada em Marketing');
  assert.equal(pickOfferVersion([ok('chamado_disponivel', 'MARKETING'), ok('chamados_disponiveis', 'MARKETING'), ok('oferta_valor', 'MARKETING'), ok('oferta_valor_grupo', 'MARKETING')]), 'valor');
  assert.equal(pickOfferVersion([ok('oferta_valor', 'MARKETING'), ok('oferta_valor_grupo', 'MARKETING'), ok('chamado_disponivel'), ok('chamados_disponiveis')]), 'aviso', 'Utilidade vence');
  assert.equal(pickOfferVersion([ok('chamado_disponivel'), { name: 'chamados_disponiveis', status: 'PENDING', category: 'UTILITY' }]), 'r70');
  assert.equal(offerMessage(1, [ticket({ key: 'A' })], 'aviso').name, 'chamado_disponivel');
});

test('oferta manual: valor como campo, chamados de lojas diferentes e mesma cidade', async () => {
  const { offerValue, sameCity, DEFAULT_OFFER_VALUE } = await import('../lib/dispatch.ts');
  const one = offerMessage(4, [ticket({ key: 'FSA-1' })], 'valor', 'R$ 90,00');
  assert.equal(one.name, 'oferta_valor');
  assert.equal(one.body.length, 5);
  assert.equal(one.body[4], 'R$ 90,00');
  assert.equal(offerMessage(4, [ticket({ key: 'FSA-1' })], 'valor').body[4], DEFAULT_OFFER_VALUE);
  assert.equal(offerMessage(4, [ticket({ key: 'FSA-1' })], 'r70', 'R$ 90,00').body.length, 4, 'modelo sem campo de valor ignora o valor');
  const many = offerMessage(5, [ticket({ key: 'FSA-1', storeCode: 'L1' }), ticket({ key: 'FSA-2', storeCode: 'L2' })], 'valor', '  ');
  assert.equal(many.name, 'oferta_valor_grupo');
  assert.deepEqual(many.body.slice(0, 2), ['2 (FSA-1, FSA-2)', 'L1, L2 - Patos de Minas/MG']);
  assert.equal(many.body[3], DEFAULT_OFFER_VALUE);
  assert.equal(offerValue('x'.repeat(200)).length, 60);
  assert.ok(sameCity('Patos de Minas/MG', 'patos de minas'));
  assert.ok(sameCity('Ribeirão das Neves - MG', 'Ribeirao Das Neves/MG'));
  assert.ok(!sameCity('Patos de Minas/MG', 'Patos/PB'));
  assert.ok(!sameCity('Santa Luzia/MG', 'Santa Luzia/PB'));
  assert.ok(!sameCity(null, 'Recife'));
});
