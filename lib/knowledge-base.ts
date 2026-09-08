export type KBArticle = {
  id: string;
  title: string;
  category: 'hardware' | 'procedimento' | 'jira' | 'testes';
  tags: string[];
  summary: string;
  contentMarkdown: string;
};

export const DEFAULT_KB_ARTICLES: KBArticle[] = [
  {
    id: 'cpu-travando',
    title: 'Como resolver CPU travando em loja',
    category: 'hardware',
    tags: ['cpu', 'superaquecimento', 'pdv', 'desempenho'],
    summary: 'Guia passo a passo para diagnosticar e solucionar lentidões e travamentos em CPUs de loja.',
    contentMarkdown: `### Diagnóstico de CPU Travando
1. **Verificação de Temperatura e Cooler:** Verificar se as saídas de ar estão obstruídas por poeira ou se a ventoinha está parada.
2. **Uso de Memória e Disco:** Checar no Gerenciador de Tarefas se há consumo acima de 90% em CPU ou disco.
3. **Fonte de Alimentação:** Testar estabilidade das tensões elétricas da tomada e do no-break da loja.
4. **Procedimento de Solução:**
   - Realizar limpeza física com ar comprimido.
   - Substituir pasta térmica se o processador exceder 80°C.
   - Substituir HD por SSD se constatada lentidão de I/O.
   - Atualizar a imagem oficial do Caju OS / PDV.`
  },
  {
    id: 'testes-obrigatorios',
    title: 'Testes obrigatórios por categoria de equipamento',
    category: 'testes',
    tags: ['checklist', 'testes', 'qualidade'],
    summary: 'Checklist obrigatório de testes antes de finalizar qualquer chamado em campo.',
    contentMarkdown: `### Checklist de Testes em Campo
- **CPU / Workstation:** Reinicialização completa, teste de stress de 5 min, validação de portas USB e placa de rede.
- **Monitores:** Teste de resolução nativa, verificação de pixels mortos e cabo VGA/HDMI fixado com parafusos.
- **Teclado / Barcode Scanner:** Leitura de 5 códigos de barras de teste no sistema PDV.
- **Thin Client:** Conectividade RDP/Terminal com o servidor local e carregamento do sistema.
- **Impressora Fiscal / Não-Fiscal:** Impressão de página de teste e verificação da guilhotina.`
  },
  {
    id: 'quando-trocar-peca',
    title: 'Quando trocar determinada peça em campo',
    category: 'hardware',
    tags: ['troca', 'peças', 'substituição', 'rat'],
    summary: 'Critérios de aprovação para substituição imediata de componentes.',
    contentMarkdown: `### Critérios para Troca de Peça
- **Memória RAM:** Telas azuis frequentes (BSOD), falha no teste de diagnóstico MemTest86 ou bip ao ligar.
- **HD / SSD:** Erro S.M.A.R.T. no boot, travamento ao gravar arquivos ou ruídos mecânicos no HD.
- **Fonte de Alimentação:** Computador desliga sozinho ao abrir o PDV ou não dá sinal de vida.
- **Cabo VGA / DisplayPort:** Imagem trêmula, linhas horizontais ou tonalidade alterada.`
  },
  {
    id: 'procedimento-rat',
    title: 'Procedimento correto de preenchimento da RAT',
    category: 'procedimento',
    tags: ['rat', 'relatorio', 'evidencia', 'validacao'],
    summary: 'Padrão exigido para preenchimento de Relatório de Atendimento Técnico.',
    contentMarkdown: `### Instruções para RAT
1. **Horários:** Informar com precisão Horário de Chegada, Início do Atendimento e Término.
2. **Campos Obrigatórios:**
   - **Problema Identificado:** Descrição clara da falha encontrada ao chegar na loja.
   - **Testes Feitos:** Lista de procedimentos efetuados.
   - **Peça a ser Trocada:** Número de série e modelo da peça retirada e da instalada.
3. **Evidências:** Anexar foto legível da RAT assinada pelo gerente da loja e fotos do equipamento funcionando.`
  },
  {
    id: 'como-preencher-campos-jira',
    title: 'Como preencher campos do Jira via Caju OS',
    category: 'jira',
    tags: ['jira', 'tecnico', 'customfields', 'agendamento'],
    summary: 'Mapeamento de campos obrigatórios entre o Caju OS e os custom fields da API do Jira.',
    contentMarkdown: `### Mapeamento dos Campos no Jira
- **Nome do Técnico:** Atualizar no campo customizado de Técnico Responsável.
- **CPF & Telefone:** Preencher sem pontos ou traços para correta validação.
- **Horários do Chamado:** Informar início/fim no formato ISO (YYYY-MM-DDTHH:mm).
- **Status do Agendamento:** Atualizar para "Agendado", "Técnico em Campo" ou "Concluído".`
  }
];
