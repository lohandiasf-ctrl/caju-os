import test from 'node:test';
import assert from 'node:assert/strict';
import { agentFindings, SLA_HOURS, type AgentShipment, type AgentTicket, type AgentWorkflow } from '../lib/agent-rules.ts';
import { fallbackNotice, noticeContext, noticeMessage } from '../lib/agent-notice.ts';

const NOW = new Date('2026-09-18T12:00:00.000-03:00');
const hoursAgo = (value: number) => new Date(NOW.getTime() - value * 3_600_000).toISOString();

function workflow(partial: Partial<AgentWorkflow> = {}): AgentWorkflow {
  return { ticketKey: 'FSA-1', status: 'scheduling', createdAt: hoursAgo(1), updatedAt: hoursAgo(1), ...partial };
}

function ticket(partial: Partial<AgentTicket> = {}): AgentTicket {
  return { key: 'FSA-1', status: 'Agendado', updatedAt: hoursAgo(1), scheduledAt: null, ...partial };
}

function shipment(partial: Partial<AgentShipment> = {}): AgentShipment {
  return { ticketKey: 'FSA-1', trackingCode: 'BR123', status: 'Em trânsito', expectedAt: null, ...partial };
}

function run(input: { workflows?: AgentWorkflow[]; tickets?: AgentTicket[]; shipments?: AgentShipment[] }) {
  return agentFindings({ workflows: input.workflows ?? [], tickets: input.tickets ?? [], shipments: input.shipments ?? [], now: NOW });
}

test('chamado dentro do SLA da etapa não vira aviso', () => {
  assert.deepEqual(run({ workflows: [workflow({ status: 'scheduling', updatedAt: hoursAgo(SLA_HOURS.scheduling - 1) })] }), []);
});

test('chamado parado além do SLA vira aviso, e o dobro do SLA é crítico', () => {
  const [warning] = run({ workflows: [workflow({ updatedAt: hoursAgo(5) })] });
  assert.equal(warning.rule, 'stalled');
  assert.equal(warning.severity, 'warning');
  assert.match(warning.detail, /parado em scheduling há 5h \(limite 4h\)/);

  const [critical] = run({ workflows: [workflow({ updatedAt: hoursAgo(9) })] });
  assert.equal(critical.severity, 'critical');
});

test('chamado fechado não é cobrado', () => {
  for (const status of ['resolved', 'cancelled', 'validated', 'archived']) {
    assert.deepEqual(run({ workflows: [workflow({ status, updatedAt: hoursAgo(300) })] }), [], status);
  }
});

test('agendamento vencido conta a partir da hora marcada', () => {
  assert.deepEqual(run({ tickets: [ticket({ scheduledAt: hoursAgo(-2) })] }), [], 'agendamento futuro não é atraso');
  const [finding] = run({ tickets: [ticket({ scheduledAt: hoursAgo(1) })] });
  assert.equal(finding.rule, 'schedule_overdue');
  assert.equal(finding.severity, 'warning');
  assert.equal(run({ tickets: [ticket({ scheduledAt: hoursAgo(5) })] })[0].severity, 'critical');
  assert.deepEqual(run({ tickets: [ticket({ status: 'TEC-CAMPO', scheduledAt: hoursAgo(5) })] }), [], 'já foi para campo');
});

test('em campo sem anexo só vira aviso depois da carência', () => {
  assert.deepEqual(run({ tickets: [ticket({ status: 'TEC-CAMPO', updatedAt: hoursAgo(2), attachmentTypes: [] })] }), [], 'recém-chegado em campo');
  const [finding] = run({ tickets: [ticket({ status: 'TEC-CAMPO', updatedAt: hoursAgo(6), attachmentTypes: [] })] });
  assert.equal(finding.rule, 'in_service_no_evidence');
  assert.match(finding.detail, /sem nenhum anexo/);
  assert.deepEqual(run({ tickets: [ticket({ status: 'TEC-CAMPO', updatedAt: hoursAgo(6), attachmentTypes: ['image/jpeg'] })] }), [], 'com anexo não cobra');
});

// Sem `attachmentTypes` ninguém perguntou pelos anexos ao Jira; tratar isso
// como "sem evidência" cobraria a operação inteira por engano.
test('chamado sem dado de anexo não é acusado de estar sem evidência', () => {
  assert.deepEqual(run({ tickets: [ticket({ status: 'TEC-CAMPO', updatedAt: hoursAgo(20) })] }), []);
});

test('spare entregue não é cobrado, atrasado é', () => {
  assert.deepEqual(run({ shipments: [shipment({ status: 'Entregue', expectedAt: hoursAgo(50) })] }), []);
  const [finding] = run({ shipments: [shipment({ expectedAt: hoursAgo(50) })] });
  assert.equal(finding.rule, 'shipment_late');
  assert.equal(finding.severity, 'critical');
  assert.match(finding.detail, /BR123 passou 2 dias da data prevista/);
});

test('data ilegível não vira aviso', () => {
  assert.deepEqual(run({ workflows: [workflow({ createdAt: 'sem data', updatedAt: null })] }), []);
  assert.deepEqual(run({ shipments: [shipment({ expectedAt: 'depois' })] }), []);
});

test('o mais atrasado vem primeiro, porque o teto da rodada corta o fim', () => {
  const findings = run({
    workflows: [workflow({ ticketKey: 'FSA-2', updatedAt: hoursAgo(6) }), workflow({ ticketKey: 'FSA-3', updatedAt: hoursAgo(40) })],
  });
  assert.deepEqual(findings.map((finding) => finding.ticketKey), ['FSA-3', 'FSA-2']);
});

test('o aviso agrupa por regra e corta a lista longa', () => {
  const findings = run({
    workflows: Array.from({ length: 8 }, (_, index) => workflow({ ticketKey: `FSA-${index + 1}`, updatedAt: hoursAgo(6 + index) })),
    shipments: [shipment({ ticketKey: 'FSA-9', expectedAt: hoursAgo(50) })],
  });
  const text = fallbackNotice(findings);
  assert.match(text, /Parado na etapa \(8\): .* e mais 2/);
  assert.match(text, /Spare atrasado \(1\): FSA-9/);
  assert.match(noticeContext(findings), /e mais 2 chamados nesta situação/);
});

test('o aviso se identifica e conta os críticos', () => {
  const findings = run({ workflows: [workflow({ updatedAt: hoursAgo(40) })] });
  const text = noticeMessage('Parado na etapa (1): FSA-1', findings);
  assert.match(text, /^🤖 Agente do Caju OS · 1 chamado precisa de atenção \(1 crítico\)/);
  assert.match(text, /Parado na etapa \(1\): FSA-1/);
});
