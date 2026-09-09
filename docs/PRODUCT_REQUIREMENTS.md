# Requisitos de produto — Caju OS

O que o sistema **deve** fazer. Use isto para saber se uma mudança está no
escopo ou é criação nova, e para não remover comportamento por engano.

---

## Propósito

Plataforma de gestão operacional / field service / helpdesk integrada ao Jira
Cloud. O Jira é a fonte da verdade do chamado (abertura, cliente, SLA). O Caju
OS adiciona o processo operacional em volta: triagem, agendamento, escolha de
técnico, execução em campo, evidências, validação, financeiro e auditoria.

Usuários internos por papel: `gerencia`, `coordenador`, `n1`, `analista`,
`tecnico`.

## Recomendação de técnico

Ao agendar, o sistema recomenda o melhor técnico combinando **8 fatores**
(`recommendTechnicians()` em `lib/operational-intelligence.ts`):

1. distância até a cidade do chamado
2. cidade / região atendida
3. disponibilidade (online / ocupado / pausa / offline)
4. especialidade compatível com a categoria
5. histórico de desempenho (média e nº de avaliações)
6. ferramentas necessárias
7. custo de deslocamento (R$/km)
8. prioridade do chamado e lucratividade

Cada técnico recomendado mostra as **razões** da pontuação. Fatores extras
(não pedidos originalmente): técnico aprovado, técnico com veículo.

Limitação atual: distância é estimada por faixas (mesma cidade / região /
estado / fora), porque os técnicos não têm coordenadas no banco.

## Base de conhecimento

O sistema tem artigos / checklists internos, escolhidos por categoria do
chamado (`knowledgeArticles()`). Títulos atuais: "Como resolver CPU travando",
"Testes obrigatórios por categoria", "Quando trocar determinada peça",
"Procedimento de RAT", "Como preencher campos do Jira".

## Validação de evidências

O sistema valida foto de evidência quanto a estar **escura ou ilegível**
(brilho médio e contraste). Hoje há duas implementações — a do fluxo N1
**avisa**, a do detalhe do chamado **bloqueia** o upload. Requisito: alertar o
técnico enquanto a foto ainda pode ser refeita, sem impedir de forma que ele
fique preso na loja sem fechar o chamado.

## Leitura automática da RAT

A RAT (Relatório de Atendimento Técnico) é **preenchida à mão** pelo técnico e
fotografada em campo. O sistema lê a imagem por IA e pré-preenche os 3 campos
do resumo técnico (problema / testes / peça), deixando-os editáveis. É
conveniência: falha nunca bloqueia o preenchimento manual.

## Auditoria

Toda mudança relevante registra, em `operational_audit` (append-only):

- colaborador
- data e horário
- valor anterior
- valor novo
- origem: `sistema` ou `Jira`
- motivo da alteração

Mudanças importantes de chamado também geram um `ticket_snapshot` do estado
anterior. **Nunca** editar ou apagar registros de auditoria.

## Tarefas delegadas

Ligadas a um chamado. Fluxo:

1. Alguém cria a tarefa (ex.: "Entrar em contato com a loja L252").
2. Um funcionário **aceita** — o sistema registra o responsável.
3. Após ~30 min sem conclusão, o sistema **pergunta o andamento** ao
   responsável.
4. Após o vencimento (`dueAt`), o sistema **notifica o gerente**, uma única vez.
5. O histórico fica ligado ao chamado.

Implementado por `operational_tasks` + varredura agendada (`/api/tasks/sweep`,
cron a cada 10 min). As notificações vão pela caixa de entrada
(`employee_messages`).

## Sincronização com o Jira

Alterações relevantes do processo operacional são refletidas no Jira (campos do
técnico, agendamento, resumo técnico, valores). Escrita que falha por rede vai
para a outbox `jira_sync_jobs` e é reprocessável — o fluxo local nunca trava
por causa do Jira. Regras de campo e transição: `docs/JIRA_FIELDS.md`.

## Financeiro

Valores de cliente, pagamento de técnico, chave PIX, dados bancários e venda de
peças. **Alterações financeiras são restritas a `gerencia`** (salvo regra
diferente já codificada — a rota `/api/operations` valida
`hasFinancialChange()` + papel). O catálogo de peças (`parts_catalog`) alimenta
o campo de venda de peças; qualquer papel operacional consulta o preço, só
gerência altera o catálogo.

## Histórico e recuperação

O sistema preserva histórico (auditoria, snapshots, `ticket_history`) e permite
backup administrativo (`/api/admin/export`, JSON de 12 tabelas). Nota: o export
**não** cobre `app_users`, `ticket_evidence` nem `employee_messages`.

## Comunicação

- Chat direto (1-a-1) e em grupo, com anexos.
- Chamadas de voz 1-a-1 e em grupo, com tela compartilhada.
- Presença (online / ocupado / pausa / almoço / não perturbe / offline), com
  preferências de notificação por tipo e quiet hours.
- Notificações in-app e no desktop (via Tauri).

## Feedback interno

Canal aberto a **todos os papéis** para sugerir melhorias e relatar problemas
do próprio sistema (distinto do chamado operacional). Voto por pessoa para
apoiar ideias; triagem (estado: aberto → em análise → planejado → concluído →
não será feito) por `gerencia` e `coordenador`, com resposta visível ao autor.

## Não-requisitos / o que preservar

- O visual premium (blur, transparência, transições). Não simplificar em nome
  de FPS — já foi tentado e rejeitado.
- O EXE do desktop é casca fina; não embutir lógica que exija recompilar a
  cada mudança web.
- Não declarar "tempo real" o que depende de polling.
