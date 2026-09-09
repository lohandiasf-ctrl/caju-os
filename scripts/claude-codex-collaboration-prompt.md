# Prompt para o Claude preparar colaboração com Codex

Cole este texto no Claude dentro do projeto Caju OS.

---

Você é o Claude trabalhando no projeto Caju OS. Sua tarefa é preparar o repositório para que Claude e Codex consigam trabalhar juntos no mesmo projeto com segurança, rastreabilidade e sem retrabalho.

Contexto do projeto:

- O sistema Caju OS saiu do GPT Sites e agora roda/publica via Cloudflare.
- O desenvolvimento pode ser feito tanto por Claude quanto por Codex.
- As duas IAs devem trabalhar no mesmo repositório Git, mas nunca diretamente na `main` sem revisão.
- O sistema integra Jira, Cloudflare, Firebase/autenticação, banco de dados, notificações, chamadas de voz, gestão operacional, técnicos, anexos/evidências, financeiro e fluxos de chamado.
- O objetivo é deixar uma estrutura clara para qualquer IA continuar o trabalho sem depender da memória de uma conversa.

Sua missão:

1. Inspecione o projeto atual.

   - Identifique framework, rotas, APIs, banco, scripts de build/test/deploy e estrutura de pastas.
   - Identifique se o projeto principal está na raiz ou em subpasta.
   - Não apague arquivos sem autorização.
   - Não exponha segredos ou tokens.

2. Crie ou atualize estes arquivos na raiz real do app:

   - `AGENTS.md`
   - `CLAUDE.md`
   - `docs/AI_HANDOFF.md`
   - `docs/ARCHITECTURE.md`
   - `docs/DEPLOYMENT.md`
   - `docs/JIRA_FIELDS.md`
   - `docs/KNOWN_BUGS.md`
   - `docs/PRODUCT_REQUIREMENTS.md`
   - `docs/CHANGELOG.md`
   - `docs/TESTING_CHECKLIST.md`
   - `docs/WORKFLOW_RULES.md`

3. Conteúdo obrigatório do `AGENTS.md`:

   - Instruções para o Codex.
   - Usar branch com prefixo `codex/`.
   - Antes de editar: `git status`, entender alterações existentes e preservar trabalho do usuário.
   - Para mudanças de código: rodar testes relevantes e build quando possível.
   - Não commitar arquivos temporários, builds antigos, logs, pacotes `.tar.gz`, `.exe` ou segredos.
   - Não publicar produção sem pedido explícito do usuário.
   - Sempre atualizar `docs/AI_HANDOFF.md` e `docs/CHANGELOG.md` quando fizer mudança relevante.
   - Registrar decisões técnicas importantes.
   - Para Cloudflare: seguir `docs/DEPLOYMENT.md`.

4. Conteúdo obrigatório do `CLAUDE.md`:

   - Instruções para o Claude.
   - Usar branch com prefixo `claude/`.
   - Antes de começar: ler `AGENTS.md`, `CLAUDE.md`, `docs/AI_HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/KNOWN_BUGS.md`, `docs/WORKFLOW_RULES.md`.
   - Não trabalhar direto na `main`, salvo autorização explícita.
   - Sempre deixar handoff claro para Codex.
   - Não duplicar funcionalidades já existentes sem procurar antes.
   - Não alterar fluxos Jira/financeiro/produção sem validação.

5. Conteúdo obrigatório do `docs/AI_HANDOFF.md`:

   Estruture assim:

   - Estado atual do sistema
   - Última versão estável conhecida
   - Stack técnica
   - Onde ficam as rotas principais
   - Onde ficam APIs principais
   - Onde fica schema/banco
   - Como rodar local
   - Como testar
   - Como publicar
   - Integrações externas
   - Funcionalidades já existentes
   - Bugs conhecidos
   - Próximas prioridades
   - Últimas decisões de produto
   - Como Claude deve passar trabalho para Codex
   - Como Codex deve passar trabalho para Claude

6. Conteúdo obrigatório do `docs/ARCHITECTURE.md`:

   Documente:

   - Frontend
   - Backend/API routes
   - Banco/tabelas
   - Autenticação
   - Jira
   - Cloudflare
   - Notificações
   - Chamadas de voz/grupo
   - Gestão de chamados
   - Gestão de técnicos
   - Anexos/evidências
   - Auditoria e histórico
   - Tarefas delegadas
   - Inteligência operacional/IA

7. Conteúdo obrigatório do `docs/DEPLOYMENT.md`:

   Documente sem segredos reais:

   - Como instalar dependências
   - Como rodar local
   - Como rodar testes
   - Como gerar build
   - Como publicar no Cloudflare
   - Quais variáveis de ambiente são necessárias
   - Onde configurar variáveis no Cloudflare
   - Como validar produção depois do deploy
   - Como fazer rollback

   Liste variáveis esperadas, sem valores:

   - `JIRA_BASE_URL`
   - `JIRA_EMAIL`
   - `JIRA_API_TOKEN`
   - `JIRA_PROJECT_KEY`
   - variáveis Firebase usadas pelo projeto
   - variáveis Cloudflare/D1/R2 usadas pelo projeto
   - qualquer outra encontrada no código

8. Conteúdo obrigatório do `docs/JIRA_FIELDS.md`:

   Documente os campos Jira conhecidos, principalmente:

   - `customfield_12036` = Data/Hora - Agendamento
   - `customfield_12279` = Dados dos técnicos
   - `customfield_12316` = Nome do Técnico
   - `customfield_16237` = Telefone do Técnico
   - `customfield_11956` = RG
   - `customfield_16238` = CPF/CNPJ Técnico
   - `customfield_11963` = Número Contato

   Inclua observação importante:

   - Se um campo retornar erro `cannot be set. It is not on the appropriate screen`, o sistema deve usar fallback por `customfield_12279`/ADF ou registrar fila de sincronização, e não travar o fluxo local.
   - Para agendar, o Jira exige técnico + data/hora antes da transição.
   - A transição para “Agendado” pode usar ID `9`, mas o sistema deve consultar transições disponíveis quando possível.

9. Conteúdo obrigatório do `docs/KNOWN_BUGS.md`:

   Liste bugs resolvidos e pendentes, incluindo:

   - notificação/chamada no app e área de trabalho;
   - quadrado branco no WebView;
   - chamada minimizada;
   - tela compartilhada preta;
   - fullscreen em mobile;
   - sincronização Jira;
   - anexos/evidências;
   - busca de técnico;
   - calendário/horários;
   - fluxo Kanban/filtros;
   - botão WhatsApp usando sessão aberta no Chrome;
   - desempenho/60 fps sem degradar UI.

   Marque cada item como:

   - Resolvido
   - Parcial
   - Pendente
   - Precisa validar em produção

10. Conteúdo obrigatório do `docs/PRODUCT_REQUIREMENTS.md`:

   Documente requisitos do produto:

   - O sistema é uma plataforma de gestão operacional/field service/helpdesk integrado ao Jira.
   - Deve recomendar melhor técnico usando distância, cidade/região, disponibilidade, especialidade, desempenho, ferramentas, custo de deslocamento, prioridade e lucro.
   - Deve ter artigos/checklists internos.
   - Deve validar evidências/fotos ilegíveis.
   - Cada mudança deve registrar colaborador, data/hora, valor anterior, valor novo, origem e motivo.
   - Deve ter tarefas delegadas ligadas ao chamado, com aceite, responsável, cobrança de andamento e notificação para gerente após vencimento.
   - Deve sincronizar alterações relevantes com Jira.
   - Deve preservar histórico e permitir recuperação/backup quando possível.

11. Conteúdo obrigatório do `docs/WORKFLOW_RULES.md`:

   Documente regras críticas:

   - Não alterar status do Jira ao trocar seleção; só alterar após clique explícito.
   - Não avançar para técnico em campo antes de agendar quando o Jira exigir fluxo.
   - Não permitir validação sem valores, evidências e status correto.
   - Evidência nova deve ser anexada como comentário/observação interna no Jira quando possível.
   - Alterações financeiras devem ser restritas à gerência, salvo regra diferente no código.
   - Toda automação deve deixar auditoria.
   - Produção só deve receber build testado.

12. Crie uma rotina sugerida de branches:

   Documente:

   ```bash
   git checkout main
   git pull
   git checkout -b claude/nome-da-tarefa
   npm install
   npm test
   npm run build
   git add .
   git commit -m "descrição clara"
   git push -u origin claude/nome-da-tarefa
   ```

   E para Codex:

   ```bash
   git checkout main
   git pull
   git checkout -b codex/nome-da-tarefa
   npm test
   npm run build
   git add .
   git commit -m "descrição clara"
   git push -u origin codex/nome-da-tarefa
   ```

13. Atualize `.gitignore` se necessário.

   Garanta que não sejam commitados:

   - `node_modules/`
   - `.env`
   - `.env.local`
   - logs
   - builds temporários
   - pacotes `.tar.gz`
   - instaladores `.exe`
   - caches
   - arquivos temporários do Codex/Claude

   Não remova arquivos rastreados sem avaliar impacto.

14. Se o projeto ainda não tiver scripts adequados, sugira no `package.json`, mas não quebre o que já existe:

   - `test`
   - `build`
   - `lint`
   - `dev`
   - `deploy`

15. Ao finalizar:

   - Rode `git status --short`.
   - Rode testes/build se o ambiente permitir.
   - Faça commit em branch própria, não na `main`, salvo se o usuário mandou explicitamente.
   - Atualize `docs/AI_HANDOFF.md` com o que você criou.
   - Responda com:
     - arquivos criados/alterados;
     - comandos executados;
     - o que ficou pronto;
     - o que ainda precisa de decisão humana;
     - nome da branch/commit.

Critérios de aceite:

- Qualquer IA deve conseguir abrir o projeto, ler a documentação e saber exatamente como continuar.
- Claude e Codex devem ter regras compatíveis.
- Deploy Cloudflare deve estar documentado.
- Campos do Jira devem estar documentados.
- Fluxos críticos do sistema devem estar documentados.
- Segredos não podem ser expostos.
- Produção não pode ser publicada sem autorização explícita.

Comece agora inspecionando o repositório e criando essa estrutura.
