# AI Handoff — Caju OS

Ponto de entrada para qualquer IA (Claude ou Codex) ou pessoa continuar o
trabalho sem depender da memória de uma conversa. Leia este arquivo primeiro.

> Para tarefas pequenas, leia antes `docs/CURRENT_STATE_SHORT.md`. Este arquivo
> continua como histórico completo, mas não precisa ser carregado inteiro em
> toda sessão.

> A pasta `.ai-handoff/` é histórica e está **desatualizada** (fala em OpenAI
> Sites, `.openai/hosting.json`, etc.). A fonte canônica é `docs/`.

---

## Estado atual do sistema

- **Push para o app do celular (2026-09-25, branch `claude/push-notificacoes`).**
  Migration nova `drizzle/0043_push_devices.sql`: rode
  `npm run db:migrate:remote` antes de mesclar na `main`, senão
  `/api/messages`, grupos e a varredura consultam uma tabela que não existe
  (o push falha em silêncio, a mensagem continua gravando). Detalhes no
  `docs/CHANGELOG.md`. O app do celular é o repositório `caju-os-mobile`.

- **WhatsApp removido por inteiro em 2026-09-19 (Claude → Codex).** O usuário
  decidiu reconfigurar do zero depois de um dia inteiro sem fechar a causa de
  conversa 1:1 não funcionar. O que você precisa saber para remontar:

  - **Não existe mais bridge.** As apps `caju-whatsapp-bridge` e
    `caju-whatsapp-bridge-caju` foram destruídas com seus volumes. Os nomes
    estão livres. O código continua em `whatsapp-bridge/`, com `fly.toml` e
    `fly.caju.toml` apontando para esses nomes.
  - **Os segredos do Worker continuam configurados e apontam para o vazio:**
    `WHATSAPP_BRIDGE_URL`, `WHATSAPP_BRIDGE_SECRET` e as variantes `_CAJU`.
    Atualize-os ao subir a infraestrutura nova, senão a tela acusa bridge fora
    do ar. **O segredo é o que identifica a conta** (`accountFromSecret`), então
    cada bridge precisa do seu, diferente do outro.
  - **As tabelas estão vazias.** `whatsapp_messages` e
    `whatsapp_conversations` foram esvaziadas (2574 e 641 linhas). Dump do
    texto em `Downloads/caju-whatsapp-*-2026-09-19.sql`, na máquina do usuário,
    fora do repositório porque contém conversa de cliente.
  - **474 mídias foram perdidas em definitivo** porque moravam no volume da
    sessão (`MEDIA_DIR = './auth/media'`). O D1 guarda só o `media_id`. Se for
    remontar, vale tirar a mídia do volume do bridge — R2, por exemplo. O
    usuário foi avisado do número antes e escolheu apagar.
  - **Não suba `a9f0597` sem validar.** Ele traduz `@lid` para número no
    `/send`, não resolveu o problema, e devolveu um número sem o nono dígito.
    Detalhe em `docs/KNOWN_BUGS.md`, seção WhatsApp.
  - O que foi confirmado funcionando na tela antes da remoção: a conta `caju`
    esconde grupo (só 1:1) e o botão de filtro "Grupos" some nela.

- **Feedback 2026-09-14 (branch `codex/feedback-attendance-workflow`):** nova
  migration `0028_attendance_preparation.sql` adiciona `phase` em
  `active_attendances` com default `ongoing`. POST cria `preparing`; PATCH
  `{action:"start"}` inicia; POST `/api/active-attendances/:id/tickets` adiciona
  FSAs verificadas no Jira ao grupo. Migration aplicada e conferida no D1 remoto
  em 2026-09-14, antes do deploy.
  O encerramento permaneceu como estava porque o usuário pediu para ignorá-lo
  nesta rodada. O restante do feedback está discriminado no CHANGELOG.

- **Produção em `main`:** histórico permanente de FSAs está implementado em
  `ticket_archives`, com tela **Histórico de chamados** e APIs
  `/api/ticket-history`. Toda gravação operacional, edição direta do Jira,
  alteração em lote e validação N1 preserva uma cópia do chamado mesmo se ele
  desaparecer do Jira. A migração `drizzle/0025_ticket_history.sql` foi aplicada
  no D1 remoto em 2026-09-13.

- **Também em `main`:** busca de técnicos por cidade/UF, exportação Google
  Contatos TCP, link/equipe por FSA, fila do técnico por ID e nome/valor de
  grupo no atendimento ativo. A migração `drizzle/0024_overrated_whizzer.sql`
  foi aplicada remotamente. O valor do grupo ainda não entra nos totais de
  financeiro.

- **Segurança pré-lançamento (branch `codex/video-prelaunch-hardening`):**
  `scripts/worker-entry.js` envolve as respostas com cabeçalhos definidos em
  `scripts/security-headers.mjs`; `scripts/patch-wrangler.mjs` copia os dois
  arquivos para `dist/server`. `lib/safe-data-url.ts` valida anexos em base64
  do chat/N1 e a assinatura das fotos de RAT. Checklist e pendências em
  `docs/PRELAUNCH_AUDIT.md`. Ainda não foi publicado em produção.

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
| Assistente geral | Workers AI `@cf/zai-org/glm-4.7-flash`, com consultas somente de leitura e confirmação na tela para ações |
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
| Migrations | `drizzle/*.sql` — até `0025_ticket_history.sql`; geradas por `npm run db:generate` |
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
npm test            # suite node:test em tests/*.test.ts
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

**Deploy automático:** todo push na `main` publica produção via Cloudflare
Workers Builds (ver `docs/DEPLOYMENT.md`). Deploy manual continua só com pedido
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
- **O celular ganhou uma passada inteira em 16/09/2026** (ver CHANGELOG): a
  página rolava de lado porque filho de grid/flex não encolhe abaixo do
  conteúdo mínimo. As regras de celular vivem no bloco
  `@media (max-width: 639px)` do `app/globals.css`; a que esconde os atalhos
  flutuantes fica **fora das camadas**, porque dentro de `@layer` as utilidades
  do Tailwind vencem. O `scripts/ui-review.mjs` passou a usar dados sintéticos
  no pior caso (título longo, cidade longa, e-mail longo) — era por usar texto
  curto que ele não pegava esse tipo de quebra.
- **Z-index tem escala nomeada** em `app/globals.css` (`--z-content`,
  `--z-sticky`, `--z-float`, `--z-sidebar`, `--z-modal`, `--z-live-call`,
  `--z-incoming-call`, `--z-window-chrome`). Elemento fixo ou flutuante novo
  escolhe um degrau — não invente um número. Foi assim que o botão de reunião
  acabou pintando por cima dos diálogos. Só a chamada ativa e a moldura do
  desktop passam acima de um modal.

1. **Login por PIN (2026-09-24) — chave corrigida (#133, confirmado em
   produção: o custom token passou a sair). Segundo bug na sequência:** a
   sessão abria sem e-mail porque o token era assinado com o UID provisório
   `pending:<email>` da migração. Corrigido em `claude/fix-pin-uid-provisorio`
   (`requireApiUser` grava o UID real); quem já tinha PIN precisa entrar uma
   vez com a senha. Falta confirmar o PIN de ponta a ponta. Registro da
   primeira correção:
   O filtro "só caracteres de base64" (`cb57b1a`) removia a barra do `\n`
   literal da chave colada do JSON e mantinha o `n`, que é base64 válido:
   uma letra a mais por linha. Nem o filtro nem o padding recalculado tiravam
   esses `n`, por isso nada resolvia. Parsing agora em
   `lib/server/private-key-pem.ts`, com teste que importa uma chave RSA de
   verdade em cada formato de colagem. Depois do deploy, testar o desbloqueio;
   não precisa trocar o secret. O histórico abaixo fica como registro.

   *Histórico (antes da correção):* Migration `0041_pin_credentials.sql` já
   rodou, secrets `FIREBASE_SERVICE_ACCOUNT_EMAIL`/`_KEY` já configurados
   pelo usuário na Cloudflare, cadastro do PIN funciona. O desbloqueio
   (`app/api/auth/pin/unlock` → `lib/server/firebase-custom-token.ts`,
   `createFirebaseCustomToken`/`importPrivateKey`) falha sempre com o mesmo
   erro, confirmado pelo log ao vivo do Worker (aba Observability):
   `InvalidCharacterError: atob() called with invalid base64-encoded data.`

   **O que já foi tentado, nesta ordem, sem resolver:**
   - Filtrar a string colada para só os caracteres válidos de base64
     (`[A-Za-z0-9+/=]`) antes do `atob()` — não resolveu.
   - Suspeita de cache de build da Cloudflare servindo bundle antigo:
     confirmada e descartada como causa raiz — um "Retry deployment"/"clear
     cache" na lista de Builds gerou um Version ID genuinamente novo (build
     limpo, sem cache), e o erro **persistiu idêntico** mesmo assim.
   - Descartar todo `=` e recalcular o padding do zero a partir do
     comprimento limpo (cobre `=` de padding deslocado pro meio da string)
     — também não resolveu; mesmo erro, mesma mensagem, após deploy novo
     confirmado (Version ID diferente de novo).
   - Um erro de processo à parte (não a causa do bug): um commit ficou com
     `let der: Uint8Array` sem o parâmetro de tipo, quebrando o `tsc` do
     pipeline de build da Cloudflare — corrigido (`Uint8Array<ArrayBuffer>`,
     PR #131). Isso bloqueava o deploy de qualquer coisa, mas não era a
     causa do `atob()`.

   **Conclusão desta sessão:** a causa não é (mais) formatação da string
   colada — já foram cobertos caractere inválido e padding deslocado, com
   cada correção confirmada rodando em produção (Version ID novo a cada
   vez) antes de ainda falhar. Hipóteses não verificadas que sobraram: (a)
   o valor do secret na Cloudflare está genuinamente corrompido/incompleto
   de um jeito que essas correções não cobrem — vale gerar uma chave nova
   no Firebase e colar de novo do zero, com cuidado redobrado; (b) o log de
   diagnóstico adicionado em `importPrivateKey` (loga só o comprimento da
   string, nunca o conteúdo) pode ajudar a confirmar isso no próximo teste;
   (c) algo na própria API do Identity Toolkit ou no formato do JWT
   montado — ainda não investigado, porque o erro sempre aconteceu antes
   disso, na decodificação da chave. Usuário reportou nesta sessão que vai
   pedir a outra IA para continuar — não repetir os três pontos acima sem
   evidência nova.
2. **Testar salvar um chamado real com transição no Jira** no ambiente novo —
   único fluxo crítico ainda não exercitado em produção pós-migração.
3. Cadastrar `GOOGLE_MAPS_API_KEY`? **Não** — obsoleto após Leaflet. Pode
   remover o secret órfão.
4. Completar o catálogo de peças (a imagem de origem estava cortada).
5. Navegação compartilhada usa `next/link`; páginas próprias têm fallback por
   `window.location.assign()` para evitar dead-end do roteador vinext/WebView.
6. Desativar a produção antiga no OpenAI Sites — só depois de alguns dias de
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
