import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_KIND_LIST, commentAlerts, DEFAULT_WINDOW, detectAlerts, inDeliveryWindow, notesFor, parsePrefs, parseWindow, prefsWithDefaults, UPDATE_AUDIT_ACTION, windowWithDefaults, type QueueIssue } from '../lib/push-alerts.ts';
import { CLOSED_WORKFLOW_STATUSES, SLA_HOURS, slaHoursOf, WORKFLOW_STATUS_LABEL } from '../lib/operational-sla.ts';

const sla = { closed: CLOSED_WORKFLOW_STATUSES, hoursOf: slaHoursOf, label: WORKFLOW_STATUS_LABEL };
const NOW = Date.parse('2026-09-25T15:00:00Z'); // 12:00 em Brasília
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const H = 60 * MIN;

function issue(p: Partial<QueueIssue> & { key: string }): QueueIssue {
  return { summary: 'PDV não liga', status: 'TEC-CAMPO', createdAt: iso(10 * 24 * H), scheduledAt: null, store: '214', city: 'Osasco - SP', technicianName: null, ...p };
}

test('SLA do painel continua o mesmo depois de ir para lib/operational-sla', () => {
  assert.equal(SLA_HOURS.scheduling, 4);
  assert.equal(slaHoursOf('in_service'), 12);
  assert.equal(slaHoursOf('etapa-desconhecida'), 24);
  assert.ok(CLOSED_WORKFLOW_STATUSES.has('validated'));
});

test('chamado novo só quando entrou na fila há pouco', () => {
  const kinds = (i: QueueIssue) => detectAlerts([i], [], sla, NOW).map((a) => a.kind);
  assert.deepEqual(kinds(issue({ key: 'FSA-1', createdAt: iso(5 * MIN) })), ['new_ticket']);
  assert.deepEqual(kinds(issue({ key: 'FSA-2', createdAt: iso(3 * H) })), []);
});

test('sem agendamento: avisa ao cruzar 2 h, não para quem já estava atrasado', () => {
  const at = (ago: number) => detectAlerts([issue({ key: 'FSA-3', status: 'AGENDAMENTO', createdAt: iso(ago) })], [], sla, NOW).map((a) => a.kind);
  assert.deepEqual(at(2 * H + 5 * MIN), ['scheduling_overdue']);
  assert.deepEqual(at(1 * H), []);
  assert.deepEqual(at(9 * H), []); // atraso antigo: não vira enxurrada na primeira rodada
  const pedido = detectAlerts([issue({ key: 'FSA-4', status: 'AGENDAMENTO PEDIDO PELO CLIENTE', createdAt: iso(2 * H + MIN) })], [], sla, NOW);
  assert.equal(pedido[0]?.kind, 'scheduling_overdue');
});

test('horário agendado: 30 min depois e ainda "Agendado"', () => {
  const run = (status: string, ago: number) => detectAlerts([issue({ key: 'FSA-5', status, scheduledAt: iso(ago), technicianName: 'Rafael Almeida' })], [], sla, NOW);
  const missed = run('Agendado', 40 * MIN);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].kind, 'schedule_missed');
  assert.match(missed[0].body, /agendado para 11:20 com Rafael Almeida/);
  assert.equal(run('Agendado', 10 * MIN).length, 0);  // ainda dentro da tolerância
  assert.equal(run('TEC-CAMPO', 40 * MIN).length, 0); // já está em campo
  // reagendar gera outro aviso (a data entra na chave)
  assert.notEqual(run('Agendado', 40 * MIN)[0].dedupe, detectAlerts([issue({ key: 'FSA-5', status: 'Agendado', scheduledAt: iso(45 * MIN) })], [], sla, NOW)[0].dedupe);
});

test('SLA estourado pela etapa do fluxo, ignorando etapas fechadas', () => {
  const wf = (status: string, ago: number) => ({ ticketKey: 'FSA-6', status, createdAt: iso(ago), updatedAt: iso(ago) });
  const hit = detectAlerts([issue({ key: 'FSA-6' })], [wf('scheduling', 4 * H + 5 * MIN)], sla, NOW);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].kind, 'sla_overdue');
  assert.match(hit[0].body, /Loja 214 · Osasco - SP — em Pendente de agendamento há mais de 4 h/);
  assert.equal(detectAlerts([], [wf('validated', 30 * H)], sla, NOW).length, 0);
  assert.equal(detectAlerts([], [wf('in_service', 3 * H)], sla, NOW).length, 0);
});

test('preferências: padrão, valores gravados e JSON quebrado', () => {
  const d = prefsWithDefaults(null);
  assert.equal(d.sla_overdue, true);
  assert.equal(d.new_ticket, false);
  assert.equal(parsePrefs('{"new_ticket":true,"sla_overdue":false}').new_ticket, true);
  assert.equal(parsePrefs('{"new_ticket":true,"sla_overdue":false}').sla_overdue, false);
  assert.deepEqual(parsePrefs('nao é json'), d);
  assert.equal(Object.keys(d).length, ALERT_KIND_LIST.length);
});

test('avisos por pessoa: respeita o que ela desligou e resume quando são muitos', () => {
  const many = [1, 2, 3, 4, 5].map((n) => issue({ key: `FSA-${n}0`, status: 'Agendado', scheduledAt: iso(40 * MIN) }));
  const alerts = detectAlerts([...many, issue({ key: 'FSA-99', createdAt: iso(MIN) })], [], sla, NOW);
  const notes = notesFor(alerts, prefsWithDefaults({ new_ticket: true }));
  const summary = notes.find((n) => n.data.kind === 'schedule_missed');
  assert.ok(summary);
  assert.match(summary.body, /^5 chamados passaram do horário agendado: FSA-10, FSA-20, FSA-30, FSA-40…$/);
  assert.equal(summary.data.url, undefined);
  const single = notes.find((n) => n.data.kind === 'new_ticket');
  assert.equal(single?.data.url, '/ticket/FSA-99');
  assert.equal(notesFor(alerts, prefsWithDefaults({ schedule_missed: false })).length, 0); // new_ticket vem desligado por padrão
});

test('janela de entrega: desligada deixa passar; ligada respeita dia e horário de Brasília', () => {
  const sexta12h = new Date('2026-09-25T15:00:00Z'); // sexta, 12:00 em Brasília
  const sabado12h = new Date('2026-09-26T15:00:00Z');
  const sexta19h = new Date('2026-09-25T22:00:00Z');
  const trabalho = { enabled: true, days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' };
  assert.equal(inDeliveryWindow(sabado12h, DEFAULT_WINDOW), true);
  assert.equal(inDeliveryWindow(sexta12h, trabalho), true);
  assert.equal(inDeliveryWindow(sabado12h, trabalho), false);
  assert.equal(inDeliveryWindow(sexta19h, trabalho), false);
});

test('janela que vira a noite conta o dia do início', () => {
  const plantao = { enabled: true, days: [5], start: '22:00', end: '06:00' }; // sexta 22h → sábado 6h
  assert.equal(inDeliveryWindow(new Date('2026-09-26T04:00:00Z'), plantao), true); // sábado 01:00
  assert.equal(inDeliveryWindow(new Date('2026-09-27T04:00:00Z'), plantao), false); // domingo 01:00
});

test('janela salva inválida volta ao padrão sem quebrar', () => {
  assert.deepEqual(parseWindow('{lixo'), DEFAULT_WINDOW);
  assert.deepEqual(windowWithDefaults({ enabled: true, days: [9, 1, 1], start: '25:00', end: '17:30' }), { enabled: true, days: [1], start: '08:00', end: '17:30' });
});

test('comentário novo vai só para quem movimentou o chamado, e não para o próprio autor', () => {
  const recipients = new Set(['ana@caju.net', 'beto@caju.net', 'caio@caju.net']);
  const audit = [
    { ticketKey: 'FSA-9', actorEmail: 'ana@caju.net', action: 'Jira alterado para Agendado', createdAt: iso(2 * H) },
    { ticketKey: 'FSA-9', actorEmail: 'Beto@caju.net', action: UPDATE_AUDIT_ACTION, createdAt: iso(4 * MIN) },
  ];
  const [alert] = commentAlerts([{ id: '77', ticketKey: 'FSA-9', author: 'Caju OS', createdAt: iso(4 * MIN), body: 'UP - técnico a caminho' }], audit, recipients, NOW);
  assert.equal(alert.kind, 'new_comment');
  assert.deepEqual(alert.to, ['ana@caju.net']);
  assert.equal(notesFor([alert], parsePrefs(null), 'ana@caju.net').length, 1);
  assert.equal(notesFor([alert], parsePrefs(null), 'caio@caju.net').length, 0);
  assert.deepEqual(commentAlerts([{ id: '1', ticketKey: 'FSA-9', author: null, createdAt: iso(3 * H), body: 'antigo' }], audit, recipients, NOW), []);
});
