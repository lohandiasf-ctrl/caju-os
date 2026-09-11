# AI Handoff — Caju OS

Ponto de entrada para qualquer IA (Claude ou Codex) ou pessoa continuar o
trabalho sem depender da memória de uma conversa. Leia este arquivo primeiro.

> A pasta `.ai-handoff/` é histórica e está **desatualizada** (fala em OpenAI
> Sites, `.openai/hosting.json`, etc.). A fonte canônica é `docs/`.

---

## Estado atual do sistema

- **Produção:** https://operacoes.cajutech.net — servida por um Cloudflare
  Worker (`caju-os`) na conta Cloudflare do usuário.
- **Banco:** Cloudflare D1 `caju-os-prod`
  (`b3a189ab-a58f-40de-9299-bd5e636a588a`).
- **Migração concluída:** o sistema saiu do OpenAI Sites. Deploy agora é local
  (`npm run deploy`). Não há mais dependência de Codex/OpenAI para publicar.
- **DNS:** `cajutech.net` é registrado na Hostinger; os nameservers apontam para
  a Cloudflare (zona na conta do usuário). Só `operacoes` é servido pelo Worker;
  `@` e `www` continuam na Vercel; MX é Microsoft 365.
- **Rollback disponível:** a produção antiga no OpenAI Sites continua no ar em
  `custom-domains.chatgpt.site`, sem tráfego. Recriar o `CNAME operacoes →
  custom-domains.chatgpt.site` na Cloudflare devolve tudo em minutos.

## Última versão estável conhecida

`main` no GitHub (`origin`, `lohandiasf-ctrl/caju-os`). Todo commit em `main`
até aqui foi testado (`npm test`, `npx tsc --noEmit`, `npm run build`) e
publicado. Não há tag de release — o histórico do `main` é a linha do tempo.

Desktop: **Tauri 0.1.14** (`src-tauri/tauri.conf.json`). É uma casca fina que
carrega `https://operacoes.cajutech.net`; mudanças só-web chegam ao EXE atual
após o deploy, sem recompilar.

Exceção desktop: a colagem de arquivos copiados do Windows Explorer usa o
comando nativo Tauri `read_clipboard_files` (`CF_HDROP`). Esse recurso so chega
aos usuarios apos rebuild/redistribuicao do instalador; publicar apenas o Worker
nao atualiza essa ponte nativa.
Arquivos copiados de dentro de ZIP aberto no Explorer usam formatos virtuais do
Windows (`FileGroupDescriptorW` + `FileContents`), tambem lidos por esse comando.

## Stack técnica

| Camada | O quê |
|---|---|
| Framework | **vinext** 1.0.0-beta.5 (compatível com Next App Router, RSC) |
| UI | React 19.2, TypeScript 5.9 (strict), Tailwind v4, shadcn/base-ui |
| Runtime | **Cloudflare Workers** — sem `fs`, sem libs nativas, APIs web apenas |
| Banco | Cloudflare D1 + Drizzle ORM |
| Auth | Firebase (projeto `caju-websys`); ID token como `Bearer` |
| Voz | WebRTC + `socket.io-client`; servidor de sinalização em `signaling-server/` (Railway); TURN via Cloudflare Realtime |
| Mapa | Leaflet + OpenStreetMap (migrado do Google Maps) |
| OCR da RAT | Workers AI `@cf/meta/llama-3.2-11b-vision-instruct` |
| Build | Vite 8 via `vinext build` |
| Lint | oxlint (`npm run lint`) — regras type-aware desligadas (plugin quebra) |
| Testes | `node --test` em `tests/*.test.ts` (3 testes) |
| Deploy | `npm run deploy` → `scripts/patch-wrangler.mjs` + `wrangler deploy` |

## Onde ficam as coisas

| | Caminho |
|---|---|
| Páginas | `app/**/page.tsx` — 7 páginas: `/`, `/login`, `/acesso-negado`, `/mapa`, `/central-n1`, `/spares`, `/financeiro` |
| Rotas de API | `app/api/**/route.ts` — 36 rotas; exportam `GET`/`POST`/`PUT`/`PATCH`/`DELETE` |
| Schema do banco | `db/schema.ts` (Drizzle) |
| Migrations | `drizzle/*.sql` — até `0021_spares.sql`; geradas por `npm run db:generate` |
| Bootstrap do D1 | `db/index.ts` (`getDb()`, binding `DB`) |
| Auth (servidor) | `lib/server/firebase-auth.ts` — `requireApiUser(request, roles?)` |
| Auth (cliente) | `lib/firebase.ts`, `components/auth-provider.tsx` |
| Permissões por rota/tela | `lib/permissions.ts` |
| Integração Jira | `lib/server/jira.ts` |
| Cliente de voz | `lib/voice-chat.ts` |
| Inteligência operacional | `lib/operational-intelligence.ts` (recomendação de técnico, artigos, tarefas) |
| Scripts de infra | `scripts/*.mjs` (ver `docs/DEPLOYMENT.md`) |

Papéis do sistema: `gerencia`, `coordenador`, `n1`, `analista`, `tecnico`.

## Como rodar local

```bash
npm install
cp .env.example .env.local   # preencha os JIRA_* reais
npm run dev                  # vinext dev, http://localhost:5173
```

`.env.local` nunca entra no Git. Sem `TURN_KEY_*` a voz cai para STUN
(funciona fora de NAT simétrico). Sem `GOOGLE_MAPS_API_KEY` nada acontece — o
mapa é Leaflet e não usa mais essa chave.

## Como testar

```bash
npm test            # 3 testes unitários (validação de chamado, retry, requisitos)
npx tsc --noEmit    # precisa ficar limpo
npm run lint        # oxlint
npm run build       # build de produção
```

Antes de qualquer deploy: `npm test && npx tsc --noEmit && npm run build`
(ou `npm run release`, que encadeia tudo + deploy).

Checklist manual de regressão: `docs/TESTING_CHECKLIST.md`.

## Como publicar

Ver `docs/DEPLOYMENT.md`. Resumo:

```bash
npm run deploy          # patch-wrangler + wrangler deploy
npm run db:migrate:remote   # se houver migration nova (pede confirmação)
```

**Deploy automático:** todo push na `main` publica produção via GitHub
Actions (`.github/workflows/deploy.yml`). Deploy manual continua só com pedido
explícito do usuário. O deploy automático não aplica migrations.

## Integrações externas

| Serviço | Uso | Config |
|---|---|---|
| **Jira Cloud** (Delfia) | fonte da verdade dos chamados; REST API v3 | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` |
| **SharePoint / Power Automate** | espelho bidirecional do cadastro de spares | secrets `SPARES_SYNC_PUSH_URL`, `SPARES_SYNC_PUSH_URL_ORIGINAL`, `SPARES_SYNC_PULL_URL`, `SPARES_SYNC_TOKEN`; ver `docs/SPARES_SHAREPOINT_SYNC.md` |
| **Firebase** (`caju-websys`) | autenticação; convite cria conta + reset por e-mail | config do cliente hardcoded em `lib/firebase.ts` (não é segredo) |
| **Cloudflare Workers/D1/AI** | runtime, banco, OCR da RAT | binding `DB`, binding `AI`, secrets via `wrangler secret put` |
| **Cloudflare Realtime (TURN)** | relay de voz; credenciais efêmeras | `TURN_KEY_ID`, `TURN_KEY_API_TOKEN` |
| **Railway** | servidor de sinalização WebRTC (`signaling-server/`) | fallback hardcoded em `lib/voice-chat.ts` |
| **Nominatim / OpenStreetMap** | geocodificação de cidade sem técnico; tiles do mapa | sem chave; cache em `geocode_cache` |
| **Microsoft 365** | e-mail `@cajutech.net` (MX) | fora do escopo do app; não tocar no DNS de MX/SPF/autodiscover |

## Funcionalidades já existentes

Ver `docs/ARCHITECTURE.md` (detalhe) e `.ai-handoff/FEATURES.md` (histórico).
Em resumo: Kanban de chamados com filtros, detalhe do chamado sincronizando com
o Jira, agendamento com técnico, recomendação automática de técnico (8 fatores),
mapa operacional de cobertura, Central N1 com validação por evidência, chat
direto e em grupo, chamadas de voz 1-a-1 e em grupo com tela compartilhada,
bilhetes na tela inicial, notificações in-app e desktop, gestão financeira (restrita a gerência),
auditoria append-only de toda mudança, tarefas delegadas com varredura
agendada, catálogo de peças, leitura da RAT por IA, quadro de feedback aberto a
todos os perfis, exportação/backup administrativo.

## Bugs conhecidos

`docs/KNOWN_BUGS.md`.

## Próximas prioridades

- A navegação visual compartilhada está em `components/app-navigation.tsx` e
  suas regras de papel em `lib/navigation.ts`. O script `scripts/ui-review.mjs`
  usa o Playwright disponível no ambiente para revisão visual local; ele exige
  `PLAYWRIGHT_MODULE` e um servidor vinext disponível na porta 3000. Ele usa
  dados sintéticos e não faz login nem escreve no Jira — rode-o antes de
  entregar mudança visual; ele falha se alguma tela rolar de lado.
- **Z-index tem escala nomeada** em `app/globals.css` (`--z-content`,
  `--z-sticky`, `--z-float`, `--z-sidebar`, `--z-modal`, `--z-live-call`,
  `--z-incoming-call`, `--z-window-chrome`). Elemento fixo ou flutuante novo
  escolhe um degrau — não invente um número. Foi assim que o botão de reunião
  acabou pintando por cima dos diálogos. Só a chamada ativa e a moldura do
  desktop passam acima de um modal.

1. **Testar salvar um chamado real com transição no Jira** no ambiente novo —
   único fluxo crítico ainda não exercitado em produção pós-migração.
2. Cadastrar `GOOGLE_MAPS_API_KEY`? **Não** — obsoleto após Leaflet. Pode
   remover o secret órfão.
3. Completar o catálogo de peças (a imagem de origem estava cortada).
4. Navegação compartilhada usa `next/link`; páginas próprias têm fallback por
   `window.location.assign()` para evitar dead-end do roteador vinext/WebView.
5. Desativar a produção antiga no OpenAI Sites — só depois de alguns dias de
   estabilidade.

## Últimas decisões de produto

`docs/CHANGELOG.md` tem a linha do tempo. Destaques:

- Mapa migrado para **Leaflet + OSM**: sem chave, sem cota, sem fornecedor.
- TURN via **credenciais efêmeras** (rota autenticada), não mais
  `NEXT_PUBLIC_TURN_*` embutidas no bundle.
- Botão de validação virou **um clique que copia o link do Jira** (não abre
  mais o WhatsApp automaticamente).
- Tela de loading é a **animação fluida da marca** (`public/brand/`).
- Quadro de **feedback** aberto a todos os perfis; triagem por gerência/coordenação.
- Catálogo de **peças** liga o preço ao campo "peça a ser trocada".

## Primeira sessão do Codex

`docs/CODEX_ONBOARDING.md` — guia de entrada para colar no Codex na
primeira vez. Depois disso ele segue o `AGENTS.md`.

## Como Claude passa trabalho para Codex

1. Deixe o `main` limpo: `git status --short` vazio, testes/tsc/build passando.
2. Atualize `docs/CHANGELOG.md` (o que mudou e por quê) e, se algo ficou
   pendente, `docs/KNOWN_BUGS.md` e a seção "Próximas prioridades" acima.
3. Se o trabalho está numa branch `claude/...`, abra PR contra `main` com
   descrição do que foi feito, o que falta e como testar.
4. Nunca deixe migration gerada sem aplicar sem avisar: diga no handoff se
   `npm run db:migrate:remote` precisa rodar.
5. Registre decisões técnicas não óbvias no CHANGELOG ou como comentário no
   código, não só na conversa.

## Como Codex passa trabalho para Claude

1. Mesmo padrão: `main`/branch limpo, `docs/CHANGELOG.md` atualizado.
2. Branch com prefixo `codex/...`, PR contra `main`.
3. Liste em `docs/CHANGELOG.md` qualquer arquivo novo em `scripts/`, rota nova
   em `app/api/`, ou tabela nova em `db/schema.ts`.
4. Se mexeu em fluxo Jira/financeiro/produção, descreva o teste que validou.
