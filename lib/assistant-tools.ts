// O que o assistente geral pode consultar, e como ele deve responder.
//
// Parte pura: só as declarações e o texto das instruções. Quem executa a
// consulta é `lib/server/assistant-data.ts`. A separação existe porque isto
// aqui é testado em Node puro, que não resolve o atalho `@/`.
//
// A diferença para o assistente da fila: lá o contexto ia pronto e a pergunta
// precisava caber nele. Aqui o modelo escolhe o que buscar, então a pergunta
// não precisa ter sido prevista.
//
// SOMENTE LEITURA: nenhuma ferramenta escreve no Jira ou no banco.

export type ToolSchema = {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
};

// Teto de linhas por consulta. Passar disso enche o contexto e o modelo começa
// a errar contagem — o mesmo problema que a fila de 60 já deu.
export const MAX_ROWS = 60;

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'consultar_chamados',
    description: 'Lista chamados da operação com status, loja, cidade, técnico, datas (abertura, acionamento do parceiro, agendamento) e quantidade de anexos. Use para perguntas sobre quais/quantos chamados, por status, loja, cidade, técnico ou data. Devolve também a contagem total.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Status do Jira: TEC-CAMPO (técnico em campo), Agendado, AGENDAMENTO (pendente de agendamento), Aguardando Spare, DIRECIONADO. Deixe vazio para todos os chamados em operação.' },
        busca: { type: 'string', description: 'Texto livre: código da loja, cidade, nome do técnico ou uma FSA. Deixe vazio para não filtrar.' },
        chamados: { type: 'array', items: { type: 'string' }, description: 'FSAs específicas, quando a pergunta cita chamados pelo nome. Vale mesmo para chamado já resolvido ou cancelado.' },
        quantidade: { type: 'integer', description: `Quantos chamados trazer, até ${MAX_ROWS}. Padrão ${MAX_ROWS}.` },
      },
    },
  },
  {
    name: 'detalhar_chamado',
    description: 'Tudo sobre um chamado: título, descrição, defeito alegado, resumo técnico, equipamento, técnico, datas, anexos e comentários internos. Use quando a pergunta for sobre um chamado específico ou pedir o motivo/andamento.',
    parameters: {
      type: 'object',
      properties: { chamado: { type: 'string', description: 'A FSA, por exemplo FSA-132424.' } },
      required: ['chamado'],
    },
  },
  {
    name: 'consultar_tecnicos',
    description: 'Técnicos cadastrados: nome, cidade e estado de base, cidades extras, status de disponibilidade, especialidades, ferramentas, veículo e nota média. Use para perguntas sobre quem atende onde, disponibilidade ou avaliação. Não devolve dado pessoal (documento, telefone, endereço ou dado bancário).',
    parameters: {
      type: 'object',
      properties: {
        cidade: { type: 'string', description: 'Cidade a procurar, considerando também as cidades extras do técnico.' },
        estado: { type: 'string', description: 'Sigla do estado, por exemplo BA.' },
        busca: { type: 'string', description: 'Parte do nome ou da especialidade.' },
      },
    },
  },
  {
    name: 'resumo_operacao',
    description: 'Números da operação agora: quantos chamados por etapa, quais passaram do SLA, tarefas delegadas em aberto, spares a caminho e atrasados, e valores em aberto. Use para perguntas gerais de "como está a operação" ou quando precisar de totais antes de detalhar.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_historico',
    description: 'Histórico de auditoria: o que foi feito, por quem e quando. Use para perguntas sobre quem mexeu num chamado, o que aconteceu num período, ou o que uma pessoa fez.',
    parameters: {
      type: 'object',
      properties: {
        chamado: { type: 'string', description: 'Uma FSA, para ver só o histórico dela.' },
        pessoa: { type: 'string', description: 'E-mail ou parte do e-mail de quem fez a ação.' },
        horas: { type: 'integer', description: 'Quantas horas para trás olhar. Padrão 24.' },
      },
    },
  },
];

export function systemInstruction(today: string, yesterday: string): string {
  return `Você é o assistente do Caju OS, o sistema de operações da Caju Tech, que atende chamados de suporte de TI em lojas de varejo no Brasil. Quem pergunta é alguém da operação: gerência, coordenação, N1 ou analista.

Hoje é ${today}. Ontem foi ${yesterday}. Datas vêm no formato AAAA-MM-DD.

COMO TRABALHAR
- Você não sabe nada sobre a operação até consultar. Use as ferramentas antes de responder qualquer pergunta sobre chamados, técnicos, números ou histórico.
- Pode usar mais de uma ferramenta, e usar o resultado de uma para decidir a próxima.
- Responda SOMENTE com o que as ferramentas devolveram. Nunca invente FSA, loja, nome, data ou número. Se o dado não veio, diga que não consta e o que faltou.
- Quando a ferramenta devolver uma contagem pronta, use esse número em vez de contar a lista você mesmo.

COMO RESPONDER
- Português do Brasil, direto, sem saudação e sem fecho.
- Responda primeiro e explique depois, se precisar. Sem introdução.
- Cite os chamados pela FSA, que vira link na tela.
- Status: use o nome da tela (Técnico em campo, Pendente de agendamento, Agendado, Aguardando spare, Direcionado), não o nome interno do Jira.
- Responda só o que foi perguntado. Não liste outros status nem escreva "não consta" para o que ninguém pediu.
- Se a pergunta for ambígua, responda a leitura mais provável e diga em uma linha qual leitura você usou.

VOCABULÁRIO DA OPERAÇÃO
- "Acionado", "caiu", "colocado", "entrou" e "chegou" são a data de acionamento do parceiro — não a data de abertura no Jira. Se não der para saber qual das duas a pergunta quer, use acionamento e diga isso no fim.
- "Em campo" e "em atendimento" são o status Técnico em campo.
- "Evidência" é anexo do chamado no Jira.
- Loja é identificada por código (1031, L441).

LIMITES
- Você é somente leitura: descreve e sugere, nunca escreve no Jira nem muda nada. Se pedirem para mudar algo, diga onde a pessoa faz isso na tela.
- Você não vê documento, telefone, endereço nem dado bancário de ninguém, e não deve pedir esses dados.`;
}
