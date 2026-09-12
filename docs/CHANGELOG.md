# Changelog — Caju OS

Ordem cronológica inversa (mais recente no topo). Toda mudança relevante entra
aqui: o que mudou, por quê, e o que ficou pendente. Não é changelog de release
(não há tags) — é a linha do tempo do `main`.

Convenção: cada entrada tem a data, o commit (curto) e, quando aplicável,
"**Pendente:**" com o que a mudança deixou em aberto.

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
- Grade: quatro colunas a partir de 1200px (`min-[1200px]:grid-cols-4`), três
  em `lg`, cinco acima de 1800px.
- Densidade do cartão, para caber sem espremer: padding `p-4` → `p-3`,
  espaçamentos internos menores, lista da coluna `space-y-3` → `space-y-2` e
  título da coluna em `text-[11px]` com `truncate` em vez de quebrar em duas
  linhas.

**Pendente:** não validado visualmente — a tela exige login, então quem confere
é o usuário. Se a janela dele for menor que 1200px, continuam três colunas.

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
