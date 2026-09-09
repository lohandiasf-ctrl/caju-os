# Arquitetura — Caju OS

O Caju OS é uma plataforma de gestão operacional de field service / helpdesk,
integrada ao Jira Cloud. O Jira é a fonte da verdade do chamado; o Caju OS
adiciona o processo operacional em volta (agendamento, técnico, evidências,
financeiro, auditoria).

## Frontend

- **vinext** (compatível com Next App Router). Páginas em `app/**/page.tsx`,
  todas client components (`"use client"`).
- Uma página raiz (`app/page.tsx`, ~3300 linhas) hospeda a maior parte da
  interface como "views" trocadas por `?view=`. A lista de views é única:
  `DASHBOARD_VIEWS` em `app/page.tsx`, e `isDashboardView()` valida a URL.
  Views: `overview`, `tickets`, `central`, `agenda`, `technicians`, `projects`,
  `feedback`, `settings`.
- Páginas próprias: `/login`, `/acesso-negado`, `/mapa`, `/central-n1`
  (redireciona para `/?view=central`), `/spares`, `/financeiro`.
- Componentes grandes em `components/`: `operation-workflow-dialog.tsx`
  ("Gerir operação"), `jira-ticket-details.tsx` (detalhe do chamado),
  `user-menu.tsx` (perfil, presença, voz), `feedback-board.tsx`,
  `n1-ticket-actions.tsx`, `caju-loading.tsx`.
- Navegação interna hoje usa `<a href>` → recarrega a página. Migrar para
  `next/link` (shim do vinext) está no backlog.
- Visual "premium": blur, transparência, transições. O usuário **rejeitou**
  a simplificação feita em nome de "60 FPS". Otimize lógica, não o design.

## Backend / API routes

`app/api/**/route.ts`, executando **no runtime de Workers** (sem `fs`, sem
`Buffer` do Node, sem libs nativas — só APIs web).

Padrão de toda rota:

```ts
import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);          // lança Response 401/403
    // ... env.DB, env.AI, env.JIRA_* ...
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'mensagem' }, { status: 500 });
  }
}
```

Grupos de rotas:

| Prefixo | Função |
|---|---|
| `/api/auth/me` | perfil e papel do usuário logado |
| `/api/jira/*` | busca, detalhe, transição, anexos, validação, finanças do Jira |
| `/api/operations`, `/api/operational-dashboard` | workflow operacional local |
| `/api/operations/intelligence` | recomendação de técnico, artigos, atividade |
| `/api/technicians*` | cadastro, import, reviews |
| `/api/chat-groups*`, `/api/messages`, `/api/typing` | chat direto e em grupo |
| `/api/calls/history`, `/api/turn-credentials` | histórico de voz, credenciais TURN |
| `/api/n1-tickets/[key]` | fluxo N1 (claim, validate, evidências) |
| `/api/finance/rules` | regras financeiras (só gerência) |
| `/api/parts` | catálogo de peças |
| `/api/feedback` | quadro de feedback |
| `/api/rat/extract`, `/api/rat/agree` | OCR da RAT via Workers AI |
| `/api/tasks/sweep` | varredura de tarefas delegadas (chamada pelo cron) |
| `/api/geocode` | geocodificação de cidade (Nominatim + cache) |
| `/api/admin/export`, `/api/admin/jira-sync` | backup, fila de sync do Jira |
| `/api/users/invite`, `/api/users/n1` | convite de funcionário, lista N1 |
| `/api/app-version` | versão do app (público, sem auth) |

## Banco / tabelas

Cloudflare D1, schema em `db/schema.ts`, migrations versionadas em `drizzle/`.
Dinheiro sempre em **centavos** (inteiros), nunca float.

Grupos de tabelas:

- **Identidade e presença:** `app_users`, `employee_presence`,
  `communication_preferences`.
- **Jira / cache:** `tickets`, `ticket_history`, `jira_issue_links`,
  `jira_sync_jobs` (outbox durável de escritas no Jira).
- **Operação:** `operational_stores`, `operational_workflows`,
  `operational_visits`, `n1_ticket_assignments`, `ticket_evidence`.
- **Governança:** `operational_audit` (append-only, nunca editar/apagar),
  `ticket_snapshots`, `requester_history`, `employee_activity`.
- **Comunicação:** `employee_messages`, `chat_groups`, `chat_group_members`,
  `chat_group_messages`, `chat_group_reads`, `chat_typing`, `voice_call_history`.
- **Logística e tarefas:** `shipment_tracking`, `operational_tasks`
  (tem `escalated_at` — o cron só escala uma vez).
- **Financeiro:** `finance_settings`.
- **Técnicos:** `technicians`, `technician_reviews`.
- **Catálogo:** `parts_catalog` (preço de peça, em centavos).
- **Feedback:** `feedback`, `feedback_votes`.
- **Infra:** `geocode_cache` (coordenadas de cidade, do Nominatim),
  `d1_migrations` (controle de migrations do wrangler).

## Autenticação

- Cliente: Firebase (`lib/firebase.ts`, projeto `caju-websys`).
  `components/auth-provider.tsx` observa `onAuthStateChanged`, busca
  `/api/auth/me`, guarda o papel em `sessionStorage` (`caju-os-auth-profile`).
- Servidor: `requireApiUser(request, allowedRoles?)` em
  `lib/server/firebase-auth.ts`. Verifica a assinatura RS256 do ID token contra
  as JWKS do Firebase, casa o `sub` **ou** o e-mail verificado com `app_users`,
  aplica o filtro de papel. Lança `Response` 401/403.
- Papéis: `gerencia`, `coordenador`, `n1`, `analista`, `tecnico`.
- `lib/permissions.ts`: `canAccess(role, pathname)` para páginas,
  `routeRoles` para o mapeamento. Regras por rota da API ficam **na própria
  rota** — algumas via parâmetro de `requireApiUser`, outras via checagem
  em linha. Ver `docs/WORKFLOW_RULES.md`.
- Campos sensíveis (`cpf`, `pixKey`, `fullAddress`) só vão para os papéis que
  tratam pagamento/cadastro — `/api/technicians` filtra por papel.

## Jira

`lib/server/jira.ts`. Autenticação Basic (`JIRA_EMAIL:JIRA_API_TOKEN`).
Fluxo e campos: `docs/JIRA_FIELDS.md`. Regras críticas: `docs/WORKFLOW_RULES.md`.

Pontos-chave:
- Descubra transições e campos permitidos pela API — não suponha que um
  `customfield` está em toda tela/tipo de chamado.
- Se um campo retornar `cannot be set. It is not on the appropriate screen`,
  use fallback por `customfield_12279`/ADF ou enfileire em `jira_sync_jobs`;
  **não trave o fluxo local**.
- Escrita no Jira que falha por rede transitória vai para `jira_sync_jobs`
  (outbox), reprocessável pela tela de administração.

## Cloudflare

- Worker `caju-os`, domínio `operacoes.cajutech.net` (custom domain, zona na
  conta).
- `scripts/patch-wrangler.mjs` reescreve o `dist/server/wrangler.json` gerado
  pelo build: injeta o `database_id` real do D1, o nome do Worker, as vars do
  Jira (de `.env.local`), o binding `AI`, o handler `scheduled` (via
  `scripts/worker-entry.js`), o cron `*/10 * * * *`, e — se
  `.cloudflare.json` tiver `custom_domain` — a rota do domínio.
- Detalhe completo e rollback: `docs/DEPLOYMENT.md`.

## Notificações

- In-app: `employee_messages` + polling na interface.
- Desktop: plugin de notificação do Tauri, via `communication_preferences`
  (respeita quiet hours, mute por tipo).
- Tarefa delegada vencida: o cron insere mensagem em `employee_messages` para
  todos os gerentes ativos + registro em `operational_audit`.

## Chamadas de voz / grupo

- WebRTC. Sinalização: `signaling-server/` (deploy separado no Railway;
  fallback hardcoded em `lib/voice-chat.ts`).
- ICE: STUN do Google + TURN da Cloudflare Realtime. Credenciais TURN são
  **efêmeras**, geradas por `/api/turn-credentials` (autenticada), cacheadas no
  cliente até pouco antes de expirar.
- Janela de chamada e tela compartilhada: `components/user-menu.tsx` +
  comandos Tauri (`show_voice_call_window`, `open_external_url`).
- Histórico em `voice_call_history`.

## Gestão de chamados

- Kanban em `?view=tickets` / `overview`, com filtros por status/prioridade.
- Detalhe: `components/jira-ticket-details.tsx` (sincroniza com o Jira) e
  `components/operation-workflow-dialog.tsx` (processo local + campos do Jira).
- Ambas as telas têm os campos "Problema identificado / Testes feitos / Peça a
  ser trocada" — são **duplicados**. O texto salvo no Jira é um único campo
  formatado (`PROBLEMA IDENTIFICADO: ... TESTES FEITOS: ... PEÇA A SER
  TROCADA: ...`), lido de volta por `parseDefect()`.
- Estado do workflow em `operational_workflows`; visitas em
  `operational_visits`.

## Gestão de técnicos

- `technicians` (cadastro), `technician_reviews` (avaliações).
- Import por CSV: `/api/technicians/import` (gerência/analista), lotes no D1.
- Recomendação automática: `recommendTechnicians()` em
  `lib/operational-intelligence.ts` — 8 fatores (distância, cidade/região,
  disponibilidade, especialidade, ferramentas, histórico de avaliação, custo de
  deslocamento, prioridade/lucro) + veículo e aprovação como extras.
- Distância é **estimada por faixas** (mesma cidade 8 km, região 45, mesmo
  estado 140, outro estado 380) — os técnicos não têm lat/lng no banco.
- Mapa (`/mapa`): Leaflet + OSM. `public/data/technician-map.json` (425 cidades
  com técnico) e `public/data/technician-directory.js`. Buscar cidade sem
  técnico geocodifica via `/api/geocode` e mostra os mais próximos.

## Anexos / evidências

- `ticket_evidence` (foto/vídeo/RAT em base64) — para o fluxo N1.
- Anexos do Jira: `/api/jira/issues/[key]/attachments` (POST),
  encaminha para `uploadJiraAttachments()`. Máx. 8 arquivos, 25 MB cada, 50 MB
  total.
- Validação de foto: `lib/image-validation.ts` é a fonte única
  (`validateImageQuality`, `validateImageFile`, `validateEvidenceFiles`). No
  fluxo N1 (`n1-ticket-actions.tsx`) a foto ruim **avisa**; no upload direto ao
  Jira (`jira-ticket-details.tsx`) a mesma validação **bloqueia** evidência
  escura, sem contraste ou pequena demais.
- Evidência nova deve virar comentário/observação interna no Jira quando
  possível.

## Auditoria e histórico

- `operational_audit`: append-only. Toda mudança de campo grava colaborador,
  data/hora, valor anterior, valor novo, origem (`sistema`/`Jira`) e motivo.
  **Nunca** faça `UPDATE`/`DELETE` nessa tabela.
- `ticket_snapshots`: cópia do estado anterior a cada alteração relevante.
- `employee_activity`: eventos de uso (para inteligência operacional).
- `/api/admin/export`: backup em JSON (12 tabelas; **não** cobre
  `app_users`, `ticket_evidence`, `employee_messages`).

## Tarefas delegadas

- `operational_tasks`: título, `assignedTo`, `acceptedBy`, `status`,
  `nextCheckAt`, `dueAt`, `escalatedAt`, ligada a um `ticketKey`.
- Lógica de estado (função pura): `delegatedTaskState()` em
  `lib/operational-intelligence.ts`.
- Automação: o Worker roda `POST /api/tasks/sweep` a cada 10 min (cron). Para
  cada tarefa aberta:
  - `nextCheckAt` vencido → mensagem ao responsável perguntando andamento,
    reagenda +30 min.
  - `dueAt` vencido e `escalatedAt` nulo → mensagem a todos os gerentes
    ativos, uma vez, + auditoria; marca `escalatedAt`.
- A rota exige `x-cron-secret` = `CRON_SECRET`.

## Inteligência operacional / IA

- `lib/operational-intelligence.ts`: recomendação de técnico, artigos de base
  de conhecimento (`knowledgeArticles()`, `KNOWLEDGE_ARTICLES`), estado de
  tarefa delegada. Tudo determinístico, sem LLM.
- 5 arquivos em `lib/` (`dispatch-engine.ts`, `knowledge-base.ts`,
  `delegated-tasks.ts`, `audit-engine.ts`, `image-validation.ts`) são um
  esforço paralelo — `image-validation.ts` é usado; os outros **não são
  importados** por nada. Decidir integrar ou remover.
- **OCR da RAT:** `/api/rat/extract` envia a foto da RAT para o Workers AI
  (`@cf/meta/llama-3.2-11b-vision-instruct`, entrada `{ prompt, image:
  number[] }`) e devolve os 3 campos do resumo técnico. Nunca bloqueia: falha
  → 200 com campos vazios e um `info`. O modelo é *gated* pela licença da Meta;
  aceite uma vez via `/api/rat/agree` (só gerência). PDF ainda não é lido.
