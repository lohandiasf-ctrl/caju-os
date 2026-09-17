// Texto do aviso do agente. A IA escreve; se ela falhar, o texto de reserva
// sai igual em conteúdo, só menos redondo — aviso de atraso não pode depender
// de modelo disponível (mesma regra do OCR e do geocode).

// Só o tipo: import de valor entre módulos de `lib/` quebra os testes, que
// rodam em Node puro e não resolvem o atalho `@/`. `import type` some na
// compilação.
import type { AgentFinding, AgentRule } from '@/lib/agent-rules';

// Como cada regra se chama para quem lê o aviso. Fica aqui, com o texto.
const RULE_LABEL: Record<AgentRule, string> = {
  stalled: 'Parado na etapa',
  schedule_overdue: 'Agendamento vencido',
  in_service_no_evidence: 'Em campo sem evidência',
  shipment_late: 'Spare atrasado',
};

// Quantos chamados aparecem no texto de cada regra. O resto vira "e mais N" —
// a lista inteira está na tela, o aviso é um empurrão, não um relatório.
const PER_RULE = 6;

export function groupByRule(findings: AgentFinding[]): Array<[string, AgentFinding[]]> {
  const groups = new Map<string, AgentFinding[]>();
  for (const finding of findings) {
    groups.set(finding.rule, [...(groups.get(finding.rule) ?? []), finding]);
  }
  return [...groups].map(([rule, items]) => [RULE_LABEL[rule as AgentFinding['rule']] ?? rule, items]);
}

function line(items: AgentFinding[]): string {
  const shown = items.slice(0, PER_RULE).map((item) => item.ticketKey).join(', ');
  const rest = items.length - PER_RULE;
  return rest > 0 ? `${shown} e mais ${rest}` : shown;
}

// O que a IA recebe: só o que as regras acharam, já resumido.
export function noticeContext(findings: AgentFinding[]): string {
  return groupByRule(findings).map(([label, items]) => [
    `${label} (${items.length}):`,
    ...items.slice(0, PER_RULE).map((item) => `- ${item.ticketKey}: ${item.detail}`),
    items.length > PER_RULE ? `- e mais ${items.length - PER_RULE} chamados nesta situação` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

const PROMPT = `Você escreve o aviso do agente de operações do Caju OS, que atende chamados de suporte de TI em lojas de varejo no Brasil.

Recebe uma lista de chamados atrasados, já apurada. Sua tarefa é escrever o aviso para a equipe.

Regras:
- Português do Brasil, direto, sem saudação, sem "prezados", sem assinatura.
- Use SOMENTE os chamados e números da lista. Nunca invente FSA, prazo ou nome.
- Uma linha por grupo, começando pelo grupo com mais chamados. Cite as FSAs.
- No máximo 6 linhas no total. Sem introdução e sem fecho.
- Não mande ninguém escrever no Jira nem falar com o cliente: diga o que verificar.`;

export function buildNoticeMessages(findings: AgentFinding[]) {
  return [
    { role: 'system', content: PROMPT },
    { role: 'user', content: noticeContext(findings) },
  ];
}

// Texto de reserva: mesmas informações, formato fixo.
export function fallbackNotice(findings: AgentFinding[]): string {
  return groupByRule(findings).map(([label, items]) => `${label} (${items.length}): ${line(items)}`).join('\n');
}

// Cabeçalho que identifica o agente na caixa de mensagens. O corpo vem da IA,
// e sem isso a mensagem parece recado de colega.
export function noticeMessage(body: string, findings: AgentFinding[]): string {
  const critical = findings.filter((finding) => finding.severity === 'critical').length;
  const header = `🤖 Agente do Caju OS · ${findings.length} ${findings.length === 1 ? 'chamado precisa' : 'chamados precisam'} de atenção${critical ? ` (${critical} crítico${critical === 1 ? '' : 's'})` : ''}`;
  return `${header}\n\n${body.trim()}`;
}
