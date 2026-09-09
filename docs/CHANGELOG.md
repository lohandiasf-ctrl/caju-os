# Changelog — Caju OS

Ordem cronológica inversa (mais recente no topo). Toda mudança relevante entra
aqui: o que mudou, por quê, e o que ficou pendente. Não é changelog de release
(não há tags) — é a linha do tempo do `main`.

Convenção: cada entrada tem a data, o commit (curto) e, quando aplicável,
"**Pendente:**" com o que a mudança deixou em aberto.

---

## 2026-09-09

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
