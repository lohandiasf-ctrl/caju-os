# Migração: OpenAI Sites → Cloudflare próprio

O Caju OS passou a ser hospedado na conta Cloudflare do próprio usuário, com
deploy local (`npm run deploy`), sem OpenAI Sites nem Codex.

## Estado atual

- Worker: **`caju-os`** — https://caju-os.lohandiasf.workers.dev
- D1: **`caju-os-prod`** (`b3a189ab-a58f-40de-9299-bd5e636a588a`)
- Domínio de produção: `operacoes.cajutech.net` — **ainda no OpenAI Sites**
  (`CNAME → custom-domains.chatgpt.site`). Cutover pendente.

## Ferramental

| Arquivo | Função |
|---|---|
| `.cloudflare.json` (gitignored) | IDs da conta: `d1_database_name`, `d1_database_id`, opcionais `worker_name`, `custom_domain`, `vars` |
| `scripts/cf-config.mjs` | lê o `.cloudflare.json` |
| `scripts/patch-wrangler.mjs` | pós-build: injeta D1 real, nome do Worker, vars do `.env.local` e (se configurado) o custom domain |
| `scripts/build-init-sql.mjs` | concatena `drizzle/*.sql` em `.wrangler-init.sql` + registra na `d1_migrations` |
| `scripts/db-migrate-remote.mjs` | aplica o schema no D1 remoto |
| `scripts/dump-to-sql.mjs` | converte o dump da produção antiga em `INSERT`s (`.wrangler-data.sql`) |

Scripts npm: `db:migrate:remote`, `db:seed:remote`, `deploy`, `release`.

## Configuração do Worker

**Vars** (injetadas do `.env.local` no build): `JIRA_BASE_URL`, `JIRA_EMAIL`,
`JIRA_PROJECT_KEY`.

**Secrets** (`wrangler secret put <NOME> --name caju-os`):
- `JIRA_API_TOKEN` — ✅ cadastrado. Atenção: o token que estava no `.env.local`
  autenticava mas **não tinha permissão no projeto FSA** (Jira devolve 200 com
  lista vazia). Foi preciso gerar um token novo pela conta com acesso ao FSA.
- `GOOGLE_MAPS_API_KEY` — ⚠️ **pendente**. Sem ele `/api/maps-config` devolve
  string vazia e a tela de Mapa operacional fica sem mapa. Não estava no
  `.env.local` (era injetado pela plataforma da OpenAI).

**Voz**: degrada sozinha. `NEXT_PUBLIC_SIGNALING_URL` tem fallback hardcoded
para o Railway em `lib/voice-chat.ts`.

TURN agora usa **Cloudflare Realtime** (1.000 GB/mês grátis) com credenciais de
curta duração: `app/api/turn-credentials/route.ts` as gera sob demanda para o
usuário autenticado, e `lib/voice-chat.ts` busca e cacheia até expirar. As
antigas `NEXT_PUBLIC_TURN_*` foram removidas — eram build-time e ficavam
públicas dentro do bundle. Para ativar:

```powershell
npx wrangler secret put TURN_KEY_ID --name caju-os
npx wrangler secret put TURN_KEY_API_TOKEN --name caju-os
```

Sem esses secrets a rota devolve `configured: false` e a chamada cai para STUN
apenas, que funciona fora de NAT simétrico.

## Dados migrados (2.182 registros)

Extraídos da produção antiga via endpoints já publicados (a plataforma da OpenAI
não expunha o D1). Cobertura ~85%.

| Tabela | Linhas |
|---|---|
| technicians | 1.501 |
| employee_activity | 641 |
| app_users / employee_presence | 8 / 8 |
| chat_group_members | 8 |
| voice_call_history | 5 |
| operational_audit | 4 |
| technician_reviews | 2 |
| operational_workflows, chat_groups, chat_group_messages, finance_settings, communication_preferences | 1 cada |

**Não migrado** (sem endpoint de leitura na produção antiga):
`ticket_evidence` (fotos/vídeos/RATs) e `employee_messages` (mensagens diretas
1-a-1). Tabelas que já estavam vazias: stores, visits, tasks, shipments,
requesters, snapshots, syncJobs.

`app_users.firebase_uid` foi gravado como `pending:<email>`. Não é problema:
`requireApiUser()` casa por `firebaseUid` **ou** e-mail verificado e corrige o
UID no primeiro login. Já validado em produção nova com perfil `gerencia`.

## Smoke test (feito, na URL workers.dev)

✅ login e perfil · técnicos (1.501) · colegas · workflows · dashboard ·
financeiro · chat/grupos · Jira (50 chamados, detalhe, validação, anexos) ·
banner "Jira conectado".
⚠️ Mapa sem chave.

## Zona DNS: onde as coisas realmente estão

O domínio é **registrado e pago na Hostinger**, e o DNS é respondido por
`ns1.dns-parking.com` / `ns2.dns-parking.com` (Hostinger). A conta Cloudflare do
usuário **não tem zona nenhuma** — por isso `wrangler deploy` com custom domain
falha com "zone does not exist" (código 10083).

Custom domain de Worker exige a zona dentro da conta Cloudflare. Subdomain setup
(delegar só `operacoes`) é **exclusivo do plano Enterprise**, portanto não serve.
Apontar um CNAME externo para `*.workers.dev` também não funciona (erro 1014).

Inventário detectado do zone (NÃO é autoritativo — conferir no painel Hostinger):

| Tipo | Nome | Valor | Serve para |
|---|---|---|---|
| A | `@` | `216.198.79.1` | site principal (Vercel) |
| CNAME | `www` | `44b99eb9f82df52a.vercel-dns-017.com` | site (Vercel) |
| MX | `@` | `cajutech-net.mail.protection.outlook.com` (prio 0) | e-mail Microsoft 365 |
| TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | SPF |
| TXT | `@` | `MS=ms54779577` | verificação Microsoft |
| CNAME | `autodiscover` | `autodiscover.outlook.com` | Outlook |
| CNAME | `operacoes` | `custom-domains.chatgpt.site` | o app (será trocado) |

Sem DKIM e sem DMARC configurados.

## Cutover de DNS (pendente)

**Antes**: `operacoes.cajutech.net` → `CNAME custom-domains.chatgpt.site`
(guardar para rollback).

1. Adicionar em `.cloudflare.json`: `"custom_domain": "operacoes.cajutech.net"`
2. `npm run deploy` — a Cloudflare repontará o DNS para o Worker.
3. Conferir: o site responde, `/api/app-version` retorna 0.1.13, login funciona.

O EXE do desktop (0.1.13) e o servidor de voz (Railway) apontam para essa URL e
**não precisam ser recompilados**.

**Rollback**: recriar o `CNAME operacoes.cajutech.net → custom-domains.chatgpt.site`
e remover o custom domain do Worker. Enquanto o cutover não acontece, a produção
antiga segue intacta e servindo.

## Pendência de código (não bloqueia deploy)

`components/operation-workflow-dialog.tsx` importa `knowledgeArticles` e
`recommendTechnicians` de `@/lib/operational-intelligence` e **também** define as
duas localmente (linhas ~1431 e ~1496), com implementações divergentes — 2 erros
de `tsc --noEmit`, herdados da sessão anterior no Codex. O `import { Input }` que
faltava no mesmo arquivo (65 erros) já foi corrigido. Decidir qual versão fica.
