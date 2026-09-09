# Changelog — Caju OS

Ordem cronológica inversa (mais recente no topo). Toda mudança relevante entra
aqui: o que mudou, por quê, e o que ficou pendente. Não é changelog de release
(não há tags) — é a linha do tempo do `main`.

Convenção: cada entrada tem a data, o commit (curto) e, quando aplicável,
"**Pendente:**" com o que a mudança deixou em aberto.

---

## 2026-09-09

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
