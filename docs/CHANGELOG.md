# Changelog — Caju OS

Ordem cronológica inversa (mais recente no topo). Toda mudança relevante entra
aqui: o que mudou, por quê, e o que ficou pendente. Não é changelog de release
(não há tags) — é a linha do tempo do `main`.

Convenção: cada entrada tem a data, o commit (curto) e, quando aplicável,
"**Pendente:**" com o que a mudança deixou em aberto.

---

## 2026-09-24

### Aba "Anexos e evidências" do chamado ganha botão de remover

O pedido original de "poder remover evidência" era sobre esta aba geral do
chamado (`components/jira-ticket-details.tsx`), não só o Atendimento N1 — lá
só dava para visualizar e baixar.

- `lib/server/jira.ts` já tinha `deleteJiraAttachment` (criado para o N1);
  reaproveitado aqui.
- `app/api/jira/issues/[key]/attachments/[id]/route.ts`: novo `DELETE`, mesmos
  papéis do upload (gerência/coordenador/N1/analista). Devolve o chamado
  atualizado (igual o `POST` de upload já fazia), então a tela não precisa
  recarregar a lista à parte.
- `components/jira-ticket-details.tsx`: botão "Remover" (com confirmação) em
  cada anexo. Como esta aba não tem cópia local do anexo (a lista vem direto
  do Jira via `getJiraIssue`), remover do Jira já é remover "do sistema"
  inteiro — não precisou de tabela nem migration.

**Pendente:** usuário reportou que "Visualizar" abre o diálogo (título e
tamanho do arquivo aparecem) mas o conteúdo (imagem) não é exibido — ainda
não reproduzido/diagnosticado nesta sessão.

### Evidência do N1 pode ser removida (some do sistema e do Jira)

No "Atendimento N1" (`components/n1-ticket-actions.tsx`) só dava para anexar
foto/vídeo/RAT; uma evidência enviada por engano ficava presa lá.

- `lib/server/jira.ts`: `addJiraInternalEvidence` agora devolve o id do anexo
  criado no Jira (na mesma ordem dos arquivos); `deleteJiraAttachment` apaga um
  anexo do Jira (404 — já não existe lá — não é erro).
- `db/schema.ts` / `drizzle/0042_ticket_evidence_jira_attachment.sql`:
  `ticket_evidence` ganha `jira_attachment_id`, guardado a partir de agora.
  Evidência de antes desta coluna existir só sai daqui — sem o id, o Jira não
  tem como ser localizado sozinho.
- `app/api/n1-tickets/[key]/route.ts`: ação `removeEvidence` (PUT) apaga do
  Jira antes de apagar daqui (se o Jira recusar, nada muda dos dois lados) e
  grava na auditoria. Só quem está no atendimento (N1 principal/participante)
  remove, e só antes do chamado ser validado — depois de validado a evidência
  fica fixa, junto com o resto do histórico.
- `components/n1-ticket-actions.tsx`: botão de remover (com confirmação) em
  cada evidência já enviada.

**Pendente:** migration `drizzle/0042_ticket_evidence_jira_attachment.sql`
precisa rodar (`npm run db:migrate:remote`).

### Evidência do N1: clicar para abrir/ampliar (estava sem efeito)

Foto de evidência era só uma miniatura fixa (sem clique) e "Abrir RAT" usava
um link `data:` em nova aba — que o Chrome bloqueia em silêncio há alguns
anos (clicava e não acontecia nada, sem erro nenhum na tela).

- `components/n1-ticket-actions.tsx`: foto e vídeo agora abrem num visualizador
  cheio ao clicar (`ImageZoom`, mesmo componente da aba "Anexos e evidências"
  do chamado); "Abrir RAT" converte o `data:` para `blob:` antes de abrir a
  aba — `blob:` não sofre o bloqueio.

### Agendar em lote: não exige mais técnico da lista

No diálogo "Agendar" (ações em lote), bastava digitar os dados no campo
"Dados que serão enviados ao Jira" e a data/hora — mas o botão só habilitava
se o técnico tivesse sido escolhido na busca da lista. Mesma barreira que já
tinha sido tirada do "Agrupar" em 2026-09-23.

- `components/bulk-ticket-actions.tsx`: `submit()` não exige mais
  `selectedTechnicianId`, só `technicianData` (texto) e `scheduledAt`.
- `app/api/jira/issues/batch/route.ts`: quando não vem `technicianId` (ou é
  inválido), tenta achar o técnico pelo CPF ou nome digitado no texto, igual
  já fazia a edição de um chamado só (`app/api/jira/issues/[key]/route.ts`).
  Sem casar, `technicianId` fica `null` — a coluna já era opcional em
  `operationalWorkflows` (`db/schema.ts`), não precisou de migration.

## 2026-09-23

### Agrupar: técnico pode ser só o nome digitado

No diálogo "Agrupar" (grupo de repasse), o técnico não precisa mais estar na
lista: dá para digitar só o nome.

- `app/api/fsa-groups/route.ts` aceita `technicianName` quando não vem
  `technicianId`. O grupo continua ligado a um cadastro (`technician_id` segue
  obrigatório, sem migration): o servidor procura técnico com o mesmo nome
  ignorando acento/maiúscula/espaço e reaproveita; se não houver, cria um
  cadastro mínimo (nome, cidade/UF dos chamados, `approved: false`,
  `source_status` "Cadastro rápido pelo grupo de repasse"). A auditoria marca
  `tecnicoCriado: true`.
- `lib/repasse-tecnico.ts` (regras) + `tests/repasse-tecnico.test.ts`.
- `components/bulk-ticket-actions.tsx`: botão Agrupar habilita com nome
  válido; textos do campo explicam a regra.

**Pendente:** cadastros rápidos aparecem na lista de técnicos com esse status;
completar dados (CPF, PIX) antes do pagamento, como já acontecia no cadastro.
### Caju IA: resposta longa não chega mais cortada, e tabela aparece como tabela

Uma lista de agendados em tabela passava do teto de 900 tokens e a resposta
terminava no meio de uma FSA ("(FSA-133"). O painel também mostrava o Markdown
cru (`|`, `**`).

- `lib/server/workers-ai-assistant.ts`: `MAX_OUTPUT_TOKENS` 900 → 2400; se o
  modelo ainda parar por limite (`finish_reason: "length"`), a resposta ganha o
  aviso `AVISO_RESPOSTA_CORTADA` pedindo um recorte menor.
- `lib/answer-markdown.ts`: converte a resposta em blocos (parágrafo, título,
  lista, tabela) e negrito inline. `components/assistant-panel.tsx` desenha a
  tabela com rolagem horizontal própria, sem quebrar célula; FSA segue
  clicável em qualquer bloco.
- `tests/answer-markdown.test.ts`.

### Correção: `detalhar_chamado` quebrava com comentário "UP -" interno

A API de comentários do Service Desk devolve `created` como objeto
(`{ iso8601, jira, friendly, epochMillis }`), não texto. Com um "UP -" interno,
formatar a data lançava erro, a tool falhava e a IA respondia sem o comentário.
`dataDoComentario()` (`lib/assistant.ts`) normaliza a data para ISO nos dois
formatos; de quebra, os comentários internos no contexto da IA deixam de sair
com data `[object Object]`.

### Caju IA: status do chamado traz o último comentário "UP -"

Ao perguntar o status de um chamado, a IA agora informa também o comentário de
atualização mais recente que começa com "UP -", com data e horário da postagem.

- **`lib/assistant.ts`:** `comentarioUp()` acha o comentário "UP -" mais recente (aceita `UP-`, `up –`).
- **`lib/server/jira.ts`:** `getJiraIssue` devolve `upComment`, procurado em todos os comentários da issue (campo `comment`, públicos e internos) e nos internos do Service Desk.
- **`lib/server/assistant-data.ts`:** `detalhar_chamado` devolve `comentario_up` (texto, `postado_em` no fuso da operação, autor).
- **`lib/assistant-tools.ts`:** descrição da tool e `systemInstruction` mandam mostrar o `comentario_up` junto do status.
- **`tests/assistant.test.ts`:** teste de `comentarioUp`.

### "Atualizar chamado" na janela do chamado (branch `claude/atualizar-chamado`)

Campo de texto logo abaixo das ações do chamado (Mais informações, WhatsApp,
Validar, Gerir operação) para registrar acontecimentos do atendimento — ex.:
"técnico adoeceu, reagendar para amanhã". A nota vai direto para os
**comentários internos** do Jira (Service Desk, `public: false`), assinada só
com **nome e sobrenome** do perfil de quem escreveu ("— Lohan Dias"), sem
e-mail.

- Rota `POST /api/jira/issues/[key]/updates` (`requireApiUser` com gerência,
  coordenação, N1 e analista). Nome vem de `employee_presence.display_name`;
  sem nome e sobrenome no perfil a rota recusa (409) em vez de assinar com o
  e-mail.
- `lib/server/jira.ts`: `addJiraTicketUpdate` (mesmo endpoint do comentário
  interno que o assistente já usa, sem o "confirmado por").
- `lib/ticket-update.ts` (regras) + `components/ticket-update-note.tsx`
  (campo com contador, envio com carregamento, erro sem apagar o texto,
  confirmação "registrada nos comentários internos do Jira").
- `tests/ticket-update.test.ts`.

**Pendente:** a gravação real no Jira não foi exercitada no preview local (o
mock recusa `/api/jira`); conferir o primeiro comentário em produção.

### Gestão vira menu flutuante em tela baixa — equipe não some mais (branch `claude/sidebar-gestao-flyout`)

O grupo Gestão recolhível (PR #119) abria **dentro** da barra e guardava a
escolha: depois de aberto uma vez (ou em telas a partir de 900 px), ele
voltava a empurrar a equipe — em produção o trilho rolava e mostrava um avatar
só. Agora, no desktop com menos de 900 px de altura, Gestão é uma linha que
abre um **menu flutuante** ao lado (Equipe, Projetos e lojas, Spares,
Financeiro, Feedback) e nunca tira altura da equipe. Em telas altas o grupo
aparece inteiro, como antes. É automático pela altura da janela; a escolha
salva (`caju-nav-group:gestao`) saiu.

Medido no preview: 1366×700 → menu sem rolar, equipe com 3 pessoas inteiras
(aberta) e 4 (recolhida); 1366×950 → menu completo, equipe com 3 pessoas.

### Saudação do topo com o nome do perfil e emoji do período (branch `claude/saudacao-nome-perfil`)

A saudação ("Boa tarde, Lohandiasf 👋") usava o nome da conta Firebase, que
na prática vinha do e-mail. Agora usa o primeiro nome do perfil que a pessoa
preencheu ("Boa tarde, Lohan") e o emoji acompanha o período: 🌅 manhã,
☀️ tarde, 🌙 noite (mesmos cortes da saudação, hora de Brasília). Sem perfil
preenchido, continua caindo no nome da conta/e-mail.

- `lib/greeting.ts`: `greetingEmoji(hour)`.
- `lib/profile.ts`: nome de exibição do perfil num store pequeno; o menu da
  conta (que já lê o perfil) alimenta, e salvar o perfil (cadastro obrigatório
  ou Configurações) atualiza na hora.
- `tests/greeting.test.ts`: emoji por período e prioridade do nome do perfil.

### Equipe escondida na barra em telas baixas — grupo Gestão recolhível (branch `claude/sidebar-gestao-recolhivel`)

Em produção, numa tela de ~700 px de altura, o menu (12 itens) ocupava quase
toda a barra e a seção Equipe mostrava só uma fresta (aberta: um nome cortado;
recolhida: um avatar). O título "Equipe" também sumia: a regra que esconde os
rótulos dos grupos em tela baixa pegava o título da seção.

- **Gestão recolhível no desktop** (Equipe, Projetos e lojas, Spares,
  Financeiro, Feedback): vira uma linha "Gestão" com seta. Sem escolha salva,
  abre em telas com 900 px ou mais de altura, ou quando a página atual está
  dentro dele; fechado com a página atual dentro, a linha fica marcada
  ("Gestão · Financeiro"). A escolha fica salva no navegador
  (`caju-nav-group:gestao`). Recolhida a barra, é um ícone com tooltip. No
  celular o grupo fica sempre aberto (a gaveta rola inteira).
- **Tela até 860 px de altura**: itens do menu com 32 px; só os rótulos dos
  grupos do menu somem — o título "Equipe" volta a aparecer.
- Resultado estimado a ~700 px: o menu cai de ~486 para ~280 px e a equipe
  ganha ~200 px (4–5 pessoas visíveis), sem o menu rolar.

**Validação:** testes, `tsc`, lint e build. O preview local a partir de uma
worktree não subiu (otimizador do Vite com `node_modules` por junção); as
alturas foram estimadas a partir das medições da sessão anterior.

### Perfil obrigatório, equipe e chat na barra lateral, retirar da equipe (branch `claude/perfil-e-sidebar-equipe`)

- **Nome e foto obrigatórios, uma vez só** (`components/profile-setup-gate.tsx`,
  `lib/profile.ts`): ao abrir o app, quem ainda não tem nome **ou** foto salvos
  em `employee_presence` vê "Complete seu perfil" (nome e sobrenome + foto). Não
  fecha sem salvar (saída: "Sair da conta"). Quem já tem os dois nunca vê; depois
  de salvar, o servidor já tem os dados e não pergunta de novo. Se a leitura do
  perfil falhar (rede/5xx), não bloqueia. Sem migration: usa `PATCH
  /api/colleagues`, que já existia.
- **Foto reduzida no navegador** (`lib/profile-photo.ts`): recorte quadrado de
  320 px em JPEG (foto de câmera de 5 MB vira poucos KB). Também vale na tela de
  Configurações, que antes recusava imagens acima de 650 KB.
- **Retirar da equipe (gerência)**: rota nova `GET/PATCH /api/users/team`
  (`requireApiUser(['gerencia'])`, log de segurança) e painel "Pessoas na
  equipe" (`components/team-management.tsx`) em Configurações e em Equipe →
  Equipe interna. Retirar = `app_users.active = false`: a pessoa perde o acesso
  na próxima chamada à API (403) e some da lista de colegas; nada é apagado.
  "Readmitir" reativa. Não dá para retirar a própria conta nem a última
  gerência ativa. Convidar de novo um e-mail retirado agora readmite (antes
  falhava com "e-mail já possui conta").
- **Equipe na barra lateral**: o painel "Comunicação" da direita saiu (o botão
  que o abria tinha sido removido em `c6819b3`, então ele estava inacessível).
  A equipe é a última seção da barra (`SidebarTeam` em `user-menu.tsx`,
  desenhada via portal no espaço que a `AppNavigation` oferece —
  `lib/sidebar-state.ts`). Ocupa a altura que o menu não usa; só a lista rola.
  Recolhida: pilha de avatares com tooltip. O ícone no cabeçalho abre
  "Comunicação" (grupos, chamadas e busca de mensagens). Montado também em
  Financeiro, Spares e Mapa.
- **Chat ancorado**: no desktop, a conversa (direta ou de grupo) abre encostada
  na barra, com a altura toda; a barra vira trilho enquanto a conversa está
  aberta e volta como estava ao fechar (`<html data-chat-dock>`). A página
  encolhe, não fica coberta. No celular continua flutuando.
- **Barra**: saíram "Configurações" e "Recolher" do rodapé. Recolher/expandir é
  o botão no topo (e a tecla `[`); Configurações fica no menu da conta. Itens do
  menu com 36 px no desktop e, em telas de até 860 px de altura, os rótulos dos
  grupos viram só espaço — o menu não rola em 1366×768. Na gaveta do celular,
  menu e equipe rolam juntos, com a conta fixa embaixo.
- **Testes:** `tests/profile.test.ts`.

**Pendente:** nada de banco (sem migration). O mock de `/api/colleagues` do
preview local sempre devolve lista vazia, então "não perguntar de novo" foi
coberto por teste e pela leitura do servidor, não pelo preview.

### Rastreio Inteligente, Logística e Normalização de Datas Seriais do Excel na Caju IA

Implementação da extração abrangente de rastreamento (campos do Jira, fallback via Regex em comentários/descrição e fallback na tabela de spares do D1) e normalização automática de datas no formato serial do Excel (ex: 46252).

- **`lib/assistant.ts`:**
  - `extrairRastreioDeTexto()`: detecção via Regex de códigos dos Correios (ex: `QB123456789BR`) e transportadoras/guias (`LOGGI-xxx`, etc.).
  - `formatarDataExcelOuIso()`: conversão automática de números seriais do Excel (40000 a 55000) e datas ISO para o formato civil brasileiro (`DD/MM/AAAA`) no fuso de Brasília (`America/Sao_Paulo`).
  - `onlyDate()`: atualizado para reconhecer e converter seriais de 5 dígitos para `AAAA-MM-DD`.
- **`lib/server/jira.ts`:**
  - Extração de `codigoRastreio` com fallback para `customfield_16189`, `customfield_12848` e nomes alternativos (`Rastreio`, `Objeto`).
  - Fallback inteligente inspecionando comentários internos, comentários gerais e descrição do chamado com `extrairRastreioDeTexto()`.
  - Tratamento de `previsaoEntrega` (`customfield_16801`), `dataEnvio` (`customfield_18558`, `customfield_16800`, `customfield_21999`), `dataRecebimento`/`dataEntrega` (`customfield_18559`, `customfield_22000`) e `dataLimite` com `formatarDataExcelOuIso()`.
- **`lib/server/assistant-data.ts`:**
  - `detalharChamado` busca código de rastreio e previsão de entrega na tabela `spares` do D1 caso não estejam presentes nos campos do Jira.
- **`lib/assistant-tools.ts`:**
  - Instruções de sistema (`systemInstruction`) detalhando passo a passo a verificação de `codigo_rastreio`, consulta a `consultar_spares` e apresentação de códigos dos Correios.
- **`tests/assistant.test.ts`:**
  - Testes unitários para `extrairRastreioDeTexto`, `formatarDataExcelOuIso` e seriais do Excel no `onlyDate` (totalizando 335 testes).

### Caju IA: Integração de REQ/Freshservice, Logística, Classificação e Sinônimos Operacionais

Expansão das capacidades de consulta e resposta da Caju IA cobrindo os campos operacionais de REQ (Freshservice), logística de envio e entrega, datas/aprovação e classificação técnica dos chamados no Jira (instância delfia.atlassian.net / FSA).

- **`lib/assistant.ts`:**
  - Adicionados campos à interface `AssistantIssue`: `chamadoFreshservice`, `inReq`, `tituloRequisicao`, `statusRequisicao`, `codigoRastreio`, `cidadeDestino`, `previsaoEntrega`, `dataEnvio`, `dataRecebimento`, `dtChegadaLoja`, `dtAprovacao`, `dataLimite`, `causaRaiz`, `severidade`, `aprovacao`, `tipoAtendimento`, `nivelCriticidade`.
  - Atualizada a função `ticketContext()` para formatar e exibir blocos de Requisição/REQ, Logística/Rastreio, Datas/Aprovação e Classificação quando preenchidos.
- **`lib/server/jira.ts`:**
  - Mapeados custom fields na consulta da API do Jira (`getJiraIssue` e `searchJiraIssues`): `customfield_14886` (REQ Freshservice), `customfield_12280` (Cidade Destino), `customfield_12844` (Previsão Entrega), `customfield_12848` (Código de Rastreio), `customfield_18558` (Data Envio), `customfield_18559` (Data Recebimento), além de `customfield_14810`, `customfield_14821`, `customfield_15087`, `customfield_16196`.
  - Mapeamento populando `operationalFields` com `chamadoFreshservice`, `inReq`, `tituloRequisicao`, `statusRequisicao`, `dataEnvio`, `dataRecebimento`.
- **`lib/server/assistant-issue.ts`:**
  - Extração e mapeamento dos campos operacionais para `toAssistantIssue()`.
- **`lib/assistant-tools.ts`:**
  - Inclusão da diretriz "SINÔNIMOS E TERMOS DA OPERAÇÃO" nas instruções do sistema (`systemInstruction`), ensinando a IA a associar termos como REQ, Freshservice, número do chamado do cliente, código de rastreio, previsão de entrega, causa raiz, valor da primeira visita/revisita aos respectivos campos de forma fluida.
- **`lib/server/assistant-data.ts`:**
  - A ferramenta `detalharChamado` agora expõe campos estruturados explícitos (`numero_req_freshservice`, `valor_equipamento`, `custo_total`, `codigo_rastreio`, `previsao_entrega`, `causa_raiz`, `chegada_na_loja`, `data_aprovacao`) em conjunto com `chamado` e `historico`.
- **`tests/assistant.test.ts`:**
  - Adicionados testes unitários cobrindo a formatação e presença dos novos campos em `ticketContext()`.

### Revisão de UI/UX: hierarquia, superfícies sólidas e status da equipe (branch `claude/ui-ux-revisao`)

Revisão visual de toda a interface sem mexer em API, banco, auth, permissões,
rotas ou regras de negócio. Pedido explícito do usuário: tirar gradiente
decorativo, glow, glass espalhado e sombra em todo card; criar hierarquia real.
**Isto substitui a regra antiga "preserve o blur/transparência"** — ver a nota
atualizada no `CLAUDE.md`/`AGENTS.md`. Transições continuam.

- **Tokens (`app/globals.css`):** superfícies sólidas em níveis
  (`background < card < card-elevated < popover`; escuro sem preto absoluto:
  `#0b0d11 → #13161b → #1a1d23 → #1e2229`). `--surface-glass`,
  `--shadow-card/panel/hero` e `--body-glow` viram sólido/`none`. Sombra só no
  que flutua: `--shadow-popover` (menus, dropdowns, tooltips, painéis fixos) e
  `--shadow-overlay` (modais), aplicadas por `data-slot` num lugar só. Raio com
  escala fixa (6/8/10/12/14/16/20 px; antes `rounded-2xl` = 25 px). Escala
  tipográfica (`text-label/caption/body/section/title/metric/metric-lg`),
  espaçamento `--space-*`, classes `page-eyebrow/page-title/page-subtitle/
  section-title/label-caps`. Botão primário sólido (sem gradiente, glow nem
  "pulo" no hover). Foco de campo com anel. `.metric-glow`, hero em
  gradiente, orb do assistente e brilho do chat removidos.
- **Sidebar:** grupos Operação / Comunicação / Gestão (mesma ordem, rotas e
  permissões). Item ativo = fundo suave + azul + peso.
- **Header:** fundo sólido; ao rolar só ganha a borda. Busca com botão de
  limpar e placeholder que diz o que ela procura (FSA, cidade, loja,
  defeito). Estado do Jira discreto quando ok, âmbar quando falha.
- **Visão geral:** painel primário "Fila de chamados" (número grande em aberto,
  quantos sem técnico, em campo/agendados com variação, lista por etapa);
  SLA e agenda viram secundários neutros — cor só no "N atrasados". Ações
  rápidas com ícone neutro; contagem em âmbar só quando há pendência.
  "Novo chamado no Jira" é a ação principal no cabeçalho (Visão geral e
  Chamados). Animação de entrada encurtada (fade + 6 px).
- **`components/metric-strip.tsx` (novo):** faixa única de métricas com
  divisórias no lugar de 4 cards iguais com glow — Financeiro, Spares e Mapa.
  Primeira métrica é a principal; cada número tem contexto real (período,
  % do total, itens ativos).
- **Status da equipe (`lib/presence.ts` + `components/presence-indicator.tsx`,
  novos):** cada status tem cor + forma (✓ online, − ocupado/não perturbe,
  relógio ausente/almoço/pausa, anel vazio offline) + texto. Painel
  Comunicação agrupa por disponibilidade com resumo ("2 de 6 online · 2
  ocupados"), mostra função e "Atualizado/Visto há X"; busca também por
  status. Os 7 status e a API continuam iguais.
- **Chamados:** kanban com colunas em fundo inset e cards sem sombra; seleção
  em azul (era violeta); lista com cabeçalho de colunas alinhado, etapa com
  ponto + texto, estado vazio que cita a busca e oferece "Limpar busca e
  filtros". Projetos/Agenda com cabeçalho alinhado às linhas.
- **Estados:** carregamentos de seção viram skeleton (lista, equipe,
  bilhetes, financeiro); estados vazios com contexto. Alertas e avisos usam
  `success/warning/danger` em vez de paleta solta (ajuste em lote em ~18
  componentes, fora das ilhas do WhatsApp).
- **Mural da equipe:** saiu o gradiente escuro fixo (que também ficava escuro
  no tema claro).
- **Testes:** `tests/presence.test.ts` (novo) e `tests/prelaunch-visual.test.ts`
  (níveis do tema escuro, contraste, nada de glow/gradiente nos painéis).

**Pendente:** não existe status "Precisa de ajuda" no sistema — não foi
inventado; se for desejado, precisa de valor novo em `/api/colleagues`,
`db/schema.ts` (migration) e `lib/presence.ts`. A busca de "defeito" olha o
resumo do chamado (título do Jira); o campo `defectSummary` detalhado só é
carregado ao abrir o chamado. O lint da `main` já tinha 156 erros; esta
mudança não acrescenta nenhum líquido.

### Integração de capacidades de busca no Jira, campos customizados e inteligência financeira

Adicionado catálogo completo de métodos de busca no Jira e integração direta dos campos operacionais, financeiros e de equipamentos para a Caju IA responder com precisão perguntas como *"Quantos chamados estão agendados com o valor da primeira visita 120 reais"*.
- **Catálogo de capacidades e campos customizados:** Seção 9 documentada em `docs/guia_completo_ia_cajutech.md` detalhando busca JQL avançada, Assets/CMDB, comentários, anexos, SLAs, e tabela completa de custom fields (`customfield_11958` Custo Visita1, `customfield_12419` Custo Visita2, `customfield_11959` Custo Improdutiva, `customfield_16195` Valor R$, `customfield_14880` Valor Total de Equipamentos, `customfield_14821` Custo, `customfield_12413` Total do Ticket, `customfield_17468`/`13308` Custos Adicionais, `customfield_13501` Orçamento, e campos de equipamento/hardware `customfield_15087`, `customfield_15088`, `customfield_15089`, `customfield_12031`, `customfield_12032`).
- **Registro completo de campos (`lib/jira-field-registry.ts`):** Mapeamento canônico de todas as constantes de campos customizados do Jira (valores financeiros, equipamentos, peças, SLAs, datas e logística) gerado com leitura direta da API.
- **Novas ferramentas especializadas (`consultar_valores` e `consultar_equipamento`):** Registradas em `lib/assistant-tools.ts` e implementadas em `lib/server/assistant-data.ts` para consulta cirúrgica de valores (R$, orçamento, custos adicionais) e componentes/peças com defeito ou trocadas.
- **Integração no Jira (`lib/server/jira.ts`):** `searchJiraIssues` agora requisita campos financeiros diretamente na busca JQL; `toSummary` e `getJiraIssue` extraem os valores por ID e por nome mapeado (`namedValues`), cobrindo datas extras, pessoas extras, peças e logística.
- **Repasse ao assistente (`lib/server/assistant-issue.ts`):** `toAssistantIssue` agora mapeia todos os campos financeiros e de hardware (`visitCost1`, `visitCost2`, `improductiveCost`, `equipmentTotal`, `valueR$`, `cost`, `ticketTotal`, `additionalCosts`, `budget`, `serialNumber`, `patrimony`, `equipment`).
- **Formatação de moeda e agrupamento pronto (`lib/assistant.ts`):** `formatMoney` formata valores monetários em padrão BRL; `costGroups` em `queueContext` totaliza e lista chamados por valor de 1ª visita; `ticketContext` exibe todos os custos operacionais do chamado.
- **Instruções e ferramentas (`lib/assistant-tools.ts`):** Schemas de `consultar_chamados`, `consultar_valores`, `consultar_equipamento` e `detalhar_chamado` e o `systemInstruction` orientam a IA sobre como correlacionar status e custos para contagens instantâneas e sem alucinações.
- **Testes unitários (`tests/assistant.test.ts`):** Cobertura com 320 testes passando para formatação de moeda, dados do chamado, schemas das novas ferramentas e agrupamento por custo.

### Interceptação robusta de chamadas de ferramentas (Tool Calls) e higienização

Corrigido vazamento de marcações XML cruas (`<tool_call>detalhar_chamado...`) emitidas por modelos do Workers AI (especialmente GLM-4.7-Flash).
- **Causa raiz:** O GLM-4.7-Flash emite chamadas de função com tags XML nativas (`<tool_call>nome<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>`) quando o envelope `message.tool_calls` da OpenAI não é gerado pelo Cloudflare Workers AI. O backend não realizava o parsing dessas tags no texto de resposta, assumia que não havia chamadas de ferramentas e retornava o XML cru diretamente para o usuário sem executar a ferramenta.
- **Leitor universal (`readAssistantResponse`):** Parser puro em `lib/assistant.ts` capaz de extrair e normalizar chamadas vindas de `choices[0].message.tool_calls`, `payload.tool_calls` raiz (formato tradicional Cloudflare/Mistral), e tags textuais `<tool_call>` (formato GLM / ChatML).
- **Execução concorrente e multi-turno:** Quando múltiplas ferramentas são requisitadas na mesma resposta (ex.: 5 chamados detalhados de uma vez), o backend agora executa todas em paralelo via `Promise.all`, anexa os resultados com `role: 'tool'` e avança para a próxima rodada da IA.
- **Higienização estrita em múltiplas camadas:** Função `sanitizeFinalAnswer` remove completamente tags e resquícios de chamadas tanto no backend antes do envio quanto no componente de exibição (`Answer` em `components/assistant-panel.tsx`).
- **Instrução de sistema reforçada:** Adicionada regra crítica em `systemInstruction` proibindo expressamente a IA de expor tags XML ou JSON técnico de ferramentas na resposta ao usuário final.

### Guia Completo e refinamento das diretrizes da IA (System Prompt)

Incorporado o Guia Completo da IA do Sistema CAJU TECH + Jira (`docs/guia_completo_ia_cajutech.md`)
ao `systemInstruction` em `lib/assistant-tools.ts`. O assistente passa a operar com:
- Hierarquia estrita de prioridades: System prompt > Instruções do backend > Mensagens do usuário (com blindagem contra tentativas de metaprompt para inventar dados).
- Pipeline de raciocínio cognitivo estruturado (checklist mental para intenção, verificação de dados externos, consultas com conectivos lógicos E/OU, ordenação e agrupamento).
- Modos de saída adaptativos: texto explicativo em markdown, relatórios em tabelas markdown, listas simples e JSON estrito quando solicitado.
- Capacidades de diagnóstico técnico em TI de varejo e estruturação para ações no Jira (summary, description padronizada, priorização e labels).

## 2026-09-22

### Ditado por voz no assistente e sliders de filtro da fila (branch `claude/microfone-sliders`)

**Microfone no assistente.** Botão de ditado no card do assistente (Visão
geral) e na janela flutuante. Grava com `MediaRecorder` (até 60 s, para
sozinho) e envia para a rota nova **`POST /api/assistant/transcribe`**
(`requireApiUser` com os papéis do assistente geral, 10 por minuto por IP, até
3 MB, só `audio/*`), que transcreve com Workers AI
`@cf/openai/whisper-large-v3-turbo` em português. O texto só **preenche o
campo**: a pessoa revisa e envia. Falha de permissão, rede ou modelo vira
mensagem curta e o campo continua funcionando. Helpers em
`lib/voice-transcription.ts`, com testes.
**Pendente:** a transcrição real só roda com o binding `AI` (produção); não foi
testada com áudio real. Confirmar no primeiro uso que o webm/opus do Chrome e
do app desktop é aceito. Custo: Workers AI cobra por minuto de áudio (há
franquia gratuita diária).

**Sliders nas Ações rápidas.** Bloco "Filtrar a fila" com dois sliders:
"Parado há" (0–14 dias sem atualização no Jira) e "Prioridade mínima"
(qualquer / média ou alta / só alta), com contagem ao vivo. O botão abre
Chamados já filtrado pela URL (`/?view=tickets&parados=5&prioridade=alta`); na
fila, os filtros aparecem como chips removíveis. Só filtram o que já está na
tela (`lib/queue-filters.ts`, com testes), sem consulta ou regra nova.
### Senha ao reabrir o site ou o app (branch `claude/senha-sessao`)

A sessão do Firebase passou de persistência local (IndexedDB, sobrevivia ao
fechamento) para **`browserSessionPersistence`** (`lib/firebase.ts`): recarregar
a página mantém o login; fechar a aba, o navegador ou o app desktop (Tauri)
encerra a sessão. Na volta, o login mostra o e-mail da última pessoa que entrou
neste aparelho (`localStorage` `caju-last-email`, `lib/login-memory.ts`, com
testes) e pede **só a senha**; "Usar outra conta" volta ao formulário completo.
A senha nunca é guardada. "Sair" (menu do usuário e tela de acesso negado)
passa por `signOutAndForget()`, que também esquece o e-mail. Na primeira carga,
o token antigo gravado em disco (`firebase:authUser:*` e o IndexedDB
`firebaseLocalStorageDb`) é apagado.
**Efeito colateral:** cada aba nova começa sem sessão (o `sessionStorage` é por
aba), então abrir um link do app numa aba nova (ex.: `?ticket=` compartilhado)
pede a senha também. Nenhuma regra de servidor, papel ou rota mudou.

### Redesign "Dashboard Premium" (branch `claude/dashboard-premium`)

Só camada visual/UX — nenhuma regra de negócio, rota de API, schema ou
permissão mudou. Feito em passos, um commit por passo.

**1. Tokens + tema claro.** `app/globals.css` agora tem dois temas sobre os
mesmos tokens: `:root` é o claro (azul elétrico sobre marfim) e `.dark` o
grafite. O escuro continua padrão na primeira carga; a escolha fica em
`localStorage` (`caju-theme`: `dark | light | system`) e um script mínimo no
`<head>` (`lib/theme.ts` → `app/layout.tsx`) aplica a classe antes da
hidratação, sem flash. Tokens novos: `--card-elevated`, `--primary-soft`,
`--brand` (preenchimento sólido com texto branco — no escuro `--primary` é um
azul mais claro para passar AA como texto), `--success/--warning/--danger`
(+ `-soft`), `--chart-track`, `--chart-missed`, `--shadow-card`,
`--shadow-hero`, `--radius-card`, superfícies (`--surface-*`) e chat
(`--chat-*`). Cores fixas do CSS global (header, campos, diálogos, tabela,
chat, Leaflet, seleção, scrollbar) viraram tokens.
Compatibilidade: ~500 classes do JSX usam tons claros da paleta
(`text-emerald-200`, `bg-red-400/10`…) como texto sobre fundo escuro. No tema
claro esses tons são remapeados para os escuros equivalentes
(100/200→800, 300→700, 400→600), então as telas existentes ficam legíveis sem
reescrever cada componente. O inbox do WhatsApp (pele própria do WhatsApp Web)
continua escuro nos dois temas: recebe `.dark`, que restaura tokens e paleta
só ali dentro. O mapa não inverte os tiles no claro.
`MotionConfig reducedMotion="user"` na raiz: toda animação do `motion`
respeita "reduzir movimento".

**2. Shell.** Sidebar (`components/app-navigation.tsx`) no mesmo fundo do app,
240 px expandida / 72 px recolhida (botão "Recolher" ou tecla `[`; estado em
`localStorage` `caju-sidebar`, aplicado antes da pintura por
`lib/sidebar-state.ts`). Item ativo com barra de 3 px que desliza entre itens
(`layoutId`); recolhida, os rótulos viram tooltip. Rodapé com avatar (ponto de
disponibilidade), nome, e-mail e botão sair — mesmo `signOut` do menu. Itens e
permissões iguais. Barra superior do dashboard com saudação por horário de
Brasília ("Boa tarde, Maria 👋", `lib/greeting.ts`), busca em pílula, status
do Jira, toggle de tema e sino com ponto vermelho que balança quando chega
alerta novo. Mapa, Spares e Financeiro ganharam o toggle. A barra é
transparente no topo e ganha vidro ao rolar. Superfícies "afundadas"
(`bg-black/10–30`) ganharam equivalente claro com o original em `dark:`;
cards do kanban viram cards brancos elevados no claro.

**3. Login.** Tela dividida no desktop: painel azul de marca (gradiente,
grade de pontos, ondas, emblema em ladrilho branco, frases alternando a cada
5 s com indicador em pílula, três destaques) e card do formulário à direita.
No celular o painel vira cabeçalho de 180 px e o card sobe por cima. Campos
com ícone, olho acessível na senha, "Esqueci a senha" ao lado do rótulo,
toggle de tema. `signInWithEmailAndPassword`, recuperação de senha e mensagens
de erro são os mesmos. Ao autenticar, o card some (200 ms) e o painel azul se
expande até cobrir a tela (`components/login-transition.tsx`, fora do gate
do AuthProvider), segurando enquanto o perfil é validado e sumindo quando a
rota sai de `/login` (teto de 3 s). Movimento reduzido: só fade.
Não entrou: "Lembrar de mim" (mudaria a persistência do Firebase — regra de
auth) e botão Google (não há provedor Google configurado).
Botão padrão (`components/ui/button.tsx`) passa a usar `bg-brand
text-brand-foreground`: no escuro o `--primary` é claro demais para texto
branco.

**4–7. Visão geral em bento grid** (`components/dashboard/*`). Substitui os
quatro cards de métrica da Visão geral; o kanban "Fluxo de chamados" continua
logo abaixo. Só dados que a tela já carrega (chamados ativos do Jira +
`/api/operational-dashboard`), contas em `lib/dashboard-metrics.ts` (com
testes). Grade de 12 colunas no xl (3·6·3 / 8·4 / 8·4), 2 no lg, 1 no celular.
- Hero azul com glow: "Chamados no prazo (SLA)" = fluxos ativos sem SLA
  atrasado ÷ fluxos ativos, com count-up; pílulas "Ver fila" e "Novo chamado"
  (Jira). Sem resumo em 8 s mostra "—" em vez de girar para sempre.
- Resumo operacional: Em aberto / Em campo / Agendados com badge de variação
  (sinal + seta + cor) e barra de distribuição da fila por status. **O "vs.
  ontem" é por navegador**: não há série histórica no servidor, então cada
  navegador guarda um retrato diário (`localStorage` `caju-dashboard-kpis`) e
  compara com o último dia visto; sem retrato anterior não aparece badge.
- Agenda da quinzena: 14 mini-barras (7 dias atrás em azul, 7 à frente no
  trilho) e % de chamados com técnico.
- Movimento por dia (Recharts): colunas "com trilho" — agendados (azul) e
  acionados (laranja da marca) empilhados com 4 px de respiro, trilho neutro
  da escala do período. **Não há meta no sistema**, então o trilho é só
  escala, não "Meta". O laranja substituiu o creme/cinza sugerido: o validador
  de paleta reprovou o cinza (croma baixo, lê como "sem dado"). Barras crescem
  em cascata (60 ms por dia); trocar 7/14 dias interpola. Tooltip com os três
  números, `role="img"` com resumo e tabela equivalente para leitor de tela.
- Assistente: orb em CSS puro (flutua/respira; pulsa enquanto a IA responde),
  chips que preenchem o campo, envio abre a janela do assistente que já
  existia (evento `caju:assistant-ask`, `lib/assistant-events.ts`) — mesma
  lógica, histórico e ferramentas. Sem microfone (não há recurso de voz).
- Atividades recentes: tabela (vira lista de cards no celular), linha inteira
  abre o chamado, status em pílula ("Atrasado" quando há alerta crítico).
- Ações rápidas: atalhos para Agenda, Central N1, Spares, Mapa (filtrados por
  `canUseNavItem`) e novo chamado no Jira. Sem sliders — não há ação
  existente que eles controlariam.
- Coreografia: skeletons com brilho nas posições finais; cards entram em
  cascata (70 ms) com mola; com dado em cache a cascata cai para ~35 ms.
  Cada card tem estados de carregando/vazio/erro e um error boundary próprio;
  selo "Atualizado há X min"/"Offline" quando o dado envelhece.
  `prefers-reduced-motion`: sem translate/escala/brilho/flutuação.

### Assistente ganha histórico contínuo, exibição de fontes, presença global e fallback

O assistente flutuante de IA agora suporta conversas multi-turno contínuas,
permitindo perguntas de acompanhamento sem perder o contexto do turno anterior.
Abaixo de cada resposta, o assistente indica de forma clara e visual as fontes e
ferramentas consultadas (ex.: "Consultou: Chamados, Técnicos").

O botão e painel do assistente flutuante (`FloatingAssistant`) foram desacoplados
da página inicial e unificados globalmente no `RootLayout` via `GlobalAssistant`,
tornando a IA acessível a partir de qualquer rota (Central N1, Spares, Mapa,
Financeiro). Ao clicar numa FSA a partir de qualquer tela, o chamado é aberto
automaticamente na interface principal via eventos customizados ou navegação direta.

No servidor (`workers-ai-assistant.ts`), foi adicionado fallback de resiliência: se
o modelo primário (`@cf/zai-org/glm-4.7-flash`) sofrer instabilidade transitória
(500/503), o Workers AI tenta automaticamente os modelos de contingência compatíveis
com chamadas de ferramentas (`@cf/meta/llama-4-scout-17b-16e-instruct` e
`@cf/mistralai/mistral-small-3.1-24b-instruct`). Erro de cota diária (429) continua
interrompendo de imediato para preservar a franquia gratuita sem cobranças surpresa.

### Assistente geral usa a franquia gratuita do Workers AI

`/api/assistant/ask` deixou de depender da chave e da cota do Gemini. Agora
usa o binding já existente do Workers AI com `@cf/zai-org/glm-4.7-flash`, que
suporta raciocínio e chamadas de ferramentas. As consultas de chamados, Jira,
técnicos, spares e WhatsApp continuam no servidor; o modelo apenas decide o
que consultar e escreve a resposta. Ações como agendamento continuam apenas
preparadas para confirmação na tela.

Cada chamada usa `store: false`, para não armazenar o conteúdo operacional
enviado ao modelo. A franquia gratuita diária é da Cloudflare; quando ela for
atingida, a API responde claramente para tentar no dia seguinte, sem trocar
para um modelo pago.

## 2026-09-21

### Grupo de chamados só aceita uma cidade

Dava para agrupar chamados de cidades diferentes (um grupo juntou Nazaré da
Mata/PE e Nanuque/MG), e as duas visitas passavam a dividir a mesma faixa de
preço. Agora `POST /api/fsa-groups` recusa a criação com 400 quando os chamados
têm mais de uma cidade, e o diálogo **Agrupar** avisa antes e desativa o botão.
A comparação ignora acento e maiúsculas. Chamado sem cidade não bloqueia.
Regra em `erroDeCidades` (`lib/group-name.ts`).

**Pendente:** os grupos já criados com mais de uma cidade continuam como estão.
Não existe ação para desfazer ou dividir um grupo.

### Exportar agora avisa onde o arquivo foi salvo

No app desktop, o WebView salva o CSV direto na pasta Downloads sem mostrar
nada, e parecia que o botão Exportar não funcionava. Os botões Exportar do
Financeiro e dos grupos de chamados agora mostram "Arquivo salvo na pasta
Downloads: …". Se o repasse sair só com o cabeçalho, o aviso diz que não há
grupo aprovado ou pago nos últimos 30 dias. O download passou para
`lib/download-file.ts`: o link entra no DOM e o blob só é liberado depois de
60 s. Não precisa de executável novo.

### Anexar evidência não comenta mais no Jira

O Caju OS deixou de escrever "Evidências anexadas pelo Caju OS por …" no
chamado ao anexar fotos. Os arquivos continuam indo para o Jira.

### Validar não exige mais valores atualizados

O botão Validar deixou de travar em "Falta: valores atualizados". O valor do
chamado agora vem da classificação da FSA (atuação, evidência, improdutiva) e
do grupo, então o total do Jira não é mais pré-requisito.

### Cadastro de técnicos: a importação parou de duplicar, e as cópias foram mapeadas

O cadastro tinha **1.794 linhas para ~900 pessoas** — 292 nomes repetidos, gente
com até 8 cópias. A causa: a importação casava o técnico só pelo **e-mail**, e
quem não tem e-mail (metade do cadastro) virava uma linha nova a cada planilha.
Pessoas repetidas dentro da mesma planilha também viravam linhas separadas.

A importação agora procura o técnico pela mesma regra que decide quem é quem
(`lib/technician-identity.ts`): CPF **com** nome, depois e-mail, depois nome e
cidade — este só quando a linha não traz CPF, para um homônimo não sobrescrever
outra pessoa. Campo vazio na planilha não apaga o que o cadastro já tem.

O CPF sozinho não basta, e isso apareceu nos dados reais:

- **mesmo CPF, pessoas diferentes** — Emylli e Manoel de Oliveira Silva, cidades
  diferentes. Provavelmente CPF de parente. Fica para decisão humana;
- **mesmo nome, CPF com um dígito errado** — Erivelton e Lohan; em cada par, um
  CPF não passa no dígito verificador. Mesma pessoa, fica o CPF válido;
- **"APAGAR - Ray Henrique da Silva"** — alguém já marcou a cópia no nome. Ela
  tinha e-mail e a regra de "fica a linha com e-mail" a manteria; a marcação
  agora tem prioridade.

A unificação das cópias existentes é um script à parte
(`scripts/unificar-tecnicos.ts`) que só lê produção e gera o plano e o SQL numa
pasta fora do repositório — o SQL carrega telefone, PIX e endereço. A simulação
deu 294 pessoas com cópias, 890 linhas a remover, cadastro de 1.794 para 904.
Nenhuma tabela aponta hoje para uma cópia, mas o SQL repõe as referências antes
de apagar, por segurança.

**Pendente:** backup do D1 e execução do SQL, com aprovação.

### "Agrupar chamados", nome pela cidade e loja, e o tipo à vista no chamado

Três ajustes pedidos pelo usuário depois de usar:

- **"Agrupar para repasse" virou "Agrupar chamados".** Agrupar é juntar os
  chamados da mesma visita; o repasse é consequência, não o nome da ação.
- **O nome do grupo é a cidade e o número da loja**, gerado pelo servidor a
  partir dos próprios chamados ("Candeias — Loja L497"; "Candeias — Lojas L497,
  L500"; cidades diferentes separadas por " · "). Não há mais campo livre: um
  apelido como "gvnd" não diz nada a quem olha a fila. O kanban preenche a
  cidade que falta com "Atualizado em …", e isso é descartado. A regra está em
  `lib/group-name.ts`, com testes.
- **O tipo da FSA estava escondido.** O bloco ficava dentro dos detalhes do
  Jira, abaixo do assistente, fora da parte visível do diálogo — o usuário não
  achou. Agora fica logo abaixo dos botões de ação. E chamado sem grupo não
  mostra mais só um aviso: escolhido o técnico, marcar o tipo cria o grupo dele
  na hora.

O grupo "gvnd", criado antes disso, mantém o nome antigo.

### Kanban empilha os chamados agrupados

Quem agrupa quatro FSAs da mesma loja não quer ver quatro cards soltos na
coluna: é um atendimento só. Agora os chamados do mesmo grupo de repasse, na
mesma coluna, viram uma **pilha** — um card com o nome do grupo, o técnico, as
FSAs e a loja, com duas cartas deslocadas por trás. Clicar abre os cards de
sempre dentro da coluna, e cada um continua abrindo o chamado.

- A pilha só existe com **dois ou mais** chamados do grupo **na mesma coluna**.
  Se um deles mudou de etapa (foi para "aguardando spare"), aparece sozinho
  onde está: a pilha mostra onde cada chamado está de fato.
- **Grupo pago deixa de empilhar.** Se o chamado voltar para a fila depois
  disso, é trabalho novo e aparece solto até ser agrupado de novo.
- A seleção em lote continua funcionando: a pilha tem sua própria caixa, que
  marca todas as FSAs do grupo.

A regra de empilhar é função pura (`lib/ticket-stacks.ts`), com testes. Os
vínculos vêm de `/api/fsa-groups/vinculos`, que devolve só nome do grupo e
técnico — sem valor, porque o kanban é visto pela equipe inteira. O kanban
atualiza a cada minuto, e na hora quando quem está vendo acabou de agrupar.

### O tipo da FSA é marcado no chamado, não no financeiro

Atuação, evidência e improdutiva passam a ser marcadas no diálogo que abre ao
clicar no chamado, na tela inicial. É quem opera o chamado que sabe o que
aconteceu na loja; a tela financeira ficou só para conferir, fechar, aprovar e
pagar — a lista de FSAs do grupo lá é só leitura, com o tipo em etiqueta.

A classificação continua pertencendo ao grupo de repasse. Chamado fora de grupo
mostra como chegar lá ("Agrupar para repasse" na fila) em vez de um formulário
sem onde gravar.

A permissão não mudou: marca o tipo quem montou o grupo ou a gerência, porque o
tipo muda o valor do repasse. Os demais veem o tipo e o motivo, sem editar. O
diálogo lê por `/api/fsa-groups/por-chamado`, que não devolve valor nenhum — a
tela do chamado é aberta pela equipe inteira.

### Painel financeiro: zerar a partir de uma data, e repasse vindo dos grupos

A gerência quer conferir os números 1:1 a partir do zero. Duas mudanças:

**Zerar sem apagar.** Os valores vêm do Jira e dos grupos de repasse; apagar
não é opção. O painel ganhou uma data de início (`finance_settings.acompanhamento_desde`,
`drizzle/0040_acompanhamento_financeiro.sql`) e ignora tudo antes dela. Botão
"Zerar a partir de hoje", campo para escolher outra data e opção de voltar a
contar todo o histórico. Os filtros de 7/30/90 dias continuam; vale o mais
recente entre eles e a data de início.

**O repasse do painel vinha de outra regra.** A caixa "Regra de repasse"
(R$ 120 na primeira visita + R$ 70 por chamado) era uma estimativa antiga,
anterior aos grupos, e ninguém a tinha desligado — o painel mostrava
"Repasse calculado no período: R$ 23.100" com base nela. Ela nunca bateria com
os grupos aprovados. Agora o repasse é a soma dos grupos **aprovados e pagos**
(o que vai para a folha), agregada no banco por `/api/fsa-groups/resumo` — sem
o teto de 200 da lista, porque total que trunca em silêncio é justamente o que
a conferência existe para pegar. O que está fechado e espera a gerência aparece
à parte.

A tabela por técnico foi dividida em duas: receita (nomes do Jira) e repasse
(nomes do cadastro). Cruzar as duas por nome erraria em silêncio: no Jira o
técnico é "Lohan Dias", no cadastro é "Lohan Dias Farias".

Limitações conhecidas:

- O faturamento é filtrado pela **última atualização** do chamado no Jira, a
  única data que a consulta financeira traz. Um chamado antigo que for editado
  depois da data de início entra na conta.
- A regra antiga continua em uso em outras telas: dashboard operacional
  (`/api/operational-dashboard`, `/api/operations`), histórico do chamado,
  assistente e o diálogo de fluxo operacional. Só o painel financeiro mudou.

**Data do pagamento.** A folha não sai no dia da aprovação. Aprovar um grupo
agora exige a data em que ele vai ser pago (`fsa_groups.data_pagamento`, na
mesma `0040`), que pode ser mudada enquanto o grupo não foi pago. O painel
conta a saída por essa data — é quando o dinheiro sai de fato —, e grupo ainda
sem data conta pelo dia do atendimento. O relatório ganhou a coluna "Data do
pagamento". Bloquear um grupo aprovado limpa a data.

De passagem, o teste da coluna nova expôs um bug de fuso no relatório: dia
sem hora (`2026-09-25`) passava por `new Date`, virava meia-noite UTC, e em
Brasília saía como 24/09. No servidor, que roda em UTC, saía certo por acaso.
Agora dia sem hora é formatado como texto, e há teste que roda nos dois fusos.

**Pendente:** rodar `npm run db:migrate:remote`.

### Improdutiva vira categoria, não desconto

No teste em produção apareceu uma leitura ruim. A tela mostrava o valor de cada
grupo **já com o desconto aplicado** e, embaixo, uma linha de desconto
informativa:

```
Serviços (1)                     R$ 70,00
Evidências (1)                   R$  2,50
Desconto por não resolver (1)   − R$  2,50
Total da visita                  R$ 72,50
```

O total estava certo, mas quem lê de cima para baixo faz 70 + 2,50 − 2,50 = 70
e estranha. Numa conferência de pagamento isso vira discussão.

A pedido do usuário, improdutiva passa a ser uma **terceira categoria** ao lado
de atuação e evidência, com valor próprio: uma atuação de R$ 70 que não saiu
aparece como improdutiva de R$ 35, e não como desconto. As três linhas somam o
total, sem nada a subtrair.

A conta não mudou — só a leitura. Os testes antigos continuam passando.

**Evidência deixou de poder ser improdutiva.** Entregar a evidência é o trabalho
inteiro: ou saiu, ou vira atuação improdutiva. Não existe meia evidência. Isso
corrige uma suposição feita quando o documento não cobria o caso — na primeira
versão, evidência improdutiva caía pela metade. O botão some da tela quando a
FSA é evidência, trocar o tipo limpa a marcação, e o servidor recusa mesmo que a
tela deixe passar.

Junto veio o vocabulário da operação: "serviço" vira **atuação** na tela, e o
botão "Não consegui resolver" vira **Improdutiva**.

`fsa_payouts` ganhou `improdutivas_cents` (`drizzle/0038_fsa_improdutivas.sql`),
e `servicos_cents`/`evidencias_cents` passam a guardar só a parte produtiva. A
tabela estava vazia, então não houve o que converter. O relatório ganhou três
colunas novas, uma por categoria, para a planilha ser somável por qualquer
recorte.

### O grupo passa a ser a unidade de pagamento

Duas limitações do modelo anterior apareceram no uso real:

- **Só dava para classificar dentro de um atendimento preparado.** O usuário
  quer classificar a qualquer momento — pendente de agendamento, agendado ou
  técnico em campo — sem passar pela operação ao vivo.
- **Um chamado que volta para a fila sobrescrevia a passada anterior.** Ex.: a
  FSA foi marcada como evidência, ficou aguardando spare, o spare chegou e ela
  foi atendida como atuação — às vezes por outro técnico, noutro grupo. A
  classificação era única por chamado, então a segunda apagava a primeira, e
  com ela um trabalho que já tinha sido pago.

Agora existe o **grupo de repasse**: o usuário seleciona várias FSAs na fila,
escolhe o técnico e cria o grupo pela barra de ações em lote ("Agrupar para
repasse"). O grupo define a faixa de preço — dois chamados na mesma loja, no
mesmo horário, com o mesmo técnico, valem R$ 100 no total. A tabela calcula e a
gerência só confere.

A chave da classificação passou a ser (grupo, chamado), então o mesmo chamado
pode estar em vários grupos ao longo do tempo, um por passada.

Antes de decidir, foi considerado agrupar automaticamente por técnico + dia. O
usuário escolheu o grupo manual, e a diferença é de dinheiro: um técnico que faz
4 + 3 + 2 atuações em três lojas recebe R$ 370 por grupo, contra R$ 270 se o dia
inteiro virasse uma faixa só.

**O técnico vem do cadastro, não do texto do Jira.** O Jira manda o nome como
texto livre, e o mesmo técnico aparece lá como "Carlos Antonio" e "Carlos
Antônio" — o que partiria o repasse de uma pessoa em dois.

O grupo guarda a descrição e a loja de cada FSA no momento em que ela entrou:
o Jira muda de status e de texto, e o que foi atendido e pago não pode mudar
junto.

Mudanças de estrutura:

- `fsa_groups` substitui `fsa_payouts`, e `fsa_classifications` passa a apontar
  para o grupo (`drizzle/0039_fsa_groups.sql`). As duas tabelas antigas estavam
  vazias, então não houve o que converter.
- A `0038` do dia anterior foi removida antes de ir para produção: ela
  adicionava uma coluna a `fsa_payouts`, que a `0039` apaga.
- As rotas `/api/active-attendances/[id]/fsa-payment` e `/api/fsa-payouts`
  deram lugar a `/api/fsa-groups`. O botão "Repasse" saiu do card de
  atendimento, e a fila de grupos fica na `/financeiro`.

**Pendente:** rodar `npm run db:migrate:remote` antes de publicar.

---

## 2026-09-20

### Repasse por FSA: cálculo, persistência e a tela do técnico

Primeira implementação da especificação de pagamento
(`ESPECIFICACAO_PAGAMENTO_FSA.md`), que até aqui só existia como documento.

O cálculo vive em `lib/fsa-payment.ts`, puro e sem banco: faixa de serviços,
evidência contada **por FSA e não por foto**, improdutivo pela metade com
motivo obrigatório, e o consolidado do dia numa faixa só (4 + 3 + 2 serviços
pagam como 9, não como três visitas pequenas). Os exemplos do documento viraram
os 19 testes de `tests/fsa-payment.test.ts`.

Duas regras que o documento não tinha fechado, decididas com o usuário:

- **Serviço novo na loja não paga bônus fixo.** O "bônus de R$ 30" era só o
  primeiro degrau da tabela (70 → 100) lido como se fosse regra. Recalcula-se
  pela faixa e o técnico fica com a diferença.
- **Exceção do quinto chamado.** A tabela repete R$ 150 em 4 e em 5 serviços,
  então 4 agendados + 1 descoberto renderia zero — o técnico trabalharia de
  graça. Quando o recálculo não aumenta nada, paga a faixa seguinte (R$ 180).
  Com 2 a mais a exceção não aparece: 6 já valem R$ 180 por tabela.

Persistência em duas tabelas novas (`drizzle/0037_fsa_payment.sql`):

- `fsa_classifications` — uma linha por FSA. Vive só no Caju; nada volta para o
  Jira, que não conhece serviço, evidência nem improdutivo.
- `fsa_payouts` — fotografia do repasse fechado de uma visita. O valor nunca é
  a fonte da verdade (ele sempre sai do cálculo sobre as FSAs atuais); guarda-se
  o que foi apresentado à gerência para que reclassificar depois não reescreva à
  revelia o que já foi aprovado ou pago.

A trilha de auditoria reusa `operational_audit`, que já é append-only.

Na tela, `components/fsa-payment-panel.tsx` abre dentro do card de atendimento
pelo botão "Repasse": classifica cada FSA como serviço ou evidência, marca
"não consegui resolver" pedindo o motivo, e mostra a memória de cálculo com o
total da visita. Avisa quando falta classificar alguma FSA (valor parcial) e
quando uma evidência virou serviço e espera a gerência.

### Aprovação do gerente

Fecha o ciclo que a persistência tinha deixado pela metade: até aqui
`fsa_payouts` não tinha ninguém escrevendo nela.

O técnico fecha a visita no próprio painel, e só então o cálculo vira uma
fotografia que a gerência vê. Fechar exige toda FSA classificada — fechar com
pendência guardaria um valor que já se sabe incompleto. Se alguma FSA passou de
evidência para serviço, a visita chega à fila já marcada como retida, em vez de
entrar como se estivesse conferida.

Na `/financeiro`, a fila de repasses com aprovar, bloquear, liberar a
reclassificação e marcar como pago. Só gerência vê — quem não é nem recebe a
lista. Aprovar refaz a fotografia a partir das FSAs atuais, porque a
classificação pode ter mudado entre o fechamento e a conferência.

'Pago' não paga ninguém: é o gerente registrando que a folha saiu, para a
visita não voltar à fila. O Caju segue sem tocar em dinheiro.

### Relatório de repasse

Exportação em CSV pela fila da `/financeiro`, uma linha por FSA, cobrindo 30
dias. Sai no formato que o Excel brasileiro abre sem perguntar nada: ponto e
vírgula como separador e BOM na frente, senão os acentos viram lixo.

Cada linha leva a **memória de cálculo** junto do valor — sem ela o relatório é
um número sem defesa, e quem confere não tem como saber se os R$ 180 vieram da
tabela, da exceção do quinto chamado ou de um desconto. Os dados da visita se
repetem em toda linha de propósito: a planilha vai ser filtrada e ordenada por
quem recebe, e uma linha que só faz sentido junto da de cima se perde.

O valor é recalculado a partir das FSAs em vez de vir da coluna guardada: o
relatório precisa bater com as regras de hoje, e a coluna existe para provar o
que foi aprovado, não para alimentar a planilha.

**Pendente:** rodar `npm run db:migrate:remote` para aplicar a migration.
Com isso a especificação de pagamento está implementada de ponta a ponta.

Atenção ao gerar migration neste projeto: o journal do `drizzle-kit` está
parado no `0024`, então `drizzle-kit generate` diffa contra um snapshot velho e
recria tudo que veio depois (`assistant_actions`, `ticket_archives`, tabelas do
WhatsApp, vários `ALTER TABLE`). A `0037` foi escrita à mão, como as demais de
`0026` em diante.

---

## 2026-09-19

### WhatsApp zerado para reconfiguração do zero

A pedido do usuário, toda a infraestrutura de WhatsApp foi removida para ser
montada de novo:

- as duas apps do Fly (`caju-whatsapp-bridge` e `caju-whatsapp-bridge-caju`)
  foram destruídas, com seus volumes;
- **474 arquivos de mídia foram perdidos em definitivo** (301 fotos, 125
  áudios, 32 documentos, 9 vídeos, 9 figurinhas). Só 2 já estavam anexados no
  Jira. A mídia morava em `./auth/media`, dentro do volume da sessão — o D1
  guarda só o `media_id`, nunca o arquivo;
- `whatsapp_messages` (2574 linhas) e `whatsapp_conversations` (641) foram
  esvaziadas.

Backup do texto em `Downloads/caju-whatsapp-{messages,conversations}-2026-09-19.sql`,
fora do repositório porque contém conversa de cliente.

**Pendente:** os segredos `WHATSAPP_BRIDGE_URL/SECRET` e as variantes `_CAJU`
continuam no Worker apontando para apps que não existem mais. A tela vai
acusar bridge fora do ar até a configuração nova. Os nomes em `fly.toml` e
`fly.caju.toml` ficaram livres e podem ser reusados.

**Pendente:** o commit `a9f0597` (tradução de `@lid` para número no envio)
está só na `main` local, não foi para o GitHub, e **não está validado** — ver
a seção abaixo antes de subir bridge nova com ele.

### Diagnóstico do WhatsApp: o que ficou sabido

Conversa direta nunca funcionou na conta `caju` — 314 mensagens entraram, todas
de grupo, nenhuma 1:1 em nenhum momento. Grupo funcionava; 1:1 não, nos dois
sentidos, enquanto presença e foto de perfil respondiam normalmente.

A conversa era endereçada por `@lid` (`209479127822392@lid`), sem `phone_jid`.
O `/send` passava o lid direto para `sock.sendMessage`, que aceita, devolve
`wamid` e não entrega — e como a rota do app só grava depois de receber
`wamid`, a mensagem aparecia na tela como enviada. Perda silenciosa dos dois
lados.

O commit `a9f0597` passou a traduzir o lid com `resolveLidPhone()` antes de
enviar, e a recusar com 422 quando não consegue. **Não resolveu**: a mensagem
continuou não chegando, e a tradução devolveu `557388181339` para um contato
cujo número é `5573988181339` — **faltando o nono dígito**. Antes de reusar
esse commit, confirmar se `resolveLidPhone` devolve o JID canônico; do jeito
que está, pode endereçar mensagem para outro número.

Também ficou registrado que o bridge do Suporte estava em laço de reconexão
(24 ciclos seguidos) e não processava mensagem desde 18/09 — independente do
problema do Caju.

### WhatsApp Caju: apenas 1:1 e carregamento de nomes de contato

O "WhatsApp Caju" é destinado apenas a conversas 1:1 com clientes. Grupos não
fazem sentido nessa conta.

Mudanças:
- Grupos são automaticamente filtrados na lista (não aparecem mesmo com filtro
  "Todas")
- O botão de filtro "Grupos" é ocultado para a conta Caju
- Se o usuário estivesse no filtro "Grupos" e muda para Caju, o filtro volta
  a "Todas" automaticamente
- Nova enriquecimento de contatos: quando uma mensagem 1:1 chega sem nome,
  o webhook consulta a agenda do bridge (`/contacts`) e armazena o nome no banco.
  Assim, conversas 1:1 sempre têm um identificador legível em vez de mostrar
  apenas as iniciais do número

---

## 2026-09-18

### Corrigidas as instruções do segundo bridge

As instruções que deixei no `fly.caju.toml` levavam a um bridge que não sobe:

- o segredo se chama `WHATSAPP_BRIDGE_SECRET`, não `BRIDGE_SECRET`;
- faltava `CAJU_WEBHOOK_URL`, que aponta para
  `/api/whatsapp/bridge-webhook`. O bridge **encerra na largada** sem as duas:
  "Faltam variáveis de ambiente".

Também trocado `npx wrangler` pelo caminho direto do binário, porque nesta
máquina o `npx` esbarra na política de execução de scripts do PowerShell.


### As consultas ao bridge respeitavam a conta só pela metade

Conferindo as abas em produção: a lista da conta nova dizia que o bridge dela
estava "conectando", quando esse bridge nem existe ainda.

Quatro funções de `lib/server/whatsapp-bridge.ts` recebiam a conta e a
ignoravam — perguntavam sempre ao número principal: saúde, QR, presença e foto
de perfil. O QR não chegou a enganar porque a rota confere a configuração antes
de chamar, mas a proteção estava no lugar errado.

Agora as quatro usam a conta que receberam. A lista da conta sem bridge passa a
dizer que não há informação, em vez de mostrar a saúde do outro número.


### Segundo WhatsApp: as abas e o QR

Segunda parte. Agora a caixa de entrada tem uma aba por número, e o QR do
número novo aparece na aba dele — é só escanear.

- `components/whatsapp-inbox.tsx`: abas no topo da lista. Trocar de aba fecha a
  conversa aberta, porque ela pertence ao número anterior; todas as chamadas da
  conversa (mensagens, envio, mídia, presença, evidência) levam a conta.
- `app/api/whatsapp/bridge-webhook/route.ts`: a mensagem que chega é gravada
  com a conta certa. **O segredo do bridge é que diz de quem é** — cada
  instância tem o seu, então o bridge não precisou mudar nem saber a própria
  identidade.
- `app/api/whatsapp/connection/route.ts`: QR e reinício de sessão por conta.
- Lista, mensagens, detalhe e envio passaram a filtrar por conta. Sem conta na
  chamada, tudo cai na principal — o número atual não muda de comportamento.
- `drizzle/0036_whatsapp_conversation_account_key.sql`: a conversa passa a ser
  identificada por **conta + contato**. Com a chave só no telefone, o mesmo
  contato falando com os dois números viraria uma conversa só, e a segunda
  sobrescreveria a conta da primeira. SQLite não altera chave primária, então a
  tabela é recriada com o conteúdo copiado.

**Pendente:** rodar `npm run db:migrate:remote`, subir a segunda instância do
bridge (`whatsapp-bridge/fly.caju.toml`) e gravar `WHATSAPP_BRIDGE_URL_CAJU` e
`WHATSAPP_BRIDGE_SECRET_CAJU` no Worker. Feito isso, a aba "WhatsApp Caju"
mostra o QR.


### Segundo WhatsApp: a fundação

Pedido: um segundo número, "Whatsapp Caju", com caixa de entrada própria — as
conversas dos dois separadas por aba, para a resposta nunca sair pelo número
errado.

O sistema nasceu com um número só, e as conversas nem guardavam de qual conta
vinham. Esta é a primeira parte: o banco e o servidor passam a saber que existe
mais de uma conta. **Nada muda na tela ainda** — o número atual continua
funcionando igual.

- `lib/whatsapp-accounts.ts` (puro): as duas contas, com `principal` sendo a
  que já existe. Conta desconhecida vinda do cliente vira a principal, nunca um
  erro de tela.
- `drizzle/0035_whatsapp_accounts.sql`: coluna `account` em
  `whatsapp_conversations` e `whatsapp_messages`, com índices por conta e data.
  **Tudo que já existe fica como `principal`**, então nenhuma conversa muda de
  dono.
- `lib/server/whatsapp-bridge.ts`: `bridgeFetch` e `bridgeConfigured` recebem a
  conta e escolhem a instância. A principal segue nas variáveis de sempre; a
  nova usa `WHATSAPP_BRIDGE_URL_CAJU` e `WHATSAPP_BRIDGE_SECRET_CAJU`.
- `whatsapp-bridge/fly.caju.toml`: a configuração da segunda instância, com os
  comandos de criação no cabeçalho. **Duas sessões do Baileys não cabem no
  mesmo volume** — cada uma derruba a outra —, então são máquina e volume
  próprios.
- `tests/whatsapp-accounts.test.ts`: 3 testes.

**Pendente:** rodar `npm run db:migrate:remote`, subir a segunda instância do
bridge e gravar os dois secrets. Depois disso vem a segunda parte: as abas na
caixa de entrada e o painel de QR da conta nova.


### Primeira visita: R$ 120, e não se altera

Regra informada pela operação. A tela de finanças deixava editar as duas
faixas do repasse, e a primeira vinha com R$ 70 — a primeira visita não é
configuração, é o valor base acordado.

- `lib/finance-rules.ts` (puro): `FIRST_VISIT_CENTS` e `payoutCents()`, que é
  o cálculo do repasse no período — primeira visita pelo valor base, as
  seguintes pela faixa configurável.
- `app/api/finance/rules/route.ts`: o `GET` devolve sempre o valor base, sem
  depender do que estiver gravado; o `PUT` ignora o que o cliente mandar para
  a primeira faixa. A trava fica no servidor, não só na tela.
- `app/financeiro/page.tsx`: o campo da 1ª visita virou um valor à mostra,
  marcado como fixo. O 2º chamado em diante continua editável.
- `tests/finance-rules.test.ts`: 4 testes.

**Muda o número na tela:** o repasse calculado passa a contar R$ 120 na
primeira visita de cada técnico no período, onde antes contava R$ 70.

### Abrir o .zip do laudo sem sair do sistema

O laudo do técnico chega como `.zip` com as fotos dentro, e a visualização
dizia só "este arquivo não possui visualização no navegador". Para conferir a
evidência era preciso baixar, extrair e abrir fora do Caju OS.

- `lib/zip.ts` (puro): lê o índice do ZIP e extrai cada arquivo. **Sem
  biblioteca nova** — o formato é simples de percorrer e o navegador
  descomprime com `DecompressionStream('deflate-raw')`.
- `components/zip-preview.tsx`: lista o que há dentro, com tamanho, e abre
  imagem, PDF e vídeo ali mesmo. Imagem abre com o zoom que a visualização de
  anexo já usa, então dá para ler o que está escrito na foto do laudo.
- `components/jira-ticket-details.tsx`: o `.zip` é reconhecido pelo tipo **ou**
  pelo nome, porque o Jira às vezes o marca como `application/octet-stream`.
- `tests/zip.test.ts`: 6 testes que montam um ZIP de verdade e o leem de volta
  — comprimido e sem compressão, com pasta dentro, e arquivo que não é ZIP.

### Teto por chamada ao modelo

Com a fila arrumada, a cobertura ainda deu 524 — e o erro final mostrou de
onde:

```
125 segundos · "HTTP 524"
```

O 524 veio **da própria chamada ao Gemini**. Uma única ida ao modelo passou dos
100 segundos, então o orçamento entre rodadas não tinha o que salvar: ele só
decide se vale começar outra rodada, não interrompe uma que já está em curso.

- `lib/server/gemini.ts`: cada chamada tem 40 segundos (`AbortSignal.timeout`).
  Estourou, o modelo conta como ocupado e a vez passa para o próximo — que é o
  tratamento que já existia para lotação.


### Zoom nas evidências

A foto do anexo abria no tamanho da tela e parava aí: dava para ver que o PDV
está com erro, não para ler o que está escrito nele.

- `components/image-zoom.tsx`: pinça no celular, roda do mouse no computador,
  duplo toque e arrasto quando ampliada. De 100% a 800%, com os botões de mais,
  menos e "ajustar à tela" mostrando a porcentagem.
- O zoom mira onde você aponta: o ponto sob o dedo (ou o cursor) continua no
  lugar enquanto a imagem cresce, que é como se lê um número de série numa
  foto.
- O duplo toque é detectado na mão, porque com `touch-action: none` o navegador
  do celular não garante o evento de duplo clique — e o celular é onde a
  evidência costuma ser conferida.
- `components/jira-ticket-details.tsx`: a visualização de anexo usa o
  componente. Vídeo e PDF seguem como estavam.

### O 524 era a fila de modelos, e o castigo de 5 minutos piorou

A medição final mostrou o que realmente acontecia:

```
102 segundos · HTTP 404
"This model models/gemini-2.5-pro is no longer available to new users"
```

A pergunta não estava presa na cobertura: estava descendo a fila de modelos.
O catálogo lista `gemini-2.5-pro` ao lado dos `gemini-3.x`, mas ele responde
404. E o castigo de 5 minutos que eu tinha acabado de introduzir tirou o
`flash-lite` da fila por uma lotação passageira, empurrando tudo para esse
modelo morto. A correção anterior piorou o caso que tentava resolver.

- `lib/gemini-models.ts`: geração anterior sai da fila quando há uma atual.
  `gemini-2.5-pro` não entra mais junto com os `3.x`. Se só houver geração
  antiga, ela continua valendo.
- `lib/server/gemini.ts`: o castigo por lotação caiu de 5 minutos para 1 —
  lotação passa rápido, e tirar o modelo da fila causa dano maior que tentar
  de novo. Modelo que responde 404 sai enquanto o catálogo durar, porque esse
  não volta.
- O orçamento de tempo passou a valer também entre modelos: sem tempo para
  mais uma tentativa, para de tentar em vez de garantir o 524.


### O 524 não era a cobertura: era o tempo

Depois de tirar o `fetch` da própria origem, a cobertura continuou dando 524.
A medição mostrou outra coisa: **o assistente responde em 38 segundos** mesmo
numa pergunta simples, com uma consulta só. A cobertura soma as
geocodificações e passa dos 100 segundos em que o Cloudflare corta.

Ou seja: o problema é a lentidão geral, e a cobertura só foi a primeira a
esbarrar no teto.

- `lib/server/gemini.ts`: **orçamento de tempo**. Passados 70 segundos, o loop
  para de consultar e pede a resposta com o que já levantou. Uma resposta
  parcial é melhor que um erro de infraestrutura.
- Modelo que responde 429 ou 503 fica **anotado como indisponível por 5
  minutos**. A fila tenta `flash` primeiro, e quando ele está lotado cada
  pergunta pagava esse tempo de novo. Se todos estiverem anotados, a reserva
  ainda é tentada.

A lentidão de fundo continua: `gemini-3.5-flash-lite` sob demanda alta leva
~19 segundos por ida ao modelo, e uma pergunta com consulta são duas idas.


### Cobertura: HTTP 524 em produção, e a razão

A pergunta de cobertura entrou no ar e **travou**: 524, o timeout do
Cloudflare, depois de 100 segundos esperando.

A causa é do runtime, não da lógica. As coordenadas dos técnicos ficam em
`public/data/technician-directory.js`, e eu as buscava com `fetch` na própria
origem. No Cloudflare, o Worker que chama a própria rota **volta para si
mesmo** e fica esperando até estourar o tempo.

- `lib/server/technician-directory.ts`: o arquivo entra no bundle (`?raw`) em
  vez de ser buscado pela rede. Sem ida à rede, sem recursão. A tela continua
  carregando o mesmo arquivo como script — um dado só.
- `lib/coverage.ts`: a leitura do formato (`window.TECHNICIAN_DIRECTORY=[...]`)
  virou `parseDirectory()`, testável, com 3 testes — um deles lê o arquivo de
  verdade do projeto, para o formato não mudar sem alguém perceber.
- `types/raw.d.ts`: a declaração do import `?raw`.
- A origem deixou de ser necessária no executor de consultas.


### Enviar no WhatsApp pelo chat, com o texto à vista

A outra metade do que o vídeo mostrou: depois de levantar a cobertura, a
resposta ia para o cliente na mão, copiando e colando. Agora o assistente
escreve a mensagem e a tela abre a confirmação.

- `lib/assistant-tools.ts`: `preparar_mensagem_whatsapp`, que **não envia**.
  Endereça por FSA (a conversa do chamado) ou por nome de contato.
- `lib/server/assistant-data.ts`: resolve o destinatário. Quando mais de uma
  conversa combina, devolve a lista e manda perguntar — mandar para o contato
  errado é pior do que perguntar.
- `components/whatsapp-send-dialog.tsx`: o texto aparece inteiro e **editável**,
  com o destinatário no título. O envio usa a rota de sempre, que assina com o
  nome de quem enviou.
- `components/operation-chat.tsx`, `app/page.tsx`: o botão "Revisar e enviar
  para X" e o diálogo.

**Nada sai sem clique.** A ferramenta prepara; quem envia é a pessoa, depois de
ler. E as duas ferramentas de WhatsApp — ler a conversa e escrever nela — só
existem para gerência, coordenação e analistas, como na tela.


### Cobertura de várias cidades numa pergunta

Um vídeo da operação mostrou o trabalho: um cliente pediu técnico para oito
cidades, e a resposta saiu abrindo a busca de cobertura uma vez por cidade,
tirando print e mandando no WhatsApp — oito vezes.

Agora isso é uma pergunta só: "temos técnico em Jaçanã, Marizópolis, São José
de Mipibu...?" devolve, para cada cidade, quem está nela e quem está no raio,
com a distância de cada um, em texto que se cola na conversa.

- `lib/coverage.ts` (puro): a conta de distância e o agrupamento — na cidade,
  próximos, e os mais próximos quando não há ninguém no raio. É a mesma regra
  da tela do mapa, agora num lugar só, porque duas partes precisam dela.
- `lib/server/geocode.ts`: a resolução de cidade saiu de dentro da rota
  `/api/geocode` e virou módulo; a rota passou a usá-lo, em vez de existir uma
  segunda cópia.
- `lib/server/technician-directory.ts`: as coordenadas dos ~890 técnicos vivem
  em `public/data/technician-directory.js`, que a tela carrega como script. O
  servidor busca o mesmo arquivo na própria origem e guarda por 6 h.
- `lib/assistant-tools.ts` + `lib/server/assistant-data.ts`:
  `consultar_cobertura`, até 10 cidades por pergunta, com raio configurável
  (padrão 55 km, o mesmo da tela).
- `tests/coverage.test.ts`: 9 testes, com coordenadas reais.

As consultas ao Nominatim são sequenciais de propósito: a política dele pede
uma por vez, e a maioria das cidades já está em cache.

**Pendente:** enviar a resposta direto na conversa do WhatsApp, com
confirmação antes de cada envio — é o passo seguinte que a operação pediu.


### Pedir o agendamento pelo chat — o assistente prepara, a pessoa confirma

**Verificado em produção (18/09):**

| Teste | Resultado |
|---|---|
| agendar as FSAs que estão em campo | recusou com o motivo certo e apontou a tela do Caju OS |
| agendar 3 pendentes para "amanhã às 15:50" | o botão apareceu e o diálogo abriu com 19/09 15:50 e as FSAs certas |
| quais FSAs têm grupo no WhatsApp | FSA-132505 e FSA-132416, pela consulta de atendimentos |
| última mensagem do WhatsApp | `2026-09-18 00:07`, no fuso da operação |

O diálogo foi fechado sem confirmar: nada entrou no Jira.


Pedido: "agende esses chamados para amanhã às 15:50", com onze FSAs coladas.
Selecionar onze chamados na mão é o trabalho que o chat pode poupar; agendar
por conta própria é outra coisa, e continua fora — agendar exige um técnico, e
onze transições erradas por leitura errada de um texto é estrago grande.

O caminho é o mesmo de sempre, só que sem a seleção manual: o assistente
entende o pedido, confere quem pode ser agendado, e a tela abre **o diálogo de
agendamento em lote que já existe**, com os chamados marcados e a data
preenchida. O técnico é escolhido ali, e o Jira só recebe depois do clique.

- `lib/assistant-tools.ts`: `preparar_agendamento` (que não agenda) e
  `parseSchedule()`, que recusa data no passado — erro típico de leitura de
  "amanhã".
- `lib/server/assistant-data.ts`: separa quem pode de quem não pode pela mesma
  regra da tela (`isBulkEligible`), com o motivo de cada recusa, e avisa quando
  o lote passa do teto.
- `app/api/assistant/ask/route.ts`: a ação preparada volta num campo próprio,
  separada do texto.
- `components/operation-chat.tsx`: a resposta ganha um botão "Agendar N
  chamados · escolher técnico".
- `components/bulk-ticket-actions.tsx`: o diálogo aceita ser aberto de fora,
  já com a data.

**Nada aqui escreve no Jira.** As regras 1 e 2 do `WORKFLOW_RULES` continuam
valendo: a transição só acontece por clique explícito, e só sai de "Pendente de
agendamento".

**Sobre o pedido do dia:** as onze FSAs estão em "Técnico em campo", então o
lote seria recusado — na tela ou pelo chat. Agora o assistente diz isso, em vez
de mandar abrir o Jira.


### Três acertos vindos do uso no celular

O WhatsApp entrou em produção e a operação testou. Três coisas apareceram:

1. **"Quais FSAs já têm grupo criado no WhatsApp?" não tinha resposta.** O
   grupo nasce com o atendimento (`active_attendances.whatsapp_group_name`) e
   as FSAs ficam na tabela de tickets do atendimento; nenhuma consulta olhava
   ali. Agora há `consultar_atendimentos`, com recorte por situação, por FSA e
   por "só os que têm grupo".
2. **A data saía crua e em UTC.** A última mensagem apareceu como
   "2026-09-18T03:02:00.000Z" — três horas à frente do relógio de quem
   perguntou. `operationDateTime()` passa qualquer instante do banco para o
   fuso da operação; vale também para o histórico de auditoria, que tinha o
   mesmo problema.
3. **Ele mandou abrir o Jira para agendar** um chamado que se agenda na tela do
   Caju OS. A instrução agora diz isso: agendar, transicionar, atribuir técnico
   e anexar evidência se fazem aqui.


### O assistente passa a ler as conversas de WhatsApp

Pedido depois de ele responder "não tenho acesso a mensagens de WhatsApp". A
decisão é de quem opera, porque a conversa com cliente e técnico passa a ir
para um serviço externo; levantado isso, o usuário autorizou.

- `lib/assistant-tools.ts`: `consultar_whatsapp`, com recorte por chamado, por
  contato e por janela de tempo.
- `lib/server/assistant-data.ts`: a FSA não fica na mensagem e sim na conversa,
  então a busca por chamado passa primeiro por `whatsapp_conversations`. Só
  texto — mídia vira `[image]`, `[audio]`; mensagem apagada vira `[apagada]`,
  porque o registro da operação a mantém. Recibo de entrega não é conversa e
  fica de fora.

**Três cortes, porque é o dado mais sensível que sai daqui:** janela de tempo
(24 h por padrão), quantidade (30 no máximo) e tamanho de cada mensagem (400
caracteres). Tudo passa por `redact()`, que mascara telefone, documento e
e-mail.

**Permissão respeitada.** O WhatsApp do Caju OS é restrito a gerência,
coordenação e analistas (`canUseWhatsapp`). Para quem não tem esse acesso a
consulta **não é sequer declarada** — o modelo não sabe que ela existe — e, se
pedir mesmo assim, a execução recusa. O assistente não vira porta dos fundos
para N1.


### O assistente passa a enxergar os spares

Perguntado "quais spares já chegaram?", ele respondeu que não tinha acesso aos
detalhes de entrega. Era verdade: o pedido da peça (`spares`) e o rastreio da
transportadora (`shipment_tracking`) existem no banco, mas nenhuma consulta os
alcançava — o resumo da operação só contava quantos estavam a caminho.

- `lib/assistant-tools.ts`: `consultar_spares`, com recorte por chamado,
  situação (a caminho, entregues, atrasados) e busca livre por cidade,
  equipamento, fornecedor ou código de rastreio.
- `lib/server/assistant-data.ts`: junta as duas tabelas, porque quem pergunta
  "esse spare chegou?" quer o pedido e a entrega na mesma linha. A situação é
  calculada: entregue quando a transportadora diz isso, atrasado quando a
  previsão já passou.

**Continua fora do alcance:** mensagens de WhatsApp. Expor conversa com cliente
e técnico a um serviço externo é decisão de quem opera, não minha.


### O chat ganha cara de chat

A caixa de pergunta era um campo de uma linha com um botão do lado — a mesma
da busca antiga. Virou uma caixa de composição de verdade, no espírito de uma
referência que o usuário trouxe, mas com as cores do sistema: nada de branco
sobre preto nem violeta solto, só `primary`, `card`, `border` e
`muted-foreground`.

- `components/operation-chat.tsx`:
  - a caixa cresce com a pergunta (até 160px) em vez de rolar dentro de uma
    linha;
  - **Enter envia, Shift+Enter quebra linha**, e a dica fica visível na barra
    de baixo;
  - a borda acende no foco;
  - "Consultando o sistema" ganhou os três pontos animados, porque a resposta
    leva alguns segundos e a tela parecia travada;
  - as mensagens entram com um deslize curto, e a conversa vazia mostra "Como
    posso ajudar?" em vez de uma frase solta;
  - as sugestões viraram chips com borda, no lugar de botões fantasma.

Ficou de fora do que a referência trazia: anexos, paleta de comandos com `/`,
e os brilhos que seguem o mouse. Nenhum dos três tem função aqui, e o último
destoa do resto do sistema. As animações usam `motion/react`, que o app já usa
na navegação e na caixa do WhatsApp.

### A fila leva a hora, e a última rodada sempre responde

"Quais chamados caíram hoje após as 15h?" terminou em "o assistente consultou
o sistema várias vezes e não chegou a uma resposta". Duas causas, as duas
minhas:

1. **A hora não ia no contexto.** `queueContext` cortava tudo para AAAA-MM-DD,
   então não havia como filtrar por horário — o modelo consultava de novo a
   cada tentativa até estourar as cinco rodadas. Isso é uma regressão: a busca
   por padrões que o chat substituiu entendia horário ("quantos chamados tem
   para 10h"). Agora as colunas de abertura, acionamento e agendamento saem
   como AAAA-MM-DD HH:MM, e o cabeçalho diz o formato. As contagens por dia
   continuam comparando só o dia.
2. **Estourar as rodadas virava erro.** Na última rodada o modelo agora vai
   sem ferramentas: sem poder consultar de novo, ele responde com o que já
   tem. Quem perguntou recebe o que deu para apurar, em vez de um aviso de
   falha.


### "Pesquisar operação" vira conversa com o assistente

A caixa da Visão geral respondia por padrões escritos à mão
(`answerOperationalQuestion`): entendia "quantos chamados tem para amanhã" e
pouco mais. Agora é uma conversa com o assistente geral, que consulta o
sistema.

- `components/operation-chat.tsx`: histórico de perguntas e respostas, envio
  por Enter, rolagem automática, sugestões, e as FSAs da resposta como link que
  abre o chamado. Mostra quais consultas o assistente fez.
- O painel da direita continua: os chamados **citados na resposta** viram lista
  com seleção, que é de onde saem as ações em lote. Quando a resposta cita um
  chamado fora da lista carregada, a tela diz isso em vez de sumir com ele.
- Pergunta de seguimento funciona ("e desses, quais são de Itabuna?"): a rota
  passa a aceitar a conversa anterior. `cleanHistory()` corta o que vem do
  cliente — seis turnos, 1200 caracteres cada, e papel desconhecido vira
  `user`, nunca instrução de sistema.
- `app/page.tsx`: 219 linhas a menos. A busca por padrões e o tipo dela saíram
  junto, em vez de virar código morto.
- `tests/assistant-tools.test.ts`: 3 testes novos.

**Não verificado na tela:** o `npm run dev` não sobe nesta máquina (fica em
"Establishing remote connection"), então a conversa só foi exercitada pela API.
O comportamento visual precisa de uma passada em produção.

### Assistente geral validado em produção

Depois de quatro correções, o assistente respondeu — e as respostas foram
conferidas contra o Jira e o banco, não aceitas pela aparência.

| Pergunta | Resposta | Conferência |
|---|---|---|
| "quem atende em Itabuna?" | 9 técnicos | 15 registros citam Itabuna, mas são 9 pessoas: ele consolidou as repetições |
| "quais chamados estão com técnico em campo?" | 28 chamados | o quadro também mostra 28, e as FSAs são exatamente as mesmas — nenhuma faltando, nenhuma inventada |
| "o que aconteceu no FSA-132819?" | defeito, causa, técnico, 11 evidências | confere com o Jira: Genilson Sérgio, agendado 17/09 11:00, 11 anexos, PDV 302 lento por ter 2 GB de RAM |

Na segunda pergunta, o assistente da fila respondia 22 de 30 e listava status
que ninguém pediu. Esta é a mesma pergunta, agora exata.

Respondeu no `gemini-3.5-flash-lite`: o flash estava lotado e a fila caiu de
porte, como o ajuste anterior previa.

**Achado à parte, que não é do assistente:** o cadastro de técnicos tem
registros duplicados — "Gustavo Pereira da Costa" e "Italo Mateus Querino
cunha" aparecem quatro vezes cada, com os mesmos dados.

### Gemini: a fila de tentativas pega um modelo de cada porte

A mensagem de erro em produção mostrou a fila que o código montou:

> os modelos disponíveis do Gemini (gemini-3.8-flash, gemini-3.7-flash,
> gemini-3.6-flash) estão ocupados ou sem cota agora

São três versões do mesmo modelo. Flash lotado significa as três lotadas, e as
duas tentativas extras só custaram espera. Cair para outro porte tem chance de
verdade, porque a cota do plano gratuito é por modelo.

- `lib/gemini-models.ts`: `fallbackQueue()` monta a fila com um modelo de cada
  porte — flash, depois flash-lite, depois pro. Se a chave só tiver um porte,
  completa com as outras versões em vez de desistir.
- `tests/gemini-models.test.ts`: 3 testes novos, com os nomes reais que
  apareceram em produção.

O erro também revelou a família disponível nesta chave: **Gemini 3.x**. Os
nomes que a primeira versão trazia (2.5, 2.0, 1.5) estavam todos obsoletos —
o que confirma ter sido certo trocar a lista fixa por descoberta pela API.

### Gemini: tentar o próximo modelo quando o preferido está lotado

Terceira falha em produção, e a primeira que não era erro de código:

> This model is currently experiencing high demand.

No plano gratuito isso vai acontecer. O cliente só trocava de modelo quando o
nome não existia (404), então uma lotação passageira derrubava a pergunta.

- `lib/gemini-models.ts`: `rankModels()` devolve a fila inteira em ordem de
  preferência; `pickModel()` continua para quem só quer o primeiro.
- `lib/server/gemini.ts`: tenta até três modelos. Troca em 404 (não existe),
  429 (cota, que no plano gratuito é por modelo) e 503 (lotado). Se todos
  falharem, a mensagem diz que os modelos estão ocupados e nomeia quais foram
  tentados, em vez de repetir o texto do Google sobre um só.
- `tests/gemini-models.test.ts`: 2 testes novos.

### Gemini: devolver o turno do modelo como ele veio

Com o modelo já resolvido, a pergunta "quem atende em Itabuna?" chegou a
chamar a ferramenta certa (`consultar_tecnicos`) e falhou no turno seguinte:

> Function call is missing a thought_signature in functionCall parts.

Modelo que raciocina manda uma assinatura junto da chamada de função, e a API
exige recebê-la de volta no histórico. O cliente remontava a chamada a partir
do nome e dos argumentos, e a assinatura se perdia no caminho.

- `lib/gemini-protocol.ts`: `readCandidate()` passa a devolver também as partes
  cruas do turno.
- `lib/server/gemini.ts`: o histórico recebe essas partes como vieram, em vez
  de uma versão remontada. Vale para qualquer campo que a API acrescente
  depois.

### Gemini: o modelo vem do catálogo da API, não de um nome escrito de cabeça

Primeiro teste com a chave real em produção: os três nomes de modelo que o
cliente tentava deram 404 — "models/gemini-1.5-flash is not found for API
version v1beta". A chave estava certa; a lista fixa é que estava errada.

- `lib/gemini-models.ts` (puro): `pickModel()` escolhe a partir do que a API
  diz existir. Ordem: `flash` (plano gratuito e raciocina melhor), depois
  `flash-lite`, depois `pro`; estável antes de prévia e de experimental,
  versão maior antes da menor. Descarta o que não gera texto — embedding,
  imagem, áudio, `gemma`.
- `lib/server/gemini.ts`: lê o catálogo uma vez e guarda por 6 h no isolate.
  Se o modelo guardado sumir no meio do caminho (404), joga o cache fora e
  pergunta de novo, uma vez. `GEMINI_MODEL` continua forçando um nome.
- `tests/gemini-models.test.ts`: 9 testes, com um catálogo parecido com o real.

Também corrige o comando do secret, que estava sem o nome do Worker: a config
do wrangler não fica na raiz, é gerada no build pelo `patch-wrangler.mjs`.

```
wrangler secret put GEMINI_API_KEY --name caju-os
```

Conferido em produção no mesmo dia — ver a entrada "Assistente geral validado em produção".


### Assistente geral: pergunta aberta, consultando o sistema

O assistente da fila só respondia sobre a lista que o servidor mandava pronta;
qualquer pergunta fora dela batia em "não consta". O pedido foi outro: uma IA
que responda pergunta não prevista, com acesso ao sistema, como o Rovo faz
dentro do Jira.

A diferença não é o modelo, é **chamada de função**: o modelo não recebe
contexto pronto, ele consulta o sistema até saber responder.

- `lib/assistant-tools.ts` (puro): as cinco consultas que ele pode fazer —
  `consultar_chamados`, `detalhar_chamado`, `consultar_tecnicos`,
  `resumo_operacao`, `consultar_historico` — e a instrução do sistema, que
  carrega o que a operação já ensinou ao assistente da fila (vocabulário de
  "acionado/caiu/colocado/entrou", rótulo de status da tela, não listar status
  que ninguém pediu, usar contagem pronta em vez de contar a lista).
- `lib/gemini-protocol.ts` (puro): como montar o pedido e ler a resposta do
  Gemini. Separado do cliente para ser testável sem rede.
- `lib/server/gemini.ts`: cliente REST, sem SDK (o runtime é Workers). Tenta
  `gemini-2.5-flash`, `gemini-2.0-flash` e `gemini-1.5-flash` nessa ordem;
  modelo inexistente (404) cai para o próximo. Teto de 5 rodadas por pergunta.
- `lib/server/assistant-data.ts`: executa as consultas. Reaproveita
  `queueContext` e `ticketContext`, que já foram validados em produção.
- `app/api/assistant/ask/route.ts`: mesmos papéis do assistente da fila,
  limite de 8 perguntas por minuto por IP.
- `components/assistant-panel.tsx`: o painel passa a perguntar aqui.
- `tests/assistant-tools.test.ts`: 12 testes.

**Somente leitura.** Nenhuma consulta escreve no Jira ou no banco. Nenhum dado
pessoal sai: as consultas não selecionam documento, telefone, endereço nem
chave PIX (regra 9 do `WORKFLOW_RULES`), e o que sobra passa por `redact()`.

**Modelo:** Gemini no plano gratuito. Estouro de cota vira mensagem explicando
que é cota, não erro genérico.

A chave saiu do Google AI Studio e foi gravada como secret do Worker no mesmo
dia — o comando está na entrada acima, com o `--name` que faltava aqui.

Sem a chave, a rota devolve `code: "sem_chave"` e o painel volta para o
assistente da fila, então o deploy era seguro antes de ela existir.

## 2026-09-17

### Copiar só os links do Jira

O menu "Copiar" da barra de seleção ganhou **"Só os links do Jira"**: um
`https://delfia.atlassian.net/browse/FSA-…` por linha, sem título e sem status,
para colar numa lista ou num grupo.

- `lib/bulk-actions.ts`: formato `jira` em `ticketsToClipboard`. O endereço do
  Jira é repetido aqui pelo mesmo motivo do link público (o módulo roda direto
  no Node nos testes); `tests/bulk-actions.test.ts` prende as duas cópias ao
  mesmo endereço de `lib/ticket-links.ts`.
- `components/bulk-ticket-actions.tsx`: a opção nova entra logo depois de "Só
  as FSAs".

### Assistente: a fila inteira, não uma amostra de 60

Testando em produção: "quantos chamados caíram ontem?" respondeu 8, e na tela
são 17. Mesma causa da contagem de status: o contexto levava só os 60 chamados
operacionais atualizados mais recentemente. Buscar o status citado (a correção
anterior) resolvia a pergunta de status e deixava a de data errada.

- `app/api/assistant/route.ts`: `loadQueue()` lê a fila operacional inteira,
  página por página (100 por página, teto de 300; a operação tem ~170). Falha
  numa página seguinte não derruba a resposta — vale o que já veio.
- `lib/assistant.ts`: `statusesIn()` saiu junto com a busca por status, que
  virou código morto.
- As FSAs citadas na pergunta continuam buscadas à parte, porque podem estar
  fora da fila operacional (resolvidas, canceladas).

**Verificado em produção (17/09):** depois do deploy anterior, "quais chamados
estão com técnico em campo?" passou a responder 30 — as mesmas 30 FSAs da
coluna do quadro — e a pergunta de data voltou a trazer o rodapé "(pela data de
acionamento)", que sai nas demais.

**Pendente:** conferir em produção que "quantos caíram ontem?" passa a
responder 17.

### Assistente: status citado na pergunta é buscado inteiro no Jira

Depois da correção do formato, "quais chamados estão com técnico em campo?"
respondeu 22, e são 30. O formato estava certo (copiou a linha pronta); a lista
é que estava curta: a fila são os 60 chamados operacionais atualizados mais
recentemente, e 8 dos que estão em campo ficaram fora dessa janela.

- `lib/assistant.ts`: `statusesIn()` reconhece o status citado na pergunta e o
  devolve no nome do Jira ("em campo" → `TEC-CAMPO`, "pendente de agendamento"
  → `AGENDAMENTO` e `AGENDAMENTO PEDIDO PELO CLIENTE`). No máximo dois status
  por pergunta.
- `app/api/assistant/route.ts`: esses status são buscados no Jira (até 100 por
  status) junto com a fila e com as FSAs citadas. Os três resultados são unidos
  sem repetição, e nada disso entra no corte da fila. Quando a tela já está
  filtrada por status, a busca extra não acontece.
- `tests/assistant.test.ts`: 1 teste novo.

**Pendente:** conferir em produção que a resposta traz os 30.

### Assistente: FSAs citadas na pergunta e status com a palavra da tela

Perguntando o status de 25 FSAs, 8 receberam "não consta", e as outras vieram
como "TEC-CAMPO".

- **FSA citada é buscada no Jira.** As 8 estavam fora da fila carregada (a fila
  são os 60 chamados operacionais atualizados mais recentemente). Agora o
  servidor extrai as FSAs da pergunta (`ticketKeysIn`, até 30) e busca essas no
  Jira com `searchJiraIssues({ keys })`, **sem filtro de status** — chamado
  citado pelo nome vale mesmo resolvido ou cancelado. Elas entram no começo do
  contexto e nunca caem no corte da fila.
- **Status com a palavra da tela.** `statusLabel()` traduz o nome do Jira para o
  da interface ("TEC-CAMPO" → "Técnico em campo", "DIRECIONADO" →
  "Direcionado"). Status fora da operação (resolvido, cancelado) fica como veio.
  Vale na fila, no contexto do chamado e na contagem de "sem anexo".
- `tests/assistant.test.ts`: 2 testes novos.

**Verificado em produção (17/09):** a pergunta com as 27 FSAs foi repetida no
app. As 27 vieram como "Técnico em campo" — nenhuma "não consta" — e o clique
na FSA abriu o chamado. Conferido na mão: FSA-127365 e FSA-128340, duas das
que antes faltavam, estão mesmo em TEC-CAMPO.

Dois defeitos apareceram no teste:

1. A resposta terminou com "(pela data de acionamento)" numa pergunta que não
   era sobre data. O prompt passa a pedir essa linha só em pergunta de data.
2. "Quais chamados estão com técnico em campo?" listou 26 dos 30 e ainda
   escreveu "Pendente de agendamento: não consta", "Aguardando spare: não
   consta" e "Direcionado: não consta" — status que ninguém pediu. A tela está
   certa (30 em TEC-CAMPO); era o modelo varrendo a tabela. Agora o contexto
   traz "Chamados por status" pronto (rótulo, contagem e FSAs), o prompt manda
   copiar a linha do status perguntado, inteira, e proíbe listar outros status.

### Assistente: evidências (anexos) na fila

"Quais chamados que estão com técnico em campo não estão com evidências
anexadas?" recebia "Não consta", e a resposta estava certa: a fila enviada ao
modelo não tinha nada sobre anexos.

- A fonte é o **anexo do Jira**. Toda evidência do Caju OS (N1, WhatsApp, tela
  do chamado) sobe como anexo; o `ticket_evidence` do D1 às vezes fica sem o
  arquivo por causa do limite de tamanho, então não serve para dizer "sem
  evidência".
- `lib/server/jira.ts`: `searchJiraIssues({ withAttachments })` pede o campo
  `attachment` e devolve `attachmentTypes` (MIME de cada anexo). Só o
  assistente usa; a lista principal continua sem esse campo, porque chamado com
  dezenas de fotos pesa.
- `lib/assistant.ts`: coluna "anexos" na fila ("2 fotos, 1 PDF", "nenhum"),
  linha "Anexos (evidências)" no contexto do chamado, e contagem pronta
  "Sem nenhum anexo em <status>" com as FSAs. O prompt associa evidência, foto,
  vídeo, RAT e comprovante à coluna "anexos".
- `tests/assistant.test.ts`: 4 testes novos.

**Limites:** "anexo" é qualquer arquivo do chamado no Jira, inclusive um print
que o cliente mandou na abertura, então um chamado com esse arquivo não aparece
como "sem evidência". A fila tem no máximo 60 chamados (os atualizados mais
recentemente); em "Técnico em campo" com mais que isso, parte fica de fora.

**Pendente:** repetir a pergunta em produção.

### Assistente: FSAs clicáveis e contagem de "ontem" pronta

- **FSA clicável:** na resposta do assistente da fila, cada FSA vira botão que
  abre o chamado no mesmo diálogo dos cards. Se o chamado não estiver carregado
  na tela (a fila do assistente é relida no servidor), o diálogo abre com um
  esboço e `openTicket` o troca pelos dados do Jira.
  `splitTicketKeys()` (`lib/assistant.ts`) separa o texto; o componente só
  desenha.
- **"Quantos caíram ontem?"** foi respondido em produção pela data de
  **abertura** (14 FSAs), apesar de o prompt mandar usar o acionamento. Só
  "hoje" vinha contado pelo servidor; para ontem o modelo escolheu a coluna
  sozinho e errou. Agora o contexto diz "ontem foi AAAA-MM-DD" e traz as
  contagens de ontem prontas (acionados, abertos, agendados), e o prompt manda
  copiar a linha em vez de recontar.
- `tests/assistant.test.ts`: 4 testes novos (contagem de ontem, dia anterior
  no fuso de Brasília, separação das FSAs).

**Pendente:** repetir "quantos chamados caíram ontem?" em produção e conferir
que a resposta usa o acionamento.

### Assistente não sabia quando o chamado foi "acionado"

Validando em produção: "quantos chamados foram acionados hoje?" recebia "a
lista não fornece a data de acionamento". A resposta estava certa. Na operação,
"acionado" é a data em que o parceiro foi acionado (`customfield_12278`, o
"Acionamento" da tela), e o contexto da fila só levava abertura e agendamento.

- `lib/assistant.ts`: nova coluna "acionado em" na fila ("não acionado" quando
  vazia) e linha "Parceiro acionado em" no contexto do chamado. O campo já vinha
  em `searchJiraIssues`/`getJiraIssue`; só não chegava ao modelo.
- O prompt da fila decide pelo **sentido** da pergunta, não pela palavra exata.
  Chegada do chamado (acionado, caiu, colocado, entrou, chegou, veio, novos…)
  → "acionado em"; "aberto"/"criado" → "aberto em"; agendado/visita →
  "agendamento". Na dúvida, usa acionamento (decisão do usuário em 17/09). O
  modelo diz qual data usou e cita as FSAs.
- Contagens de hoje prontas no contexto ("Acionados hoje: 2 (FSA-1, FSA-2)",
  abertos e agendados): modelo pequeno erra contagem numa tabela de 60 linhas,
  então o servidor conta e o modelo só escolhe a linha.
- `onlyDate()` também converte `DD/MM/AAAA` para `AAAA-MM-DD`, para comparar
  com "Hoje é".
- `lib/server/assistant-issue.ts`: `toAssistantIssue` estava copiado nas duas
  rotas (`/api/assistant` e `/api/assistant/actions`), e a cópia da escrita
  ficaria sem o campo novo. Agora existe uma só.
- `tests/assistant.test.ts`: 4 testes novos (coluna, sinônimos, contagens,
  contagem zerada) e um caso a mais em `onlyDate`.

**Limite que continua:** a fila enviada é a da tela (filtro de status e busca),
com no máximo 60 chamados. Um chamado acionado hoje que não esteja nessa lista
não entra na conta.

**Pendente:** repetir a pergunta em produção depois do deploy e conferir a
contagem com as FSAs citadas.

### "Hoje" do assistente era o hoje de UTC, não o de Brasília

O Worker roda em UTC. Depois das 21h de Brasília o `toISOString()` já devolve o
dia seguinte, então uma pergunta às 22h ("quantos chamados entraram hoje?")
seria respondida sobre o dia de amanhã — silenciosamente.

- `lib/assistant.ts`: novo `operationDate()`, que formata a data em
  `America/Sao_Paulo`. É o fuso em que os chamados são operados, e "hoje" é o de
  quem pergunta, não o do servidor.
- `tests/assistant.test.ts`: teste com horário noturno, que falharia com a
  implementação anterior.


### Assistente não respondia perguntas sobre data

"Quantos chamados entraram hoje?" recebia "não consta" — e a resposta estava
certa: a fila enviada ao modelo não tinha a data de abertura de cada chamado, e
o modelo não tem relógio para saber que dia é hoje. Falha do contexto, não do
modelo.

- `lib/assistant.ts`: a tabela da fila ganha a coluna "aberto em", e o contexto
  (da fila e do chamado) começa com "Hoje é AAAA-MM-DD". A data do chamado no
  contexto do chamado também ajuda a julgar se o agendamento já passou.
- `onlyDate()`: as datas do Jira vêm com hora e fuso; na fila só o dia importa.
- O prompt da fila passa a dizer onde encontrar as datas para contar.
- `tests/assistant.test.ts`: 4 testes novos, incluindo o que prende a regressão.


### Escrita assistida no Jira: propor → confirmar → auditar

O assistente passa a poder **escrever** no Jira, sempre com confirmação e
sempre deixando rastro. O desenho tem três portas e nenhuma pode ser pulada:

1. **Propor** — `POST /api/assistant/actions` pede uma sugestão ao modelo. A
   ação vem num bloco JSON de uma **lista fechada**: comentário interno, mudança
   de etapa ou data/hora de agendamento. Fechar, validar, cancelar e resolver
   ficam de fora de propósito (fecham chamado e mexem em financeiro).
2. **Confirmar** — `POST /api/assistant/actions/[id]`. A pessoa lê exatamente o
   que vai mudar e aceita. O corpo da requisição **não carrega o que será
   escrito**: o servidor relê a proposta pelo id, então não há como confirmar
   uma coisa e executar outra. Só quem recebeu a sugestão pode confirmá-la, uma
   única vez, e ela expira em 30 minutos.
3. **Auditar** — `GET /api/assistant/actions`, restrito a coordenação e
   gerência, com tela em Configurações. Mostra o que foi aplicado, recusado e
   falhou: a linha nasce na **proposta**, então uma sugestão recusada também
   aparece.

- `lib/assistant-actions.ts`: parte pura — lista fechada, leitura do bloco do
  modelo, descrição do que vai mudar, regra de confirmação única e expiração.
- `lib/server/assistant-actions.ts`: gravação, confirmação e execução no Jira.
- `lib/server/jira.ts`: `addJiraInternalComment`, que assina o comentário com
  quem confirmou (a credencial do Jira é a da integração; sem assinar, o rastro
  pararia em "Caju OS").
- `db/schema.ts` + `drizzle/0034_assistant_actions.sql`: tabela
  `assistant_actions`.
- `components/assistant-panel.tsx`, `components/assistant-audit.tsx`.
- `tests/assistant-actions.test.ts`: 13 testes nas travas.

Migration `0034` aplicada no D1 remoto em 17/09 (informado pelo usuário).
Enquanto a tabela não existe, a escrita assistida responde "falta rodar a
migration" em vez de estourar 500.

**Pendente:** validar em produção. Como a escrita muda etapa e agendamento, ela
entra na regra de validação de fluxo Jira (`docs/WORKFLOW_RULES.md`). Testar
primeiro o comentário interno num chamado de teste.


### Assistente de chamados (resumo, próximo passo e perguntas sobre a fila)

Pedido de usar o Rovo do Jira dentro do Caju OS. O Rovo não expõe API pública
de chat — o que a Atlassian oferece é o caminho inverso (levar agente externo
para dentro do Jira, via Forge/`rovo:agentConnector`). A funcionalidade foi
feita aqui, com os dados do Jira que o app já lê e com o **Workers AI** (binding
`AI`), o mesmo já usado na leitura da RAT: sem credencial nova, sem provedor
novo.

- `lib/assistant.ts`: parte pura — contexto do chamado, contexto da fila,
  prompts por tarefa, leitura da resposta e **redação de dados pessoais**
  (CPF, RG, telefone e e-mail viram marcadores antes de virar prompt; o campo
  "Dados dos Técnicos" carrega CPF/RG/TEL).
- `app/api/assistant/route.ts`: `requireApiUser` (gerência, coordenação, N1,
  analista) + `enforceRateLimit` (20/min por IP). Em `queue`, o servidor relê a
  fila pelo Jira — o contexto do modelo nunca vem do cliente.
- `components/assistant-panel.tsx`: `TicketAssistant` (Resumir / Próximo passo)
  na tela do chamado e `QueueAssistant` (pergunta livre) na lista.
- `tests/assistant.test.ts`: 12 testes, com foco na redação de dados pessoais.

**Somente leitura** nesta entrada: resumo, próximo passo e pergunta não gravam
nada. A escrita no Jira veio depois, na entrada "Escrita assistida no Jira", e
essa parte entra na regra de validação de fluxo Jira.

**Pendente:** o Workers AI só responde de verdade em produção — aqui dá para
verificar contexto, prompt, permissão e limite, não a qualidade da resposta.
Validar em produção se o texto ajuda e ajustar os prompts em `lib/assistant.ts`.


### Copiar "Resumo para mensagem" falhava com mais de um chamado

`Copiar → Resumo para mensagem` mostrava "Falhou" a partir de dois chamados
selecionados. Causa: o resumo busca o defeito alegado de cada FSA no Jira, uma
requisição por chamado e em fila; a escrita na área de transferência só
acontecia depois de tudo isso, quando o navegador já havia encerrado a janela
de permissão aberta pelo clique. Com um chamado dava tempo; com nove, não.

- `lib/clipboard.ts`: novo `copyToClipboardLazy(load)`. O `navigator.clipboard.write()`
  sai de dentro do gesto, recebendo Promise em cada tipo MIME — a espera pelos
  dados passa a acontecer dentro da escrita, com a permissão ainda válida.
- `components/bulk-ticket-actions.tsx`: as consultas ao Jira agora vão em
  paralelo (`Promise.all`) em vez de em fila, e a cópia usa o caminho novo.
- `tests/clipboard.test.ts`: 3 testes, incluindo o que prende a regressão — o
  `write()` precisa ser chamado antes de o conteúdo ficar pronto.


### Mobile: pull-to-refresh barrado no JS (o CSS não bastou)

O `overscroll-behavior-y: contain` em `html, body` foi publicado e o gesto
continuou recarregando o app no aparelho do usuário (vídeo: a lista rola, o
arco branco do Chrome aparece e a tela cai em "Verificando acesso..."). Alguns
aparelhos/WebViews ignoram a propriedade, então o gesto passa a ser barrado
também no JS.

- `lib/pull-refresh-guard.ts`: `canScrollUp()` puro, percorre a cadeia de
  scroll e diz se algo ainda pode rolar para cima.
- `components/pull-refresh-guard.tsx`: listener global. No `touchstart`
  decide se o gesto nasceu sem nada para rolar acima; só nesse caso o
  `touchmove` para baixo leva `preventDefault()`. Rolagem legítima não é
  tocada, e gesto com dois dedos (zoom) é ignorado.
- Montado em `app/layout.tsx`; `tests/pull-refresh-guard.test.ts` cobre a
  regra.

O CSS continua no lugar — onde ele funciona, o JS nem chega a agir.

### Mobile: puxar a lista para cima recarregava a página

No celular, arrastar para ver conversas mais antigas disparava o
pull-to-refresh nativo do Chrome Android e recarregava o app. Os scrollers
internos já tinham `overscroll-contain`, mas a raiz do documento não tinha
regra nenhuma — o gesto chegava até ela.

`app/globals.css`: `html, body { overscroll-behavior-y: contain; }`. Vale para
o app inteiro, não só a aba WhatsApp.

### WhatsApp: acesso por cargo (fim do piloto por e-mail)

A aba WhatsApp estava presa a uma allowlist de e-mail (`WHATSAPP_PILOT_EMAILS`,
só `lohandiasf@gmail.com`). Agora o acesso é por cargo: **gerência,
coordenação e analistas** veem a aba, criam grupo em lote e passam no gate das
rotas `/api/whatsapp/*`. **N1 e técnicos de campo continuam sem acesso**.

- `lib/navigation.ts`: `WHATSAPP_PILOT_EMAILS` → `WHATSAPP_ROLES`;
  `canUseWhatsapp(role)` no lugar de `canUseWhatsapp(email)`; o parâmetro
  `email` saiu de `canUseDashboardView`/`canUseNavItem` e dos chamadores
  (`app-navigation.tsx`, `app/page.tsx`, `bulk-ticket-actions.tsx`).
- `lib/server/whatsapp-bridge.ts`: `WHATSAPP_SUPPORT_ROLES` passa a ser
  `WHATSAPP_ROLES` (sai `n1`) e `requireWhatsappUser` checa o cargo do usuário.
- `tests/navigation.test.ts` cobre os cinco cargos.

Verificado: `npm test` (101 ok), `npx tsc --noEmit`, `npm run build`.

### WhatsApp: aviso falso de "não foi possível adicionar"

No primeiro grupo criado com os contatos fixos, o diálogo avisou que nenhum
dos 13 tinha entrado, mas o grupo foi criado. A causa: grupos novos listam os
membros pelo ID `@lid`, e a ponte comparava esse ID com os telefones.

Agora a ponte:
- relê a lista de membros do grupo (`groupMetadata`);
- compara todos os IDs de cada membro (`id`, `jid`, `lid` e o telefone já
  conhecido para aquele `lid`);
- aproveita esses dados para aprender a relação `lid` → telefone;
- para celulares brasileiros, compara DDD + últimos 8 dígitos, então a
  diferença do nono dígito não gera alarme.

**Pendente:** `fly deploy` da ponte.

### WhatsApp: todo grupo sai com foto e com os contatos fixos da operação

- A opção "Sem foto" saiu do diálogo. A foto padrão é **Agendar com técnico**,
  e a rota usa essa mesma foto quando o cliente não manda nenhuma.
- As pessoas que entram em todo grupo vêm do secret do Worker
  `WHATSAPP_GROUP_DEFAULT_PARTICIPANTS` (JSON `[{ name, phone }]`). Os
  telefones ficam fora do Git porque o repositório é público.
- A rota soma essas pessoas aos participantes escolhidos, independentemente do
  que o cliente enviar.
- O diálogo mostra os contatos fixos com um cadeado e não os oferece de novo na
  busca. Como eles já garantem participantes, dá para criar o grupo sem
  escolher mais ninguém.
- A ponte remove telefones repetidos antes do `groupCreate`.

**Pendente:**
- Gravar o secret com as 13 pessoas passadas pela operação em 16/09. O valor
  está fora do repositório, com quem administra o Worker.
- Redeploy da ponte (`fly deploy`) para aplicar a remoção de telefones
  repetidos.

## 2026-09-16

### WhatsApp: foto do grupo escolhida na criação

O diálogo "Criar grupo no WhatsApp" ganhou uma linha de miniaturas com as cinco
artes da operação (Atendimento agendado, Agendar com técnico, Técnico em
atendimento, Retorno ao atendimento, Pendência técnica) e "Sem foto" (padrão).
As artes ficam em `public/whatsapp-group-photos/` (640×640), listadas em
`lib/whatsapp-group-photos.ts`. A rota só aceita ids dessa lista; a ponte
baixa o arquivo de `operacoes.cajutech.net` e aplica com
`updateProfilePicture` logo depois de criar o grupo. Se a foto falhar, o grupo
continua criado e o diálogo avisa.

**Pendente:** redeploy da ponte (`cd whatsapp-bridge && fly deploy`) — sem
isso a foto é ignorada e o diálogo avisa que não foi aplicada. O web precisa
estar no ar antes (a ponte baixa a imagem dele).

### Mobile: atalho de pergunta que passava 2px da tela

Na Visão geral, o atalho "quantos chamados estão sem mandar para validação"
tinha 340px e não quebrava linha: a página ficava com 377px numa tela de 375.
No celular o atalho passa a quebrar em duas linhas; de `sm` para cima segue em
uma linha só.

### Mobile: atalhos flutuantes somem de verdade, e anexo com alvo de 44px

A regra que escondia os atalhos flutuantes durante a seleção estava dentro de
`@layer components`: no Tailwind v4 a camada de utilidades vem depois, então o
`.grid` do botão redondo vencia o `display: none` e ele continuava na tela.
Regra movida para fora das camadas — camada nenhuma perde para estilo sem
camada.

No campo de mensagem do WhatsApp, os botões de anexo e de foto tinham 36px.
No celular passam a 44px; no desktop continuam com 36.

### Mobile: diálogo do chamado e barra de seleção

O diálogo do chamado tinha 3.480px de rolagem no celular — as cinco ações do
topo, com descrição embaixo de cada uma, comiam 400px antes de qualquer
conteúdo. No celular as ações passam a ficar duas por linha, sem a linha de
explicação (que continua no texto de status logo abaixo do bloco) e com botão
mais baixo. Desktop segue igual: era 2 colunas em `sm` e 3 em `xl`, e continua.

A barra de "selecionado(s)" ficava espremida em 279px, com quatro linhas, para
deixar espaço aos atalhos flutuantes. Agora ela ocupa a largura da tela no
celular, e os atalhos flutuantes se escondem enquanto há seleção ativa
(`body:has([role='toolbar'])`), porque os dois não cabem juntos.

### Mobile: kanban com uma coluna por vez

Cinco colunas empilhadas, com até 45 cards em "Direcionado", davam uma rolagem
sem fim no celular — e comparar colunas lado a lado, que é a razão de existir do
kanban, nunca coube em 375px. Abaixo de `sm` o quadro mostra só a coluna
escolhida numa fila de abas roláveis com a contagem de cada status, e guarda a
última aberta no `localStorage`. As abas reaproveitam a mesma lista de colunas
visíveis do filtro; se o filtro tirar a coluna aberta, cai na primeira.

Desktop continua com todas as colunas: as abas são `sm:hidden` e as demais
colunas só ficam escondidas abaixo de `sm`.

### Mobile: página não rola mais para o lado

No celular o quadro aparecia cortado: cards passando da tela, "Filtros" e os
botões flutuantes por cima do conteúdo. Medido no navegador a 375px, a página
tinha 452px de largura em Visão geral, Chamados e Central N1, e 465px em Equipe.

Causa: filho de grid ou flex nasce com `min-width: auto`, ou seja, não encolhe
abaixo do próprio conteúdo mínimo. Uma coluna do kanban (cujo conteúdo mínimo é
~436px) e um card com e-mail longo esticavam a página inteira; os elementos
`fixed` acompanhavam a rolagem lateral e caíam em cima dos cards.

Correção no bloco `@media (max-width: 639px)` do `globals.css`: filho de grid ou
flex dentro de `.app-main` recebe `min-width: 0`, e texto recebe
`overflow-wrap: anywhere` para e-mail e URL poderem quebrar. Ícones dos cards de
chamado ganharam `shrink-0` para não amassar em tela estreita.

Verificado a 375px em Visão geral, Chamados, Histórico, Agenda, Central N1,
Equipe, Projetos, Spares, Financeiro, Mapa e WhatsApp: todas com 375px de
largura de documento, nenhum elemento ultrapassando a tela. Desktop não muda —
a regra vive dentro da media query de celular.

### Busca aceita vários chamados de uma vez

Colar `FSA-132030 | FSA-132032 | FSA-132034` na busca agora traz os três. Vale
para a busca do topo (chamados), o histórico e a tela de spares. Separadores:
`|`, vírgula, ponto e vírgula e quebra de linha; espaço só separa quando todos
os pedaços são códigos de chamado, para "loja 441" continuar sendo uma busca só.
Regra em `lib/search-terms.ts`, com testes.

### Validar copia o link do Jira

O botão "Validar" copiava `operacoes.cajutech.net/?ticket=FSA-...`, a tela do
Caju OS. Quem valida no grupo SUP precisa do chamado no Jira. Agora copia
`details.jiraUrl` ou `https://delfia.atlassian.net/browse/<FSA>`
(`jiraTicketUrl`, em `lib/ticket-links.ts`, com testes). "Abrir no Jira" passa a
usar o mesmo helper em vez da URL escrita à mão. O link de compartilhamento
("Enviar por chat", ações em lote) continua sendo o do Caju OS.
### Resumo para mensagem apontava para o domínio antigo

"Copiar resumo" montava `https://app.cajutech.net/?ticket=FSA-...`, endereço que
não é mais a produção — quem recebia no WhatsApp, e-mail ou Teams clicava e não
chegava no chamado. Agora sai `https://operacoes.cajutech.net/?ticket=FSA-...`,
o mesmo de `lib/ticket-links.ts`. Um teste novo prende as duas cópias do link ao
mesmo endereço, porque `lib/bulk-actions.ts` roda direto no Node nos testes e
não consegue importar o helper.

### RAT: leitura automática trocou de modelo

Primeiro teste com foto de RAT real (FSA-132555, monitor com mancha na tela)
devolveu "Resposta do modelo sem JSON.". Reproduzido localmente com a mesma
foto, chamando os modelos direto por um Worker de teste:

- `@cf/meta/llama-3.2-11b-vision-instruct` (o que estava em uso) responde em
  prosa com bullets, ignora a instrução de JSON e ainda resume em vez de
  transcrever ("Não foram realizados testes", quando o campo estava preenchido);
- `@cf/mistralai/mistral-small-3.1-24b-instruct` transcreveu os três campos
  quase palavra por palavra e devolveu `partToReplace: "Monitor"`;
- `@cf/meta/llama-4-scout-17b-16e-instruct` acertou, com transcrição mais curta.

A rota agora tenta os modelos nessa ordem e para no primeiro que devolver JSON
com conteúdo; o llama-3.2 fica por último. Formato de entrada dos dois novos é
`messages` com `image_url` em base64 — o antigo continua com `{ prompt, image }`.
O `response` do scout às vezes já vem como objeto, então o parser aceita objeto,
JSON em texto e JSON dentro de markdown (`lib/rat-extraction.ts`, com testes).
Quando nenhum modelo entrega JSON, a mensagem passa a mostrar o que o modelo
respondeu, em vez de só "sem JSON".

Prompt também mudou: diz onde cada campo está no formulário e que
`partToReplace` é só o nome da peça, não a frase inteira da solução.

## 2026-09-15

### WhatsApp: formato do nome do grupo

Padrão definido pela operação:
`DD/MM às HH:MM - TETRAGRAMA/UF - PROJETO CÓDIGO DA UNIDADE (ATENDIMENTO 1 | 2 | 3)`.
Exemplo: `16/09 às 11:30 - ITBN/BA - AMERICANAS L441 (FSA-132659 | 132660 |
132661)`. Mudou a hora (antes `16h`, agora `11:30` sempre com minutos), o
"às" e a remoção do travessão antes dos parênteses.

### WhatsApp: um grupo por cidade e por horário

Criar grupo com FSAs de cidades diferentes ou com agendamentos diferentes
passa a ser bloqueado. Regra em `groupTicketsConflict`
(`lib/whatsapp-group-name.ts`, com testes): cidade comparada sem acento e
sem UF; horário comparado por data e hora do agendamento, e chamado sem
agendamento não entra junto com chamado agendado. A janela mostra o motivo
e desabilita "Criar grupo"; a rota relê os chamados no Jira e recusa com
400, para a regra valer fora da tela.

### WhatsApp: tetragrama pela regra da operação

Primeira letra do nome + as consoantes seguintes, cada uma usada uma vez;
consoante dobrada conta uma (`Camaçari` -> `CMÇR`, `Itabuna` -> `ITBN`,
`Barreiras` -> `BRRS`). Faltando consoante, entra a vogal da sílaba tônica
(`Ipiaú` -> `IPIU`); se a tônica vier antes da segunda consoante, entra a
última vogal.

Cidade com menos de quatro consoantes agora usa as vogais para completar,
na ordem do nome: Itabuna vira `ITBN` (era `TBN`) e Ilhéus vira `ILHS`.
Cidade com quatro consoantes ou mais não muda (`Camaçari` → `CMÇR`).

### WhatsApp: resync de contatos precisa vir do zero

O resync do #35 não trouxe nada (`Contatos sincronizados: 0`, log
`resyncing critical_unblock_low from v1`): o WhatsApp só manda o que mudou
desde a versão guardada. Agora `resyncContacts({ full: true })` apaga os
arquivos `app-state-sync-version-*.json` (nunca a chave
`app-state-sync-key-*`) antes de sincronizar, o que faz o WhatsApp reenviar
o snapshot inteiro. `POST /resync-contacts?full=1`; o botão "Buscar
números" usa esse modo.

**Pendente:** merge e `flyctl deploy` do bridge.

### WhatsApp: puxar os números da agenda do WhatsApp

`resyncAppState(['critical_unblock_low', ...])` no bridge relê a agenda do
número: cada contato chega em `contacts.upsert` com `lidJid` e o JID de
telefone, preenchendo o mapa `lid -> telefone`. Roda sozinho na conexão
quando o mapa está vazio e por `POST /resync-contacts`. App:
`POST /api/whatsapp/contacts`; janela de criar grupo ganhou o botão
"Buscar números". Sem migration.

**Pendente:** merge e `flyctl deploy` do bridge.

### WhatsApp: guardar o número do contato quando o WhatsApp não informa

A consulta pelo `@lid` (#33) foi testada na máquina do bridge e o WhatsApp
respondeu sem telefone (`{"209479127822392@lid": null}`, sem erro no log).
Para contatos antigos não há como descobrir o número sozinho.

Agora, na janela de criar grupo, contato sem número traz um campo para
informar o número uma vez; ele é gravado em
`whatsapp_conversations.phone_jid` (migration
`0033_whatsapp_conversation_phone.sql`) e usado nos próximos grupos. O
`PATCH` da conversa aceita `phoneJid` (validado). Contatos novos continuam
sendo aprendidos sozinhos pelas mensagens.

**Pendente, nesta ordem:** 1) `npm.cmd run db:migrate:remote`; 2) merge.
Sem deploy do bridge.

### WhatsApp: perguntar ao WhatsApp o telefone por trás do `@lid`

As fontes passivas (mensagens, eventos de contato, participantes de grupo)
não cobriram os contatos já existentes: na janela de criar grupo eles
continuavam "sem número". O bridge agora consulta o WhatsApp sob demanda
(`executeUSyncQuery` com os protocolos `contact` + `lid`, pelo próprio
`@lid`) em `GET /phones` (até 10 desconhecidos por chamada) e ao criar
grupo. Falha é registrada e repetida no máximo 1× por hora por contato.

**Pendente:** merge e deploy do bridge. Não dá para testar sem o WhatsApp
ao vivo: se a resposta não trouxer o telefone, o contato segue exigindo o
número digitado.

### WhatsApp: número dos contatos aprendido de mais fontes

Criar grupo exige JID de telefone, e a maioria dos contatos do inbox vem
como `@lid`. Além do `sender_pn`/`participant_pn` das mensagens, o bridge
agora aprende o telefone em `contacts.upsert/update` (campos `lid` + `jid`),
no evento `chats.phoneNumberShare` e nos participantes de grupo
(`groupFetchAllParticipating` e `groupMetadata`). Guarda em
`./auth/phones.json`.

Bridge ganhou `GET /phones?jids=`; `GET /api/whatsapp/groups` devolve os
contatos diretos com o telefone conhecido. Na janela de criar grupo, contato
sem número aparece como "sem número" e não pode ser selecionado — o número
é digitado no campo abaixo.

**Pendente:** merge e `cd whatsapp-bridge; flyctl deploy`.

### WhatsApp: criar grupo a partir de chamados selecionados

Na barra de seleção de chamados (visão geral, chamados, central), botão
**Criar grupo** (só para quem tem acesso ao WhatsApp). Abre janela com nome
sugerido e participantes.

- **Nome** (`lib/whatsapp-group-name.ts`, com testes), editável:
  `15/09- 16h - CMÇR/BA - AMERICANAS L1608 - (FSA-132495)` — data/hora do
  agendamento mais cedo (fuso São Paulo), 4 primeiras consoantes da cidade
  (mantém Ç) + UF, cliente (fixo `AMERICANAS`) e código(s) da loja, FSAs em
  ordem com o prefixo uma vez. Sem agendamento ou cidade, a parte é omitida.
- **Participantes:** busca nos contatos do inbox ou número digitado com DDD.
- **Criação:** `POST /api/whatsapp/groups` → bridge `POST /groups`
  (`groupCreate`); o bridge já envia o grupo ao webhook, então ele aparece no
  inbox com as FSAs vinculadas. Participantes que o WhatsApp não aceitou são
  informados. Registrado em `security-log`.

**Pendente:** merge e `cd whatsapp-bridge; flyctl deploy`. Regra do
tetragrama não reproduz abreviações como `VTCQ` (Vitória da Conquista); o
nome pode ser ajustado antes de criar. Formato real do campo cidade no Jira
não foi confirmado (o parser aceita "Cidade - UF", "Cidade/UF", "UF -
Cidade" e cidade sem UF).

### WhatsApp: vigia de conexão, menos consultas ao WhatsApp, QR code no sistema

Às ~20h o inbox parou de receber mensagens: o bridge dizia `open`, mas o
WhatsApp não respondia às consultas ("error in sending keep alive",
"init queries" Timed Out). Resolvido na hora com `flyctl machine restart`.

- **Vigia (bridge).** Ping próprio a cada 90 s (timeout 20 s); 3 falhas
  seguidas forçam reconexão (`sock.end` → reconecta), no máximo 1× a cada
  10 min.
- **Menos consultas.** Lista de grupos sincroniza no máximo 1× por hora nas
  reconexões (renomeação e grupo novo continuam por evento). Fotos de perfil
  limitadas a 10 buscas/min em `/photo`; acima disso o bridge responde
  `limited` e o inbox mantém as iniciais e tenta de novo em 30 s. Foto do
  cabeçalho da conversa aberta não entra no limite. `fetchBridgePhoto` não
  cai mais em `/presence`.
- **QR code no sistema.** Bridge ganhou `GET /qr` (QR como imagem via
  pacote `qrcode`) e `POST /reset-session` (apaga a sessão, mantém mídia e
  nomes; recusado se conectado). App: `GET/POST /api/whatsapp/connection`
  (ver QR: gerência/coordenação; gerar novo: gerência; registrado em
  `security-log`). Inbox mostra o QR quando o bridge espera conexão e o botão
  "Gerar novo QR code" quando a sessão foi encerrada.

Sem migration. **Pendente:** merge e `cd whatsapp-bridge; flyctl deploy`.

### WhatsApp: lista de conversas quebrada após sincronizar grupos

Depois do deploy do #25/#26 o inbox mostrava "Não foi possível carregar as
conversas do WhatsApp". A sincronização de grupos criou muitas conversas e
`GET /api/whatsapp/conversations` fazia `inArray(contact_phone, [...até
200])`; o D1 aceita no máximo 100 parâmetros por consulta. A rota agora usa
uma consulta única com subconsultas correlacionadas (última mensagem e não
lidas por conversa), sem lista de parâmetros. Erro passa a ir para o log.

### WhatsApp: citação, mensagem apagada/editada, selo de evidência, RAT e N1

Migration `0032_whatsapp_quotes_edits_evidence.sql` (colunas novas em
`whatsapp_messages`: `quoted_wamid`, `quoted_body`, `quoted_name`,
`edited_at`, `deleted_at`, `evidence_ticket_keys`).

- **Citação.** Bridge envia prévia da mensagem respondida; bolha mostra o
  bloco citado e clicar rola até a original.
- **Apagada/editada.** Bridge encaminha `protocolMessage` REVOKE/MESSAGE_EDIT
  como `{ type: 'revoke' | 'edit' }`. Apagada fica riscada com aviso
  "mantida para registro"; editada troca o texto e mostra "editada".
- **Selo de evidência.** Mídia anexada mostra "Evidência · FSA-x"; o menu
  marca FSA já anexada e a rota recusa duplicata (409).
- **RAT.** Foto ou PDF ganha "Adicionar como RAT".
- **Fluxo N1.** Além do Jira, a rota grava em `ticket_evidence`
  (photo/video/rat) quando o arquivo cabe no limite dessa tabela
  (~1,3 MB), e registra em `operational_audit`.

**Pendente, nesta ordem:** 1) `npm.cmd run db:migrate:remote` ANTES do
merge; 2) merge (depois do PR anterior, #25); 3)
`cd whatsapp-bridge; flyctl deploy`. Reações continuam fora.

### WhatsApp: grupos sincronizados, menções com nome, aviso de bridge caído

- **Grupos na hora.** Ao conectar, o bridge envia a lista de grupos
  (`groupFetchAllParticipating`); renomeação (`groups.update`) e grupo novo
  (`groups.upsert`) também. O `bridge-webhook` aceita `{ type: 'groups' }`:
  grupo com FSA no nome entra no inbox e vincula FSAs sem esperar mensagem;
  grupo sem FSA só atualiza o nome se já tiver conversa.
- **Menções.** `@209479127822392` vira `@Nome`. O bridge aprende nomes de
  mensagens e contatos (`contacts.upsert/update`) e guarda em
  `./auth/names.json` no volume. Só vale para mensagens novas.
- **Aviso de bridge caído.** Bridge ganhou `GET /status`; a lista de conversas
  devolve `bridge` e o inbox mostra aviso quando a sessão foi encerrada,
  o bridge não responde ou a reconexão passa de 1 min.
- **Filtro "Grupos"** no inbox.
- **Testes do webhook.** Parsing do payload saiu para
  `lib/whatsapp-bridge-payload.ts` (que agora também contém o parser de FSAs,
  antes em `lib/whatsapp-ticket-keys.ts`) com testes.
- Rota de evidência tinha caracteres de controle literais numa regex; trocados
  por escapes.

Sem migration. **Pendente:** redeploy do bridge
(`cd whatsapp-bridge; flyctl deploy`).

### WhatsApp: foto de quem enviou nas mensagens de grupo

Grupos mostravam só o nome do participante. O bridge agora envia
`senderJid` (`key.participantPn` ou `key.participant`) nas mensagens
recebidas em grupo, gravado em `whatsapp_messages.sender_jid` (migration
`0031_whatsapp_sender_jid.sql`). No inbox, a primeira bolha de cada sequência
do mesmo participante mostra foto e nome, igual ao WhatsApp. Bridge ganhou
`GET /photo`, que busca a foto sem assinar presença; avatares da lista e dos
grupos usam `presence?photo=1` (com fallback para `/presence` em bridge
antigo).

**Pendente, nesta ordem:** 1) `npm run db:migrate:remote` ANTES do merge —
sem a coluna, leitura e gravação de mensagens quebram; 2) merge; 3)
`cd whatsapp-bridge; flyctl deploy`. Mensagens antigas ficam só com
iniciais (não têm `sender_jid`).

### WhatsApp: botão direito na mídia derrubava a página

O menu "Adicionar como evidência" usava `ContextMenuLabel` fora de
`ContextMenuGroup`. Base UI lança "MenuGroupContext is missing" nesse caso e
a página inteira caía em "This page couldn't load". Label agora fica dentro
de `ContextMenuGroup`.

### WhatsApp: mídia do chat vira evidência da FSA

Botão direito numa foto, vídeo ou arquivo recebido no inbox abre
"Adicionar como evidência", com as FSAs vinculadas à conversa. A rota nova
`POST /api/whatsapp/conversations/[phone]/evidence` busca o arquivo no bridge
e anexa no Jira com `uploadJiraAttachments` (mesmo destino de "Anexos e
evidências" do chamado). Valida: FSA precisa estar vinculada à conversa, só
imagem/vídeo/documento, máximo 25 MB, tipo e assinatura do arquivo
(`isSafeUpload`), log em `security-log`. Sem migration.

**Pendente:** não grava em `ticket_evidence` (fluxo N1), só no Jira. Áudio e
figurinha ficam fora. Não há marcação na mensagem de que já virou evidência.

### WhatsApp: grupo com várias FSAs sem prefixo repetido

Nome como `AMERICANAS L252 (FSA-132030 | 132034 |132035)` só vinculava a
primeira FSA: o parser exigia `FSA` antes de cada número. Agora números
listados logo depois de uma FSA (separados por `|`, `,`, `;`, `/`, `+`, `&`,
" e " ou espaço) também entram, desde que tenham 3+ dígitos. Na conversa,
FSA fora da fila atual aparece como etiqueta, sem botão "Abrir".

**Pendente:** grupo já vinculado só corrige na próxima mensagem recebida.

### WhatsApp: grupos vinculam FSAs pelo nome

Grupos já são nomeados com as FSAs que atendem. O `bridge-webhook` extrai
todas as FSAs do assunto do grupo (`lib/whatsapp-ticket-keys.ts`; aceita
`FSA-123`, `FSA 123`, `fsa123`, `FSA_123`, `FSA#123`) e grava em
`whatsapp_conversations.ticket_key` como lista separada por vírgula. O nome
do grupo manda: se ele tem FSAs, substitui o vínculo manual; se não tem,
o vínculo atual fica. Inbox mostra todas as FSAs na lista e um botão
"Abrir" por FSA. Sem migration.

**Pendente:** grupos existentes só vinculam na próxima mensagem recebida.
Renomear grupo pode levar até 1 h para refletir (cache do assunto no bridge).

### WhatsApp: grupos aparecem no inbox

O bridge descartava toda mensagem de JID `@g.us` (`isDirectChat`), então
grupos nunca chegavam ao Caju OS. Agora o bridge encaminha grupos com
`conversationName` = assunto do grupo (`groupMetadata`, cache de 1 h);
`contactName` segue sendo quem escreveu. O `bridge-webhook` usa
`conversationName` no nome da conversa e nunca o nome do participante para
grupos. No inbox, bolhas recebidas em grupo mostram o nome do participante,
e o cabeçalho mostra "grupo" em vez de número. Sem migration.

**Pendente:** redeploy do bridge (`cd whatsapp-bridge && fly deploy`) — sem
isso nada muda. Grupos só aparecem a partir da próxima mensagem recebida
(ou reenvio `append` das últimas 24 h ao reconectar); histórico antigo não
é importado.

### WhatsApp: menos requisições (erro "Muitas tentativas")

A tela nova do WhatsApp pedia lista (10 s), mensagens (4 s) e presença (3 s)
separadamente, mais as fotos da lista. Somado ao resto do app, estourava o
limite de 120 requisições autenticadas por minuto por IP
(`lib/server/firebase-auth.ts`, compartilhado por quem está no mesmo IP) e a
lista mostrava "Muitas tentativas. Aguarde e tente novamente."

- Mensagens e presença vêm juntas (`GET .../messages?presence=1`).
- Conversa aberta atualiza a cada 4 s, lista a cada 15 s, e tudo pausa com a
  aba escondida (retoma na hora ao voltar).
- Um 429 numa atualização de fundo não vira mensagem de erro; espera a
  próxima.
- A página do WhatsApp ocupa exatamente a tela: a página não rola mais (só a
  lista e a conversa rolam por dentro). Feito via `data-view` no `<html>` e
  regras em `globals.css`, sem mexer nas outras telas.
- Sem o bloco de título ("WhatsApp Business / Conversas / descrição") nessa
  página: a caixa de conversas ocupa toda a área abaixo da barra superior. O
  título continua disponível para leitores de tela (`sr-only`).
- Nessa página os botões flutuantes parados ("Reunião" e colegas,
  `data-floating-launcher`) ficam ocultos, pois cobriam o campo de mensagem.
  Uma chamada em andamento continua visível.
- Dados: conversa de teste "bianca" (`89537652981855@lid`) apagada do D1 de
  produção a pedido do usuário (2 mensagens + conversa, sem mídia). Volta a
  aparecer se esse número mandar mensagem de novo.

O limite por IP em si não foi alterado.

### Exportação de contatos sem duplicados; WhatsApp só para o piloto

- Exportação para Google Contatos (`lib/google-contacts.ts`): o cadastro de
  técnicos tem registros repetidos da mesma pessoa, e cada um virava um
  contato com número TCP próprio. Agora telefone repetido, ou mesmo nome
  completo + cidade + UF (sem diferenciar acento/maiúscula), vira um contato
  só, e a numeração TCP segue sem buracos. Os registros duplicados continuam
  no cadastro de técnicos — só a exportação deixou de repetir.
- Aba WhatsApp em teste fechado: visível e acessível apenas para
  `lohandiasf@gmail.com` (`WHATSAPP_PILOT_EMAILS` em `lib/navigation.ts`),
  independentemente do cargo. Também bloqueado no servidor
  (`requireWhatsappUser`, 403 para os demais) em todas as rotas
  `/api/whatsapp/*` com login; o webhook do bridge não muda. Para liberar mais
  gente, adicionar o e-mail na lista.
- Tela do WhatsApp no formato WhatsApp Web: lista de conversas à esquerda
  (foto do contato, horário, prévia, contador de não lidas, chamado
  vinculado), pesquisa por nome/número/chamado/texto e filtros Todas / Não
  lidas / Com chamado; conversa aberta ao lado em vez de janela sobreposta. No
  celular mostra uma coisa por vez, com botão de voltar. Fotos da lista só são
  buscadas quando a linha aparece na tela. Botões do modelo sem função no
  sistema (chamada, vídeo, novo grupo, favoritos) ficaram de fora.

### Jira: telefone do técnico não é mais enviado

Pedido do usuário. O telefone do técnico não vai para nenhum campo do Jira;
onde o Jira espera algo, vai `.`:

- Bloco "Dados dos técnicos" (`customfield_12279`): linha `TEL:` vira `TEL: .`,
  inclusive quando o texto é digitado à mão ou reaproveitado do Jira na
  transição para Agendado.
- "Telefone do Técnico" (`customfield_16237`): sempre `.` ao gravar dados do
  técnico, sobrescrevendo telefone antigo de agendamentos anteriores.
- "Número Contato" (`customfield_11963`): o código gravava o telefone do
  técnico aqui, mas `JIRA_FIELDS.md` documenta esse campo como contato do
  solicitante. Parou de gravar (sem `.`, para não apagar dado real do
  solicitante). Conferir no Jira qual é o uso real desse campo.
- A regra fica no servidor (`lib/server/jira.ts`, com
  `lib/technician-data.ts` testado), então vale para agendamento individual,
  em lote e fila de sincronização; as telas de agendamento já preenchem
  `TEL: .`.

**Pendente:** não validado contra o Jira real nesta sessão (nenhum chamado foi
agendado de teste). Conferir no próximo agendamento que o Jira aceita o `.`
nos campos de telefone. Telefones já gravados em chamados antigos só são
substituídos quando o chamado for reagendado.

### WhatsApp: assinatura de quem respondeu na própria mensagem

Mensagens de texto enviadas pelo sistema chegam ao contato com a primeira
linha em negrito `*Lohan · Gerência*` (primeiro nome + cargo do sistema).
Fotos, vídeos e documentos levam a assinatura na legenda; áudios não, porque o
WhatsApp não aceita legenda em áudio. O banco guarda o texto sem a assinatura
(a caixa de entrada já mostra o remetente acima da mensagem), inclusive quando
o eco do bridge chega antes. Rótulo compartilhado em `lib/whatsapp-sender.ts`,
com teste.

### WhatsApp: mídia, mensagens enviadas pelo celular, "digitando..."

- Mensagens enviadas direto pelo celular (fora do sistema) agora aparecem na
  conversa. O bridge ignorava tudo que era `fromMe`; agora encaminha como
  `outgoing` sem `sender_email`. O eco de uma resposta enviada pelo próprio
  sistema tem o mesmo `wamid`: o webhook usa `INSERT OR IGNORE` e o envio usa
  upsert que só preenche `sender_email` (`lib/server/whatsapp-bridge.ts`).
- Imagem, vídeo, áudio, documento e figurinha, recebidos e enviados. A mídia
  fica no disco do bridge (volume do Fly, `auth/media/`), não no D1 (limite de
  tamanho de linha). O navegador busca por `GET /api/whatsapp/media/[id]`
  (proxy com login) e exibe via blob URL.
- Envio: clipe (qualquer arquivo), câmera (foto/vídeo) e gravação de áudio
  pelo microfone. O navegador grava webm/opus e o bridge converte para
  ogg/opus com ffmpeg, formato que o WhatsApp do celular toca como áudio de voz.
  Limite de 32 MB por arquivo.
- Cabeçalho mostra foto de perfil do contato, "online", "digitando..." e
  "gravando áudio..."; o contato também vê quando o atendente está digitando.
  Consulta a cada 3 s (`/api/whatsapp/conversations/[phone]/presence`).
- Localização e contato compartilhados aparecem como link/nome.
- Removido o log de diagnóstico temporário do envio (substitui o PR #11).

**Pendente/limites:** grupos do WhatsApp continuam fora da caixa de entrada.
Sem confirmação de entregue/lido (check simples). Disco do bridge é de 1 GB:
acompanhar uso; se encher, aumentar o volume (`fly volumes extend`) ou migrar a
mídia para R2. Um mesmo contato pode aparecer duas vezes se o WhatsApp alternar
entre número e `@lid`.

### Bridge não-oficial do WhatsApp (Baileys) como alternativa ao Cloud API

A integração oficial (Meta Cloud API, `app/api/whatsapp/`) exige migrar o
número ou usar o fluxo de coexistência via Embedded Signup — que por sua vez
exige o produto WhatsApp anexado a um app Meta, o que ficou travado num
estado inconsistente do lado da Meta ao tentar configurar (dashboard do app
"Caju OS" perde o produto da lista de "adicionar" sem nunca completar o
anexo; reproduzido tanto nesta sessão quanto pelo usuário, mesmo estado).

Como alternativa, explicitamente pedida pelo usuário ciente do risco:
`whatsapp-bridge/`, um serviço Node.js separado com
[Baileys](https://github.com/WhiskeySockets/Baileys) (protocolo do WhatsApp
Web, não a API oficial). Conecta como aparelho vinculado — o app do celular
continua funcionando normalmente.

- `whatsapp-bridge/index.js` — conecta, mostra QR no terminal, encaminha
  mensagens recebidas para `app/api/whatsapp/bridge-webhook/route.ts` e expõe
  `POST /send` pra envio, ambos autenticados por segredo compartilhado
  (`WHATSAPP_BRIDGE_SECRET`).
- `app/api/whatsapp/bridge-webhook/route.ts` (novo) — grava nas mesmas
  tabelas `whatsapp_messages`/`whatsapp_conversations` que a integração
  oficial usa, então a tela de WhatsApp do app funciona igual com qualquer
  uma das duas.
- `app/api/whatsapp/conversations/[phone]/send/route.ts` — agora usa o bridge
  automaticamente quando `WHATSAPP_BRIDGE_URL`/`WHATSAPP_BRIDGE_SECRET`
  estão configurados, sem isso cai no caminho antigo (Graph API da Meta).
- `db/env.d.ts` — `WHATSAPP_BRIDGE_URL`, `WHATSAPP_BRIDGE_SECRET`.

**Risco, documentado em `whatsapp-bridge/README.md`:** viola os Termos de Uso
do WhatsApp, risco de banimento do número, menos estável que a API oficial
(quebra quando a Meta muda algo no protocolo).

**Pendente:** o bridge precisa rodar num host próprio, sempre ativo (VPS,
Railway, Render, Fly.io — não roda em Cloudflare Workers, precisa de
WebSocket persistente e disco pra sessão). Ninguém ainda fez esse deploy nem
escaneou o QR code. Depois disso, configurar `WHATSAPP_BRIDGE_URL` e
`WHATSAPP_BRIDGE_SECRET` como secrets do Worker `caju-os`. Não testado
ponta-a-ponta.

Verificado: `npm test` (50/50), `npx tsc --noEmit`, `npm run build`. O
`whatsapp-bridge/` em si não tem testes (serviço isolado, sem CI aqui).

## 2026-09-13

### Validação sem peça obrigatória

- O campo **Peça a ser trocada** passou a ser opcional na validação. Ele só é
  preenchido quando houver troca de componente; os demais requisitos técnicos
  e datas continuam obrigatórios.

### Base segura do webhook WhatsApp Cloud API

- Criada a rota pública `GET/POST /api/whatsapp/webhook`: a inscrição usa
  verify token e cada POST exige assinatura HMAC `x-hub-signature-256` da Meta.
- Mensagens e status recebidos passam a ser persistidos de forma idempotente
  em `whatsapp_messages`; a carga integral não é registrada em logs.
- **Pendente:** aplicar migration `0027_whatsapp_messages.sql`, cadastrar os
  secrets do Worker e assinar o campo `messages` na Meta antes de ativar a
  caixa de entrada/respostas no sistema.

### Links clicáveis no resumo para WhatsApp

- A cópia do **Resumo para mensagem** agora envia `text/html` junto com
  `text/plain` quando o navegador permite, com os links como âncoras reais.
- Isso reduz falhas do WhatsApp/Teams ao transformar URLs longas em links
  clicáveis em mensagens grandes.
- O resumo foi enxugado para manter apenas FSA/status, link, loja/cidade,
  equipamento e `Resumo do problema "..."`, sem agendamento/técnico extra.
- Quando o título não traz um campo separado, o sistema separa equipamento e
  defeito alegado para evitar repetir a mesma informação no resumo.
- Ao copiar o resumo, o sistema consulta os detalhes do Jira e usa o campo real
  **Defeito alegado**; o texto do título permanece apenas como fallback.

Verificado localmente: testes, TypeScript e build.

---

## 2026-09-14

### Caixa de entrada do WhatsApp Business

- Nova tela **WhatsApp** (`/?view=whatsapp`, gerência/coordenador/N1/analista):
  lista as conversas recebidas pelo webhook já existente
  (`app/api/whatsapp/webhook/route.ts`), com contagem de não lidas, e abre
  cada uma em um painel de conversa.
- Dá para **vincular uma conversa a um chamado (FSA)** e abrir o chamado
  direto dali. O vínculo e o estado de lida ficam em uma tabela nova,
  `whatsapp_conversations` (um registro por contato), separada do log de
  mensagens (`whatsapp_messages`).
- **Responder pelo app** já está implementado (`POST
  /api/whatsapp/conversations/[phone]/send`, via Meta Graph API), mas
  **inativo em produção**: falta configurar os secrets
  `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` do Worker (o tipo
  já previa essas chaves em `db/env.d.ts`, só não estavam cadastradas). Sem
  eles a rota responde 503 com mensagem clara. O usuário ainda não tem o
  token — passo a passo de onde gerar ficou registrado na conversa com o
  Claude, não neste changelog (é uma credencial, não decisão técnica).
- **Pendente:** notificação/alerta proativo de mensagem nova (hoje é só
  contagem ao abrir a tela, sem polling em segundo plano/desktop
  notification como o de chamado novo do Jira).
- **Pendente:** migration `0030_whatsapp_conversations.sql` (tabela nova +
  `whatsapp_messages.sender_email`) precisa rodar em produção com
  `npm run db:migrate:remote`.

Verificado localmente: `npm test` (50/50), `npx tsc --noEmit`, `npm run build`.
Nenhum teste manual contra o Meta Graph API real foi possível nesta sessão
(sem token de acesso ainda) — a rota de envio está implementada conforme a
documentação pública da Cloud API, mas não foi exercitada de ponta a ponta.

---

### Segunda rodada do feedback operacional (gestão de grupo, cadastro, RG)

- **Grupos de chat**: agora dá para renomear o grupo, excluir o grupo,
  editar mensagem própria (guarda um histórico de edição visível só para
  quem editou) e apagar mensagem própria (some para os demais participantes,
  mas quem enviou continua vendo o texto original como prova do que foi
  dito). Ver, adicionar e remover participante já existiam e continuam
  funcionando; só faltavam essas quatro ações.
- **Cadastro de colaborador pela tela Equipe**: o formulário "Adicionar
  funcionário" (`EmployeeInvitePanel`) já existia, mas só aparecia em
  Configurações. Agora também aparece na aba "Equipe interna" da tela
  Equipe (só para gerência), que é onde o usuário esperava encontrá-lo.
- **RG falso enviado ao agendar técnico**: ao selecionar um técnico na
  busca do agendamento, o sistema preenchia a linha "RG" com o texto
  literal "Não informado" — um valor fictício que arriscava ser gravado
  como se fosse dado real no Jira (o parser do lado servidor já ignora
  linha de RG vazia, mas gravava esse texto porque ele não é vazio). A
  linha agora fica em branco; o rótulo abaixo do campo já avisava que dá
  para completar o RG manualmente.
- **Pendente**: migration `0029_chat_group_message_management.sql`
  (adiciona `edited_at`, `edit_history`, `deleted_at` em
  `chat_group_messages`) precisa rodar em produção com
  `npm run db:migrate:remote`.

Verificado localmente: `npm test` (44/44), `npx tsc --noEmit`, `npm run build`.

---

### Itens do feedback de 2026-09-14 ainda em aberto (avaliados, não corrigidos)

- **Chamados avulsos** (criar chamado fora dos projetos Americanas/Delfia):
  não implementado. Exige decisão de produto — em qual projeto/tipo de
  issue do Jira esses chamados devem nascer, e se "avulso" significa só
  Jira sem vínculo de loja/projeto, ou um registro puramente local. Não dá
  para resolver com uma suposição, por tocar fluxo Jira de produção.
- **Histórico com chamados já atendidos/validados**: a tela "Histórico de
  chamados" (`ticket-history.tsx`, tabela `ticket_archives`) já grava uma
  cópia a cada alteração salva no Jira por este app — incluindo transições
  para validado/resolvido — então um chamado que passou por aqui já
  aparece. O que o usuário viu foi a lista de seleção de chamados para
  anexar ao chat (painel de colegas), que só lista chamados atualmente
  ativos na consulta do Jira; ampliar essa lista para incluir arquivados
  não foi feito nesta rodada.
- **Cabeçalho "bugado" na busca de técnicos de campo**: não reproduzido.
  Não há elemento `sticky`/`fixed` na seção "Buscar técnicos próximos"
  além do cabeçalho principal do app (que já existia antes deste
  feedback); precisa de print/vídeo do problema real no celular para
  investigar sem chutar uma correção.
- **Dados do técnico não salvando no Jira**: o formulário e o botão
  "Salvar alterações no Jira" estão corretamente conectados ao estado e
  ao `PATCH /api/jira/issues/[key]`; não foi encontrado bug óbvio no
  código. Já está listado em `docs/KNOWN_BUGS.md` como prioridade 1 para
  validar em produção com um chamado real — não dá para confirmar sem
  testar contra o Jira ao vivo.

---

### Primeira rodada do feedback operacional

- Criar um atendimento agora o deixa **em preparação**; somente o botão **Iniciar agora** marca a execução. Chamados reais adicionais podem ser vinculados ao grupo existente, antes ou depois do início. Atendimento já existente permanece em andamento após a migration.
- Valor do grupo fica visível/editável na criação para analistas, coordenação e gerência; N1 não define preço.
- A lista e agenda de chamados passam a exibir o campo Jira **Nome do Técnico** (`customfield_12316`), em vez do responsável pelo ticket.
- No celular, o mapa abre em modo leve e só carrega o mapa interativo sob demanda; seu contêiner fica abaixo do menu lateral.
- Alertas operacionais não são mais truncados enquanto a contagem mostra todos; há ação **Marcar como lido**. Exportação de contatos mantém link direto do CSV caso o download automático falhe no celular.
- O atalho de criação externa foi retirado das telas sem contexto de chamados e explicitamente identificado como criação no Jira.
- **Pendente:** o encerramento com evidências foi adiado a pedido do usuário. Ainda precisam de escopo próprio: criação de chamados avulsos, gestão completa de grupos/mensagens, preenchimento do histórico de FSAs não editadas, cadastro de colaborador pela tela Equipe e diagnóstico da escrita dos dados do técnico no Jira.

### Pesquisa por data não mistura direcionados

- Perguntas como “quantos chamados tem para amanhã” ou por horário agora contam
  apenas chamados **Agendados** quando o usuário não pedir outro status
  explicitamente.
- Chamados **Direcionados** só entram se a pergunta pedir direcionados.

Verificado localmente: testes, TypeScript e build.

---

### Resumo para mensagem no formato operacional

- A opção **Copiar → Resumo para mensagem** agora gera blocos no padrão:
  FSA/status, link `https://app.cajutech.net/?ticket=FSA-...`, loja/cidade,
  equipamento e “Resumo do problema”.

Verificado localmente: testes, TypeScript e build.

---

### Pesquisa operacional na dashboard

- A tela inicial ganhou o bloco **Pesquisar operação** para responder perguntas
  simples como “quantos chamados tem para amanhã”, “quantos chamados tem para
  10h”, “quantos estão agendados” e “quantos estão sem mandar para validação”.
- A resposta mostra a contagem e uma lista selecionável dos chamados do resultado,
  com **Selecionar tudo/Desmarcar tudo** e clique direto para abrir a FSA.
- A busca cruza status, data/hora de agendamento e fila de validação já carregada
  no painel operacional.

Verificado localmente: testes, TypeScript e build.

---

### Resumo com link compartilhável e limite de dois N1

- A opção **Copiar → Resumo para mensagem** agora inclui o link interno
  `https://operacoes.cajutech.net/?ticket=FSA-...` para cada chamado
  selecionado, em vez de depender do link do Jira.
- Cada chamado N1 agora aceita no máximo dois N1: o primeiro que assumir vira
  **N1 principal** e o segundo vira **N1 participante**.
- Um terceiro N1 recebe bloqueio com aviso de que o chamado já tem principal e
  participante.
- Validação N1 pode ser feita pelo principal ou pelo participante.
- O cartão de equipe do chamado mostra N1 principal e participante quando houver.
- Migração `0026_n1_participant.sql` adiciona os campos do participante no D1.

Verificado localmente: testes, TypeScript e build.

---

### Primeira camada de segurança para venda

- `requireApiUser` agora aplica rate limit por IP e por usuário/método em todas
  as APIs autenticadas.
- Recuperação de senha tem rate limit próprio sem login.
- Negativas por cargo, convites e uploads de anexo geram `security_audit` nos
  logs, com tokens/senhas/cookies removidos.
- Upload de evidências para o Jira passa a validar MIME, tamanho, extensão e
  assinatura binária antes de enviar para a Atlassian.
- APIs gerais de detalhe/anexo do Jira ficam restritas a gerência,
  coordenação, N1 e analistas.
- `docs/SECURITY_READINESS.md` registra o que entrou e o plano de backup /
  recuperação.
- GitHub Actions ganhou backup diário do D1 via `wrangler d1 export`, com
  retenção de 30 dias, além do script `npm run backup:d1:remote`.
- Adicionado script de restore D1 com confirmação explícita por `--yes`.
- Headers de segurança ganharam CSP em modo `Report-Only` para observação antes
  de bloqueio real.

**Pendente:** confirmar secrets de backup no GitHub, ativar alerta dos logs no
Cloudflare, criar staging e rodar auditoria externa LGPD/segurança.

---

### Histórico permanente de chamados (branch `codex/ticket-history`)

- Chamados que recebem atualização operacional, direcionamento, agendamento em lote, validação N1 ou alteração direta no Jira agora têm uma cópia persistente no D1. A cópia conserva a última situação conhecida, o responsável pela captura e a razão da alteração, sem depender de o chamado continuar na fila do Jira.
- Nova tela **Histórico de chamados** no menu principal, com busca, ordenação por data (mais novos/mais antigos), abertura da ficha salva e consulta de dados operacionais relacionados: auditoria, evidências, visitas, tarefas, rastreios e vínculos N1.
- O backup administrativo passa a incluir os registros arquivados. Perfis fora da gerência continuam recebendo os campos financeiros sensíveis ocultos na consulta detalhada.
- A migração `0025_ticket_history.sql` cria `ticket_archives` e importa os fluxos operacionais já existentes, para que históricos locais anteriores não sejam perdidos.

**Pendente:** aplicar `npm run db:migrate:remote` antes de enviar esta branch à `main`; sem a migração, a nova tela não terá a tabela necessária no D1 de produção.

---

### Busca de técnicos, contatos CSV e vínculos de atendimento (branch `codex/technician-dispatch-and-contacts`)

- A aba Técnicos de campo agora busca 2/5/10/20 técnicos mais próximos de uma cidade/UF, mostrando nome, telefone, cidade/UF e distância aproximada em linha reta. A busca usa centros das cidades do mapa local e geocodificação Nominatim/cache quando necessário; não representa trajeto rodoviário.
- Exportação de contatos em CSV com o cabeçalho do Google Contatos, prefixo TCP, nomes capitulares reduzidos aos dois primeiros nomes próprios (preservando partículas), telefone brasileiro normalizado e numeração a partir do último TCP informado antes de cada exportação. Técnicos sem telefone válido são omitidos.
- Cada FSA pode ser compartilhada pelo link direto `/?ticket=FSA-...`; o painel mostra N1 que assumiu, analista que marcou (gestão operacional, detalhe do Jira ou lote) e técnico de campo cadastrado. A ficha do técnico mostra sua fila por ID, sem aproximação de nomes. O lote agora exige a seleção de um técnico da base para gravar os vínculos em todas as FSAs. A edição direta no Jira tenta identificar o técnico por CPF ou nome exato; se houver ambiguidade, não cria vínculo novo.
- Atendimentos com múltiplas FSAs exigem nome do grupo de WhatsApp digitado manualmente. A gerência pode registrar um valor único do grupo, sem repeti-lo nas FSAs; esse valor não é somado automaticamente ao financeiro atual. A migração `0024_overrated_whizzer.sql` adiciona os campos necessários.

**Pendente:** aplicar a migração no D1 antes de qualquer deploy; validar os fluxos com contas reais de gerência/N1/analista e dados reais do Jira. A lista por proximidade só inclui técnicos cuja cidade de origem existe no mapa local; não calcula tempo/custo de viagem.

Verificado localmente: 42 testes, TypeScript e build. Lint global ainda apresenta erros preexistentes em diversos arquivos.

---

### Volta a lista ranqueada de tecnicos no dialogo de operacao

O usuario pediu de volta a recomendacao automatica que o commit `98a254f` tinha
retirado da UI. Como a camada de calculo nunca saiu do repositorio, a volta foi
so de interface.

- `components/operation-workflow-dialog.tsx`: nova secao "Melhor tecnico
  calculado" (icone `Brain`), acima de "Auditoria do chamado". Volta a chamada a
  `recommendTechnicians`, com os tres primeiros colocados, o card clicavel que
  preenche `technicianId`, a estrela no primeiro, o selo `score/100`, a
  cidade/estado com status e a linha de motivos.
- Diferenca em relacao ao que existia antes de `98a254f`: a secao agora ocupa a
  largura toda (era um grid de duas colunas) porque o painel "Artigos e
  checklists sugeridos" **nao** foi restaurado — o usuario pediu de volta so a
  lista de tecnicos. `knowledgeArticles` segue em
  `lib/operational-intelligence.ts`, sem consumidor de UI.
- O "Mural da equipe" (`BulletinBoard`) continua fora da home, como em `98a254f`.

**Pendente:** quando os tecnicos nao tem dados proprios de geolocalizacao, todos
caem na distancia padrao e saem com a mesma nota (ex.: tres com `49/100` e os
mesmos motivos). E o comportamento atual do `estimatedDistanceKm`, nao uma
regressao desta mudanca; melhorar isso exige decidir a fonte de distancia.

Verificado: `npm test` (35/35), `npx tsc --noEmit`, `npm run build`.

---

## 2026-09-13

### Chat: visual inspirado na referência animada

- Conversas individuais e em grupo receberam superfície escura com gradiente sutil, cabeçalho e composição integrados, bolhas com profundidade e entrada suave.
- O indicador de digitação usa três pontos animados ligados ao estado real da conversa. Movimento reduzido desativa as animações.
- O envio, histórico, anexos, compartilhamento de chamados e chamadas permanecem ligados aos dados reais; a reprodução e as respostas fictícias do componente de demonstração não foram incorporadas.
- Campo e envio do chat em grupo ganharam rótulos acessíveis e estado desabilitado quando não há conteúdo para enviar.
- Conversas individuais abrem como uma janela flutuante no canto inferior direito, no padrão Messenger; em telas pequenas usam a largura disponível sem ocupar a altura inteira.

## 2026-09-12

### Endurecimento pré-lançamento a partir dos dois vídeos

- Chat individual/grupo e evidências N1 agora recusam data URLs cujo conteúdo
  não corresponde ao MIME declarado; RAT confirma assinatura da imagem antes
  de enviá-la à IA. Anexos legados de tipo não permitido deixam de abrir na
  interface. Entradas inválidas do chat retornam 400 em vez de 500.
- Worker aplica cabeçalhos básicos de segurança. O cookie de preferência da
  barra lateral usa SameSite e Secure em HTTPS.
- Painel interno marcado noindex, com `robots.txt` restritivo e página 404.
- Login agora pode rolar na vertical em telas baixas/landscape e não contém
  rótulos HTML aninhados; imagens da marca usam otimização do framework e o
  aviso de sucesso tem semântica de status. 404 usa altura dinâmica da viewport.
- Contraste do azul principal corrigido para texto escuro (5,2:1); bolhas do
  chat mantêm texto branco com azul ligeiramente mais profundo (4,56:1).
- Checklist completo e pendências deliberadas: `docs/PRELAUNCH_AUDIT.md`.

**Pendente:** auditoria de autorização, segredos no histórico Git, WAF,
política jurídica, CSP e testes autenticados de acessibilidade/performance.
Não houve publicação em produção.


### Chat: bolhas no estilo iMessage, adaptadas ao tema do app

Pedido do usuario, com referencia visual (demo iMessage). Escopo escolhido: so o
visual das bolhas, cores do tema atual.

- `app/globals.css`: classes `.chat-thread` / `.chat-bubble*` (cauda curva na
  ultima bolha da sequencia, cantos internos quadrados dentro da sequencia,
  emoji sozinho em tamanho grande). Superficie solida `--chat-thread`, que a
  cauda precisa para o recorte.
- `components/user-menu.tsx`: conversa direta e de grupo usam as classes; no
  grupo o nome do remetente aparece so no inicio da sequencia. Horario e ticks
  por bolha deram lugar a um recibo unico no fim (`Enviada/Entregue/Lida HH:MM`).
- Fora do escopo: reacoes (tapback), que exigiriam tabela e API novas.

Verificado: `npm test` (36/36), `npx tsc --noEmit`, `npm run build`.

### Retirada da UI: mural da equipe e recomendacao automatica de tecnico

Pedido do usuario: aposentar o "Mural da equipe" e a "Inteligencia
operacional". Escopo escolhido: **somente a UI**. Nada foi removido do banco
nem da camada de API.

- `app/page.tsx`: o `BulletinBoard` nao e mais renderizado na visao "overview".
  O componente `components/bulletin-board.tsx`, a rota `app/api/bilhetes` e a
  tabela `bulletin_notes` continuam no repositorio/banco, agora sem ponto de
  entrada na interface.
- `components/operation-workflow-dialog.tsx`: a secao "Central inteligente do
  chamado" perdeu a lista ranqueada de tecnicos (`recommendTechnicians`) e os
  artigos sugeridos (`knowledgeArticles`). O que sobrou da secao e a auditoria
  detalhada, e ela foi renomeada para "Auditoria do chamado". A atribuicao de
  tecnico continua disponivel pelo campo de busca manual.
- `lib/operational-intelligence.ts` permanece; o dialogo ainda usa
  `delegatedTaskState` e o tipo `DispatchTechnician`. `recommendTechnicians`,
  `knowledgeArticles`, `KNOWLEDGE_ARTICLES` e os helpers de score
  (`estimatedDistanceKm`, `travelCostCents`, `matchesSpecialty`,
  `matchesTools`) ficaram sem nenhum consumidor.

Verificado: `npm test` (36/36), `npx tsc --noEmit`, `npm run build`.

**Pendente:** decidir, com o usuario, o destino final do que ficou orfao — o
componente do mural + rota + tabela, e as funcoes de recomendacao em
`lib/operational-intelligence.ts`. Docs (`AI_HANDOFF.md`, `ARCHITECTURE.md`,
`PRODUCT_REQUIREMENTS.md`) ainda descrevem a recomendacao automatica como ativa
e devem ser corrigidas quando essa decisao sair.

---

## 2026-09-11

### Kanban: as quatro etapas que a operação acompanha na mesma tela — *(este trabalho, branch `claude/kanban-quatro-colunas`)*

Pedido do usuário: ver "Pendente de agendamento", "Agendado", "Técnico em campo"
e "Aguardando spare" juntas, sem rolar. Em 1366px apareciam três, porque a
quarta coluna só entrava a partir de 1536px, e "Técnico em campo" era a quinta
da lista.

- Ordem das colunas: Pendente de agendamento, Agendado, Técnico em campo,
  Aguardando spare, Direcionado (era Aguardando spare e Direcionado antes de
  Técnico em campo).
- Grade: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5` —
  quatro colunas a partir de 1280px. **Não use `min-[...]` junto com faixas
  padrão aqui:** no CSS que o Tailwind gera, as medidas personalizadas vêm
  antes de todas as faixas nomeadas, então `lg:grid-cols-3` vencia
  `min-[1200px]:grid-cols-4` e a tela continuava com três colunas. Medido na
  produção: `lg:3 + min-[1200px]:4` → 3 colunas; `lg:3 + xl:4` → 4. Pelo
  mesmo motivo, o `min-[1920px]:grid-cols-5` que existia antes nunca teve
  efeito.
- Densidade do cartão, para caber sem espremer: padding `p-4` → `p-3`,
  espaçamentos internos menores, lista da coluna `space-y-3` → `space-y-2` e
  título da coluna em `text-[11px]` com `truncate` em vez de quebrar em duas
  linhas.

**Verificado** na produção, com o usuário logado no Chrome (1366px): as quatro
colunas aparecem na ordem pedida. Abaixo de 1280px voltam três.

### Última movimentação do rastreio e planilha abrindo pelo app (0.1.15) — *(este trabalho, branch `claude/rastreio-evento-e-planilha`)*

Dois pedidos do usuário no mesmo lote.

**Última movimentação (banco):** `shipment_tracking.last_event` guarda o
`latest_event` da TrackingMore, gravado junto com o status pelo cadastro e
pelo cron. A tela de spares mostra "Última movimentação" no detalhe, abaixo do
status. Migration `drizzle/0023_spotty_cargill.sql`.

**Planilha no app desktop:** `open_external_url` (Rust) passa a aceitar
`*.sharepoint.com` além do Jira e dos grupos do WhatsApp, então "Abrir
planilha compartilhada" abre no navegador do sistema em vez de ser recusado.
Versão 0.1.15 em `tauri.conf.json`, `Cargo.toml` e
`app/api/app-version/route.ts`.

**Cuidado com a migration gerada:** `npm run db:generate` produziu, junto da
coluna, um `CREATE TABLE` das tabelas de `active_attendances` — o snapshot
do drizzle estava defasado porque a `0022` foi escrita à mão. O `.sql` foi
recortado para conter só o `ALTER TABLE`; o snapshot novo já reflete o banco
real. Conferido em produção: `0022` consta aplicada em 2026-09-10.

**Pendente:**
- `npm run db:migrate:remote` precisa rodar **antes** do deploy: sem a coluna,
  a gravação do rastreio falha.
- Instalador 0.1.15 precisa ser gerado (`npm run desktop:build`), publicado em
  `public/downloads/` e distribuído aos usuários — quem ficar no 0.1.14
  continua sem abrir a planilha pelo app (mas não trava mais: o link é copiado).

### "Abrir planilha" prendia o usuário dentro do app desktop — *(este trabalho, branch `claude/abrir-planilha`)*

Relato do usuário: clicar em "Abrir planilha compartilhada" no desktop abria a
planilha dentro do WebView, em proporção estranha e sem como voltar ao sistema.

Causa: `open_external_url` (Rust) só libera `*.atlassian.net` e
`chat.whatsapp.com`. A planilha é do SharePoint, o comando recusa, e o
`catch` das telas fazia `window.location.href = url` — trocando o Caju OS
pela planilha na mesma janela, sem barra de endereço nem voltar.

- `lib/open-external.ts`: `openExternalUrl` tenta o comando do desktop, cai
  para janela nova do navegador e devolve `'blocked'` em vez de navegar a
  janela atual. Nunca mais substitui o sistema pela página.
- Tela de spares e botão "Abrir chamado" do Jira usam o utilitário; quando
  bloqueia, o link é copiado e o aviso diz para colar no navegador.

**Pendente:**
- Para a planilha abrir direto pelo app, `open_external_url` precisa liberar o
  host do SharePoint — muda `src-tauri/`, exige EXE novo (`npm run
  desktop:build`), publicação do instalador e bump em
  `app/api/app-version/route.ts`. Não feito: aguarda pedido do usuário.
- Quem já está preso na planilha precisa fechar o app (Alt+F4) e reabrir.

### Rastreio: ignora texto no lugar do código e corrige a Shopee — *(este trabalho, branch `claude/rastreio-ajustes`)*

Achados da primeira rodada real em produção (61 códigos consultados: 32
entregues, 14 aguardando informações, 5 em trânsito, 10 indisponíveis):

- **Texto no lugar do código.** Os 10 "Rastreio indisponível" eram
  `SEM INFORMAÇÕES` (8), `VIA TÉCNICO` e `AGUARDANDO CÓDIGO`, vindos da
  planilha. `looksLikeTrackingCode` (mínimo 8 caracteres e 6 dígitos) passa a
  barrar esses valores no cadastro, na função compartilhada e na seleção do
  cron — sem consulta e sem registro.
- **Detecção errada da Shopee.** 4 códigos `BR` + 12 dígitos + letra foram
  detectados como "followmont"/"northline" (transportadoras australianas).
  `knownCourier` reconhece esse padrão como `spx-br` localmente, e
  `courierFor` dá prioridade ao formato conhecido sobre a transportadora
  guardada numa consulta anterior — então os 4 se corrigem na próxima rodada.
  Também economiza a chamada de detecção nos códigos da Shopee.

**Pendente:**
- Os 10 registros com texto continuam gravados em `shipment_tracking` e
  aparecem como "Rastreio indisponível" na tela; não são mais atualizados.
  Apagar exige decisão do usuário (dado de produção).
- Correios e Shopee não devolvem `scheduled_delivery_date` pela TrackingMore:
  a previsão segue vazia. Guardar a última movimentação exigiria coluna nova.

### Rastreio também para os spares já cadastrados — *(este trabalho, branch `claude/rastreio-spares-existentes`)*

Pedido do usuário: os spares que já estavam no sistema também devem mostrar o
rastreio, não só os cadastrados depois da integração com a TrackingMore.

- `lib/server/spare-tracking.ts`: `recordSpareTracking` (antes inline em
  `POST /api/spares`) passa a ser usada pelo cadastro e pelo cron;
  `refreshSpareTracking` faz uma rodada.
- Cron (`scripts/worker-entry.js`): `POST /api/spares/tracking` a cada 10 min,
  8 spares por rodada. Universo: spares ativos (fora de FINALIZADO, ENCERRADO,
  FECHADO e CANCELADO) com código, uma vez por chamado + código — em produção,
  no máximo 33 códigos distintos. Nunca consultados primeiro; depois reconsulta
  a cada 6 h até "Entregue". Erro de conta (401, 429, 4190) interrompe a rodada;
  código problemático vira "Rastreio indisponível" e só volta 6 h depois.
  Gerente logado também pode chamar a rota.
- `GET /api/spares` anexa o status consultado (`tracking`) a cada spare. Tela
  de spares: etiqueta do status na lista e "Status do rastreio" no detalhe, com
  a transportadora pelo nome; o diálogo do chamado também mostra "Correios" /
  "Shopee Express" em vez do `courier_code`.
- `lib/tracking.ts`: `pickDueTrackings` (puro, testado) e
  `CLOSED_SPARE_STATUSES`, que a tela de spares passa a usar no lugar da sua
  própria lista.

**Pendente:**
- Custo: cada código novo consome 1 crédito da TrackingMore; reconsultar o
  mesmo código não. Segundo fontes de busca, o plano grátis não inclui API —
  confirmar no painel da TrackingMore se a chave não é só de teste.
- Ainda não exercitado com sucesso contra a API real.
- Códigos digitados só no diálogo do chamado, sem spare, continuam sem consulta.

### Rastreio automático de spares pela TrackingMore — *(este trabalho, branch `claude/rastreio-trackingmore`)*

Pedido do usuário: ao cadastrar um spare com código de rastreio, consultar o
status e o prazo automaticamente, sem redigitar o código. Serviço escolhido:
TrackingMore (único com API confirmada para Correios e Shopee Express Brasil).

- `lib/tracking.ts` (puro, com `tests/tracking.test.ts`): código dos Correios
  reconhecido pelo padrão `AA123456789BR` sem gastar chamada; demais códigos
  (ex.: Shopee Express, `spx-br`) vão para `POST /couriers/detect`. Traduz o
  `delivery_status` para português e extrai `scheduled_delivery_date`.
- `lib/server/trackingmore.ts`: API v4 (`Tracking-Api-Key`), `POST
  /trackings/create` — que já devolve o resultado — e, se o código já existia
  lá (4101), `GET /trackings/get`. Timeout de 10 s; sem chave, não faz nada.
- `POST /api/spares`: depois de gravar o spare, consulta o código e grava
  transportadora, status e previsão em `shipment_tracking` — a mesma tabela
  que "Rastreios e entregas" do chamado já exibe; **sem migration**. Preenche
  a "Previsão de entrega" do spare quando estiver vazia. Falha na consulta não
  desfaz o cadastro; o aviso da tela diz o que aconteceu.

**Pendente:**
- **Ação humana:** criar a conta na TrackingMore, gerar a API key e cadastrar
  como secret `TRACKINGMORE_API_KEY` no Worker `caju-os`. Sem ela, o
  cadastro segue igual e a tela avisa que a consulta não está configurada.
- Não exercitado contra a API real (sem chave durante o desenvolvimento). O
  campo `data` da resposta é tratado como objeto ou lista.
- Só o cadastro consulta. Rastreios digitados no diálogo do chamado e a
  atualização periódica dos spares em trânsito ficaram de fora (decisão
  pendente do usuário) — ver `docs/KNOWN_BUGS.md`.

### Deploy automático a cada push na main — *(este trabalho)*

Pedido do usuário: publicar produção automaticamente. O Worker `caju-os` já
estava ligado ao repositório pelo Cloudflare Workers Builds, mas o build
falhava: o deploy command era `npx wrangler deploy --config
dist/server/wrangler.json`, que pula o `patch-wrangler.mjs` (subiria com o D1
placeholder e o nome `sites-project`). O `1442228` tinha criado um workflow
no GitHub Actions para o mesmo fim; foi removido para não haver dois deploys e
porque exigiria um token de API mantido à mão.

- `scripts/cf-config.mjs`: sem `.cloudflare.json`, lê os valores das build
  variables — todas obrigatórias, para o deploy nunca derrubar o domínio nem
  apagar as vars do Jira. Teste em `tests/cf-config.test.ts`.
- Workers Builds (painel): build command `npm test && npx tsc --noEmit && npm
  run build`, deploy command `npm run deploy`, 7 build variables cadastradas,
  builds de outras branches desligados.
- Regras atualizadas em `CLAUDE.md`, `AGENTS.md`, `docs/WORKFLOW_RULES.md`
  (15 e 17), `docs/AI_HANDOFF.md` e `docs/DEPLOYMENT.md`: push na `main` é
  deploy de produção.

**Pendente:**
- Migrations continuam manuais (`npm run db:migrate:remote`).
- As variables `D1_DATABASE_NAME` e `JIRA_BASE_URL` cadastradas no GitHub
  (Settings → Secrets and variables → Actions) ficaram sem uso; podem ser
  apagadas.

### Ações em lote nos chamados: agendar, técnico em campo, copiar — *(este trabalho)*

Generaliza o agendamento em lote do `7830ac1` (ainda não publicado) numa
seleção de chamados com barra de ações.

- Qualquer chamado do Kanban ou da lista pode ser selecionado: caixa no canto
  do card, "selecionar todos" no cabeçalho de cada coluna e no topo da lista.
  A caixa não cobre mais o selo de prioridade (no `7830ac1` ela ficava por
  cima dele).
- Barra flutuante com a seleção: **Copiar** (só as FSAs / resumo para
  mensagem / planilha em colunas), **Agendar N** (só os que estão em Pendente
  de agendamento, mesmo técnico e horário), **Técnico em campo N** (só os
  Agendados, com confirmação) e limpar. Selecionados fora da etapa exigida
  ficam de fora e o diálogo diz quantos.
- `app/api/jira/issues/batch/route.ts` substitui `batch-schedule`:
  `POST { status: 'scheduled' | 'in_service', keys, technicianData?, scheduledDateTime? }`.
  Confere no servidor a etapa atual de cada FSA antes de transicionar
  (WORKFLOW_RULES, regra 2), grava snapshot e auditoria por chamado, processa
  4 por vez e, com o Jira fora do ar, enfileira em `jira_sync_jobs`
  (regra 5) — só depois de a etapa ter sido conferida.
- `lib/bulk-actions.ts`: regras puras (elegibilidade por etapa, papéis que
  podem transicionar, formatos do clipboard), cobertas por
  `tests/bulk-actions.test.ts`.
- `lib/clipboard.ts`: `copyToClipboard` saiu de `app/page.tsx` para ser
  reutilizado pela barra.
- Depois da ação, o cache de 5 min da fila (`caju-jira-issues-cache:*`) é
  invalidado, para um recarregamento não trazer a etapa antiga de volta. Os
  chamados alterados continuam selecionados (dá para agendar e logo em
  seguida copiar o resumo para mandar ao técnico).

**Pendente:**
- Não testado contra o Jira real — validar cada ação com 2–3 FSAs antes de
  usar em volume.
- Limite de subrequests do Worker por requisição ainda não confirmado: são
  ~6 chamadas ao Jira por FSA, até 40 FSAs por lote.
- Outras transições em lote (Direcionado, Aguardando spare, validação) ficaram
  de fora de propósito: têm requisitos próprios (spare, evidências, valores)
  que precisam de regra definida antes.

### Agendamento em lote de chamados no Jira — *(este trabalho)*

Chamados em **Pendente de agendamento** agora podem ser selecionados (checkbox
no card do Kanban e na lista) e agendados de uma vez: mesmo técnico e mesma
data/hora aplicados a todas as FSAs selecionadas.

- `app/api/jira/issues/batch-schedule/route.ts` (nova): `POST` com `keys`,
  `technicianData` e `scheduledDateTime`. Perfis `gerencia`, `coordenador`,
  `analista` e `n1`; máximo de 40 FSAs por chamada. Para cada FSA, em
  sequência: snapshot em `ticket_snapshots`, `updateJiraIssue` (técnico +
  data), `transitionJiraIssue(..., 'scheduled')` e registro em
  `operational_audit` com antes/depois. Falha em uma FSA não interrompe as
  outras — a resposta traz o resultado por chamado.
- `components/bulk-schedule-dialog.tsx` (novo): busca de técnico em
  `/api/technicians`, texto editável dos dados enviados ao Jira, data/hora
  (convertida para `-0300`) e lista de resultado por FSA.
- `app/page.tsx`: seleção por chamado, "Selecionar para agendar" para os
  visíveis, botão "Agendar N" e atualização local para "Agendado" nas FSAs
  que tiveram sucesso.

Respeita a regra 2 de `WORKFLOW_RULES.md` (técnico + data preenchidos antes
da transição para Agendado).

**Pendente:**
- Não testado contra o Jira real — validar com 2–3 FSAs antes de usar em
  volume.
- Cada FSA faz ~6 chamadas ao Jira; um lote de 40 passa de 200 subrequests
  numa única requisição do Worker. Confirmar o limite do plano Cloudflare ou
  reduzir `MAX_BATCH_SIZE`.
- Sem teste automatizado para a rota.

### Sincronização de spares importava metade da planilha em silêncio — *(este trabalho)*

A FSA-132148 estava na linha 381 da planilha e não aparecia no sistema.
Investigando o D1 de produção: a tabela `spares` tinha **exatamente 256 linhas**,
todas `sync_status='synced'`, nenhuma falha registrada, e a maior FSA era a
`FSA-128845`. 256 é o tamanho de página padrão da ação **List rows present in a
table** do Power Automate quando a paginação está desligada — o conector
devolvia a primeira página e respondia HTTP 200, então tudo depois da linha 256
nunca chegava.

O defeito do nosso lado não era a leitura truncada (isso é configuração do
fluxo), e sim **não perceber o truncamento**: a rota respondia
`ok: true, imported: 256` e o botão dizia "Sincronização concluída". Foi por
isso que o problema ficou invisível por dias.

Agora `lib/spares-pull.ts` detecta uma resposta que bate exatamente num tamanho
de página conhecido do conector, `/api/spares/sync` devolve `warnings[]` e marca
`ok: false`, e a tela mostra "Sincronização incompleta" com a instrução do que
ligar no Power Automate. O teto da rota subiu de 2.000 para 5.000 linhas e
passar dele também vira aviso, em vez de descartar a cauda calado.

**Pendente (fora do código):** ligar **Pagination** (Threshold 5000) na ação
*List rows present in a table* do Fluxo 2. Enquanto isso não for feito, as
linhas além da 256 continuam sem entrar. Depois de ligar, a próxima execução do
cron (≤10 min) importa o restante sozinha — o upsert é por `externalKey` e não
duplica.

**Também aberto:** `SPARES_SYNC_TOKEN` não está cadastrado no Worker, embora
este documento mande os dois fluxos conferirem o header `x-caju-sync-token`.
Como o pull funciona sem ele, os fluxos não estão validando o token — as URLs
do Power Automate estão efetivamente abertas a quem as tiver.


### Revisão de UI/UX: empilhamento, densidade e hierarquia — *(este trabalho)*

Auditoria visual das 11 telas em 375/768/1024/1440 px com
`scripts/ui-review.mjs`. As correções abaixo saíram de defeitos observados nas
capturas, não de preferência estética.

**Empilhamento (bug funcional).** O lançador de reunião usava `z-[65]` e
pintava **por cima de diálogos abertos** (`z-50`) — visível ao abrir um chamado.
`app/globals.css` agora define uma escala nomeada (`--z-content` … 
`--z-window-chrome`) e os elementos fixos passaram a referenciá-la. O lançador
fica sob os modais quando ocioso; durante uma chamada a superfície sobe para
`--z-live-call`, porque mutar/desligar precisa continuar alcançável com um
diálogo aberto.

**Estouro horizontal em `/spares` (375 px).** As abas não cabiam e empurravam o
documento, fazendo a página inteira rolar de lado. As abas ganharam rótulo curto
no mobile e `[data-slot='tabs-list']` passou a rolar dentro de si — guarda
global contra a mesma classe de defeito em qualquer tab strip.

**Densidade.** O Kanban abria só 2 colunas até 1536 px: em 1440 px (largura mais
comum) os 5 status ocupavam 3 fileiras. Agora são 3 colunas a partir de `xl` e 4
em `2xl`. Os KPIs do Financeiro seguiam a mesma regra e viravam 2×2 — agora são
4 em linha a partir de `xl`, o que traz o painel "Regra de repasse" para dentro
da primeira dobra.

**Hierarquia da visão geral.** O mural da equipe tinha borda de 2 px, brilho
âmbar e três níveis de título (pílula + `h2` + contador), superando visualmente
os indicadores operacionais. Virou um painel de 1 px com um único título e o
contador como chip — mantém a identidade âmbar e a posição no topo (é
deliberado que ninguém perca um recado), sem competir com os dados da operação.

**Acabamento.**
- Ritmo vertical das seções de topo unificado em `mt-6` (era `mt-5/6/7/8`).
- Agenda: coluna de status de 140→180 px, porque "Pendente de agendamento"
  quebrava em duas linhas e deixava as fileiras irregulares; as linhas passaram
  a virar grade em `lg`, o mesmo ponto em que o cabeçalho aparece.
- Status do chamado no cartão renderiza como token maiúsculo uniforme. O valor
  do Jira é preservado — "TEC-CAMPO" continua "TEC-CAMPO".
- Gráfico do Financeiro usa `--chart-*` em vez de laranja fora da paleta.
- Período (7/30/90 dias) virou controle segmentado; antes o selecionado era
  indistinguível do não selecionado no tema escuro.
- `.leaflet-container` com especificidade dobrada: o CSS do Leaflet entra em
  runtime e vencia por ordem, deixando o mapa cinza-claro enquanto os tiles
  carregam.
- Conteúdo ganhou `pb-36` para não ficar preso sob os botões flutuantes.

Verificado: `npm test` (8), `npx tsc --noEmit`, `npm run build`,
`scripts/ui-review.mjs` (44 checagens, 0 estouros, 0 erros de runtime).
`npm run lint` continua com os mesmos 66 achados pré-existentes — nenhum novo.

## 2026-09-10

### Preserva horário final do atendimento no Jira — *(este trabalho)*
Os campos de início e término não são mais convertidos silenciosamente para UTC
ao salvar. A tela preserva o horário local mostrado pelo Jira e envia o offset
do dispositivo, evitando que o término volte deslocado e bloqueie a validação.

### Spares: abertura no executável e repetição automática — *(este trabalho)*
Os botões da planilha original e da cópia agora usam a abertura externa do
Tauri, em vez de depender de `window.open` no WebView. O Worker também chama a
sincronização de spares a cada dez minutos, além da tentativa imediata no
cadastro e do botão manual.

### Atendimentos ativos agrupados por FSA — *(este trabalho)*
A dashboard agora tem a área **Atendimentos em andamento**. Um colaborador
inicia uma sessão selecionando pelo menu ou colando uma ou mais FSAs; os códigos
são normalizados e confirmados no Jira antes de serem aceitos. A mesma sessão
pode conter vários chamados e recebe destaque visual de atendimento agrupado.

As sessões ficam em `active_attendances` e seus chamados em
`active_attendance_tickets`. A criação e o encerramento geram trilha em
`operational_audit`; uma FSA já presente numa sessão ativa não pode ser iniciada
por outra pessoa. A migration `0022_active_attendances.sql` foi aplicada no D1
de produção.

### Datas reais do atendimento obrigatórias para validação — *(este trabalho)*
O detalhe do chamado agora lê e salva diretamente no Jira os campos **Data/Hora
– Início** (`customfield_10702`) e **Data/Hora – Término**
(`customfield_10703`). Os campos são exibidos juntos do resumo técnico, têm
rótulo e ajuda visíveis e o término não aceita data anterior ao início.

A validação foi reforçada no cliente **e no servidor**: não é possível incluir
um chamado na fila sem as duas datas persistidas no Jira, mesmo que alguém
tente chamar a API diretamente.

## 2026-09-10

### Cadastro de Spares com sincronização SharePoint — *(este trabalho)*
A Central de Spares ganhou abas de acompanhamento e cadastro, formulário com os
11 campos da planilha de envios, estados claros de salvamento/sincronização e
ação manual de sincronizar. Os registros agora são persistidos no D1 na tabela
`spares`; o CSV legado continua como leitura histórica enquanto os dados são
migrados.

Foram criadas as rotas autenticadas `/api/spares` e `/api/spares/sync` e um
conector bidirecional configurável via Power Automate. Falhas do Excel não
perdem o cadastro: ficam marcadas para reenvio. Instruções e contrato estão em
`docs/SPARES_SHAREPOINT_SYNC.md`.

**Pendente:** configurar os dois fluxos do Power Automate e cadastrar os três
secrets do Worker. A migration `drizzle/0021_spares.sql` **já foi aplicada** no
D1 de produção — conferido em 2026-09-11 com `npm run db:migrate:remote`, que
reportou as 23 migrations presentes.

## 2026-09-09

### Exibe o defeito alegado no resumo do chamado — *(este trabalho)*
O bloco principal de detalhes agora mostra o campo real **Defeito alegado** do
Jira (`operationalFields.allegedDefect`), em largura completa e com quebra de
texto. A auditoria visual sintética passou a conferir esse dado e os textos dos
atalhos do chamado foram ajustados para não causar overflow no celular.

### Corrige destinos das áreas Mapa, Spares e Financeiro — *(este trabalho)*
O menu compartilhado agora força navegação de documento quando o destino é
uma página própria. As trocas internas por `?view=` continuam instantâneas na
tela inicial. Isso evita o dead-end do roteador cliente do vinext no navegador
e no WebView do executável, em que o clique tinha um `href` válido mas a tela
permanecia no painel atual.

### Revisão visual e responsiva do produto — *(este trabalho)*
Unificou a linguagem visual graphite-glass em todas as áreas, com tokens de
superfície, foco de teclado, alvos maiores para toque, campos com rótulos e
diálogos/folhas que respeitam a altura da tela. A navegação agora usa um único
componente compartilhado, com nomes visíveis no desktop e menu acessível no
celular. O mural de bilhetes pode ser recolhido, anexos têm preview sem
overflow e as telas de Spares, Mapa e Financeiro têm estados vazios/erro e
controles responsivos.

Foi adicionado `scripts/ui-review.mjs`, uma auditoria local com dados sintéticos
que percorre as vistas em 375/768/1024/1440 px, valida overflow, menu móvel,
preview de anexo e salvamento do fluxo operacional. Também foram adicionados
testes de autorização da navegação em `tests/navigation.test.ts`.

### Reunião de voz em grupo mais estável — *(este trabalho)*
A chamada em grupo saiu de dentro do painel de comunicação e virou uma janela
flutuante persistente, para não cair quando o menu/chat fecha. O layout ficou
mais parecido com apps de reunião: painel grande, minimizar/aumentar,
participantes, tela compartilhada e controles claros. A conexão WebSocket
também ganhou reconexão automática e timeout maior.

### Fila de validação na visão geral — *(este trabalho)*
A seção de alertas do painel de inteligência foi substituída por uma lista
simples de chamados enviados para validação. Ao clicar em **Validar**, o sistema
registra quem enviou e quando; a visão geral mostra chamado, colaborador e há
quanto tempo está aguardando. Quando o chamado sai da fila atual do Jira, ele
some da lista.

### Bilhetes na tela inicial — *(este trabalho)*
A visão geral ganhou um mural interno de recados rápidos. Funcionários
autenticados podem criar e ver bilhetes; autor, gerência e coordenação podem
arquivar. Os recados ficam no D1 na tabela `bulletin_notes`.

### Publica desktop 0.1.14 — *(este trabalho)*
Versao desktop `0.1.14` publicada em `/downloads/Caju-OS-0.1.14-x64-setup.exe`
com leitura nativa de arquivos copiados do Explorer e de dentro de ZIP aberto
no Windows.

### Ctrl+V de arquivos copiados do Explorer no EXE — *(este trabalho)*
O Tauri ganhou o comando nativo `read_clipboard_files`, que le o clipboard do
Windows (`CF_HDROP`) e transforma arquivos copiados no Explorer em evidencias
do chamado. A web continua usando o clipboard do navegador; no desktop, quando
o navegador nao entrega os arquivos, o sistema consulta a ponte nativa. Limites:
8 arquivos por colagem, 25 MB por arquivo e 50 MB no total.
Tambem cobre arquivos virtuais copiados de dentro de pastas ZIP abertas pelo
Explorer (`FileGroupDescriptorW` + `FileContents`), caso em que nao existe
caminho real no disco.

### Aceita pacotes ZIP e RAR como evidência — *(este trabalho)*
O seletor, arrastar/colar e a API de anexos agora aceitam arquivos `.zip` e
`.rar` até 25 MB. O pacote é anexado completo ao chamado do Jira, preservando
todos os arquivos internos para download e auditoria.

### Corrige colagem de evidências com Ctrl+V — *(este trabalho)*
O recebimento de arquivos colados agora usa um listener no detalhe do chamado
e também lê itens de arquivo da área de transferência quando o navegador não
preenche `clipboardData.files`. A colagem de texto em campos continua intacta.

### Adiciona filtros prontos do Jira ao fluxo de chamados — *(este trabalho)*
O painel de filtros ganhou presets internos para os JQLs enviados pelo Jira:
**Meus chamados no Jira** (`parceiro-atribuido = currentUser()`) e
**Spare aprovado 24h** (`Aguardando Spare` com aprovação nas últimas 24 horas).
A API aceita somente esses presets conhecidos, sem expor JQL livre, e o cache
do navegador agora separa cada filtro para não misturar filas diferentes.

### Permite arrastar e colar evidências no chamado — *(este trabalho)*
A aba **Anexos** agora aceita três caminhos de upload no mesmo lugar: clicar
para selecionar, arrastar arquivos para a área destacada ou colar com
`Ctrl+V` depois de focar a área. As evidências entram em uma fila acumulativa,
sem substituir a seleção anterior, ignorando formatos incompatíveis e mantendo
a validação visual antes do envio ao Jira.

### Evita erro genérico na listagem de chamados — *(este trabalho)*
Busca de chamados no Jira ficou mais tolerante: se o endpoint novo
`/rest/api/3/search/jql` falhar sem paginação, o sistema tenta o endpoint
clássico `/rest/api/3/search`; falhas de rede e respostas JSON inválidas viram
mensagens tratáveis; e respostas parciais de chamados não derrubam o dashboard.
Isso complementa a redução de leituras D1 feita na branch
`claude/fix-d1-read-budget`.
**Validação:** `npm test`, `npx tsc --noEmit`, `npm run build` e
`npx oxlint lib/server/jira.ts` passaram.

### Reduz consumo de leituras do D1 — *(branch claude/fix-d1-read-budget)*
Raiz do "Falha inesperada ao consultar o Jira." + dashboard zerado: o D1 bateu
o **limite diário de leituras do plano gratuito** (5 mi linhas/dia). Quando isso
acontece, *toda* query do Worker falha — inclusive o lookup em `app_users` que
todo request autenticado faz — e o erro sobe como 500 genérico em
`/api/auth/me`, `/api/jira/issues` e `/api/messages`. Não era bug de código do
Jira.

- `app/api/operational-dashboard/route.ts`: `operationalAudit` estava sem
  `limit` (tabela que só cresce) — agora `.limit(2000)`; `employeeActivity`
  de 5000 → 2000. Só os 12 mais recentes e contagens por ator são usados.
- `app/page.tsx`: polling do painel operacional 30s → 120s; refresh do Jira
  20s → 45s; ambos agora pausam quando a aba não está visível
  (`document.visibilityState`).

**Pendente:** decidir entre habilitar o **Workers Paid** (US$5/mês, sobe leituras
D1 para 25 bi/mês — correção definitiva) ou seguir no gratuito com o consumo
reduzido. Enquanto o limite de hoje não zerar (00:00 UTC) o sistema segue
retornando erro, independente do código.

### Corrige "Acesso não autorizado" indevido — *(branch claude/fix-auth-race)*
Dois sintomas, mesma raiz: o `role` caía para `null` por um instante e `role`
nulo = sem acesso.

- **Todo login mostrava /acesso-negado, e só "Voltar ao início" resolvia.**
  `onAuthStateChanged` pode disparar em paralelo (login + hidratação de token);
  se a chamada mais antiga terminava depois e falhava, ela sobrescrevia o
  resultado bom com `role=null`. Agora há um `runId` — só o resultado da
  chamada mais recente escreve no estado. E `/acesso-negado` deixou de ser
  beco sem saída: assim que um papel válido resolve, o app sai de lá sozinho.
- **Abrir Spares mostrava "Falha ao consultar o perfil".** Um `500` transitório
  de `/api/auth/me` (cold start do Worker, D1) era tratado igual a um `403`:
  limpava o papel **e o cache**. Agora `resolveProfile()` separa negação
  definitiva (401/403 → revoga) de falha transitória (5xx/rede → mantém o
  papel e o cache, tenta de novo 3× com backoff e refresh de token).
- `canAccess()` ganhou `if (role === 'gerencia') return true` explícito no
  topo — gerência é o nível mais alto da hierarquia e não depende de estar
  listada em cada entrada de `routeRoles`.

**Validação:** `npm test`, `npx tsc --noEmit`, `npm run build` passaram.

### Loading fluido da Caju em telas e painéis — *(este trabalho)*
A animação fluida criada no thread `01a083ff-99b7-78f1-9053-7605594e0854` já
era o asset publicado em `public/brand/caju-loading.gif/.webp` (hashes
conferidos). `CajuLoading` agora tem variantes compacta e de painel, e os
loadings de abertura de chamado, agenda/equipe/lojas, indicadores
operacionais, gestão operacional, atendimento N1 e financeiro usam a marca.
Spinners pequenos de botões foram mantidos como feedback de ação.
**Validação:** `npm test`, `npx tsc --noEmit` e `npm run build` passaram.

### Consolidação da validação de foto — *(este trabalho)*
`lib/image-validation.ts` virou a fonte única da validação visual de evidências:
agora expõe validação por canvas, por `File` e por lote. A tela de detalhe do
Jira deixou de ter `inspectImageQuality()` inline e passou a usar
`validateEvidenceFiles()`. O fluxo N1 também usa o mesmo motor por `File`, mas
mantém o comportamento de aviso em vez de bloqueio.
**Validação:** `npm test`, `npx tsc --noEmit` e `npm run build` passaram.
**Observação:** `npm run lint` global ainda falha por débitos antigos de a11y /
React Compiler em vários arquivos; o lint restrito aos arquivos tocados também
pega esses débitos pré-existentes nos componentes grandes.

### Estrutura de colaboração Claude + Codex — *(este trabalho)*
Criados `docs/AI_HANDOFF.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`,
`JIRA_FIELDS.md`, `KNOWN_BUGS.md`, `PRODUCT_REQUIREMENTS.md`, `CHANGELOG.md`,
`TESTING_CHECKLIST.md`, `WORKFLOW_RULES.md`. `AGENTS.md` reescrito, `CLAUDE.md`
criado. `.ai-handoff/` marcada como histórica.
**Pendente:** decisão humana sobre trocar o `git config user.name` de "Codex
Sites <sites@openai.com>" para algo neutro; e sobre versionar ou não
`scripts/claude-codex-collaboration-prompt.md`.

### `b081dfb` — Tela de loading com a animação da marca
`components/caju-loading.tsx` serve o WebP fluido (`public/brand/`) com fallback
GIF e troca para PNG estático em `prefers-reduced-motion`. Substitui o spinner
"Verificando acesso..." no gate de auth e no stub do Central N1.
**Pendente:** WebP tem ~398 KB; aceitável (cacheado, fora do caminho crítico).

### `79b23c7` — Item "Feedback" no menu não fazia nada
O nome da view precisava estar no tipo `DashboardView` **e** em duas listas
literais paralelas que validavam a URL. Unificado em `DASHBOARD_VIEWS` +
`isDashboardView()`. -31/+20 linhas.

### `1831bfc` — Quadro de feedback aberto a todos os perfis
Nova view `feedback`, tabelas `feedback` e `feedback_votes` (migration 0019),
rota `/api/feedback`. Voto por pessoa; triagem por gerência/coordenação com
resposta visível ao autor. Voto é otimista (alterna antes da resposta).

### `7e39fee` — Catálogo de peças ligado a "peça a ser trocada"
Tabela `parts_catalog` (migration 0018), preços em centavos, seed em
`scripts/seed-parts.mjs` (transcrito de planilha; a imagem estava cortada após
"SSD 240GB"). Rota `/api/parts` (leitura: qualquer papel; escrita: gerência).
Menu no campo "peça a ser trocada" nas **duas** telas — soma nome e valor.
**Pendente:** completar o catálogo; conferir a transcrição dos preços.

### `bc25d78` — Botão de validação → um clique que copia o link do Jira
"Enviar para validação" virou "Validar". Copia o link do Jira direto para a
área de transferência (reusa `copyToClipboard`), mensagem na status line.
Removido o diálogo de confirmação e 122 linhas de código que ficou órfão.
**Mudança de comportamento:** não abre mais o grupo do WhatsApp
automaticamente — o link é enviado à mão.

### `76180e3` — Parar de versionar o espelho `.claude/skills`
`npx skills add` escreve em `.agents/skills` e espelha em `.claude/skills`.
O commit anterior pegou os dois via `git add -A`. `.claude/skills/` ignorado.

### `4c3e867` — Auditoria: exposição de dados, render loop, becos sem saída
- `/api/technicians` devolvia CPF/PIX/endereço de 1.501 técnicos a qualquer
  logado (a tela de Técnicos é aberta a `tecnico`). Esses 3 campos agora só
  para papéis que tratam pagamento/cadastro.
- Efeito do mapa dependia de `fallbackTechnicians` recriado a cada render →
  425 marcadores destruídos e recriados. Memoizado.
- Refs do Leaflet eram `any`, escondendo que `gm.current` podia ser `null` no
  `.addTo()`. Tipadas com `@types/leaflet`.
- Cópia inalcançável do fluxo de convite em `app/page.tsx`. Removida.
- Lint passava sem rodar (plugin type-aware crashava, exit 0). Regras
  type-aware desligadas; `npm run lint` agora falha de verdade e não varre
  `node_modules`.

### `860706e` — Leitura da RAT (OCR) via Workers AI
`/api/rat/extract` + `/api/rat/agree` (aceite da licença Meta, só gerência).
Modelo `@cf/meta/llama-3.2-11b-vision-instruct`, entrada `{ prompt, image:
number[] }`. Botão "Ler RAT e preencher" no resumo técnico. Nunca bloqueia:
falha → 200 com campos vazios. Prompt ajustado para **manuscrito**.
Binding `AI` declarado em `vite.config.ts` **e** `scripts/patch-wrangler.mjs`.
**Pendente:** medir qualidade do reconhecimento com RATs reais; PDF não é lido.

### `2b37cc1` — Validação de foto + varredura de tarefas delegadas
- `validateImageQuality()` (`lib/image-validation.ts`), que ninguém importava,
  ligada ao upload de evidência N1 (só avisa).
- Cron `*/10 * * * *` roda `/api/tasks/sweep`: pergunta andamento ao
  responsável (nextCheckAt vencido) e escala a gerência uma vez (dueAt vencido).
  Coluna `escalated_at` (migration 0016). Wrapper `scripts/worker-entry.js`
  adiciona o handler `scheduled` ao entry gerado.
- `db-migrate-remote` reescrito para aplicar só migrations pendentes e abortar
  se não ler `d1_migrations`.

### `f1d1c9a` — TURN por credenciais efêmeras
`NEXT_PUBLIC_TURN_*` (build-time, públicas no bundle) substituídas por
`/api/turn-credentials`, que gera credenciais de curta duração da Cloudflare
Realtime para o usuário autenticado. `lib/voice-chat.ts` busca e cacheia.
Falha → só STUN.

### `62c7dd0` — Fora do OpenAI Sites; Google Maps → Leaflet
- Removidos `@openai/sites-vite-plugin`, `.openai/hosting.json`,
  `app/chatgpt-auth.ts` (90 linhas mortas), workaround do sandbox do Codex.
- Google Maps não renderizava tiles sem erro, mesmo após corrigir 3 defeitos
  reais (chave malformada, `backdrop-filter` num ancestral, loader preso em
  evento). Migrado para **Leaflet + OpenStreetMap** — sem chave, cota ou
  fornecedor. Tema escuro por filtro CSS no `.leaflet-tile-pane`.
- `/api/geocode` (Nominatim + cache `geocode_cache`, migration 0017) para
  buscar cidade sem técnico.

### `fd63904` — Pipeline de deploy self-hosted
`scripts/cf-config.mjs`, `patch-wrangler.mjs`, `db-migrate-remote.mjs`,
`dump-to-sql.mjs`. Scripts npm `db:migrate:remote`, `deploy`, `release`.
`.cloudflare.json` (gitignored) guarda os valores da conta.

### `6c5c4eb` — Typecheck quebrado no diálogo de operação
`import { Input }` faltando (65 erros em cascata) + duas cópias locais de
`knowledgeArticles`/`recommendTechnicians` conflitando com o import. -142/+1.

---

## Antes de 2026-09-09 (histórico do OpenAI Sites)

Commits `f1c1a61` "Primeiro commit" e anteriores (`b505a4a`, `cafadaf`,
`cd8daf4`, `a25df52`, `89bd937`, `722d97a`, `bc2c5a5`, `0fa779a`, `ff84e0f`):
desenvolvimento no OpenAI Sites — notificações in-app/desktop, tela
compartilhada remota, fullscreen, controles de navegação, inteligência
operacional, restauração do visual premium após a tentativa de "60 FPS",
endurecimento da integração Jira e recuperação. Detalhe em
`.ai-handoff/` (histórico) e nas mensagens desses commits.
