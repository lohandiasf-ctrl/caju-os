# Deployment — Caju OS

Hospedagem: Cloudflare Worker `caju-os` na conta Cloudflare do usuário, servindo
`operacoes.cajutech.net`. Não há mais OpenAI Sites no caminho de publicação.

**Regra:** produção só recebe build testado. Push na `main` publica
automaticamente (ver "Deploy automático"); deploy manual só com pedido
explícito do usuário.

---

## Instalar dependências

```bash
npm install
```

Node ≥ 22.13 (o repo foi validado com Node 24). Requer `wrangler` autenticado
para qualquer operação Cloudflare — feito uma vez pelo usuário:

```bash
npx wrangler login
```

## Rodar local

```bash
cp .env.example .env.local     # preencha os JIRA_* reais
npm run dev                    # vinext dev — http://localhost:5173
```

## Rodar testes

```bash
npm test            # 3 testes unitários
npx tsc --noEmit    # typecheck, precisa ficar limpo
npm run lint        # oxlint (type-aware desligado; ver AI_HANDOFF)
```

## Gerar build

```bash
npm run build       # vinext build -> dist/
```

O build gera `dist/server/wrangler.json` com um `database_id` **placeholder**
(`00000000-0000-4000-8000-000000000000`). O deploy corrige isso.

## Publicar no Cloudflare

```bash
npm run deploy
```

O que `npm run deploy` faz:

1. `node scripts/patch-wrangler.mjs` reescreve `dist/server/wrangler.json`:
   - troca o `database_id` placeholder pelo real (de `.cloudflare.json`);
   - renomeia o Worker de `sites-project` para `caju-os`
     (ou `worker_name` de `.cloudflare.json`);
   - injeta as vars `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_PROJECT_KEY`
     lidas de `.env.local`;
   - adiciona o binding `AI` (Workers AI);
   - aponta `main` para `scripts/worker-entry.js` (wrapper que adiciona o
     handler `scheduled`) e define o cron `*/10 * * * *`;
   - se `.cloudflare.json` tiver `custom_domain`, adiciona a rota de domínio
     com `zone_name` — **isso repontará o DNS de `operacoes.cajutech.net`**.
2. `wrangler deploy -c dist/server/wrangler.json`.

`npm run release` = `test` + `tsc` + `build` + `deploy`.

### `.cloudflare.json` (gitignored — valores da conta)

```json
{
  "d1_database_name": "caju-os-prod",
  "d1_database_id": "b3a189ab-a58f-40de-9299-bd5e636a588a",
  "custom_domain": "operacoes.cajutech.net",
  "zone_name": "cajutech.net"
}
```

Sem `custom_domain`, o deploy publica só em `caju-os.<conta>.workers.dev`.

## Deploy automático (Cloudflare Workers Builds)

Desde 2026-09-11, o Worker `caju-os` está ligado ao repositório
`lohandiasf-ctrl/caju-os` pelo Workers Builds (painel → Workers & Pages →
caju-os → Settings → Builds). Todo push na `main` roda, na Cloudflare:

- Build command: `npm test && npx tsc --noEmit && npm run build`
- Deploy command: `npm run deploy` (`patch-wrangler.mjs` + `wrangler deploy`)

Se um passo falhar, nada é publicado. A autenticação é o "caju-os build token"
que a própria integração mantém — não há token de API para renovar à mão.
Builds de outras branches estão desligados.

No build não existe `.cloudflare.json`, então `scripts/cf-config.mjs` lê os
mesmos valores das **build variables** (Settings → Builds → Variables and
secrets): `D1_DATABASE_NAME`, `D1_DATABASE_ID`, `CUSTOM_DOMAIN`, `ZONE_NAME`,
`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_PROJECT_KEY`. Todas são obrigatórias:
faltando uma, o deploy para — sem o domínio a rota de `operacoes.cajutech.net`
cairia, e sem as vars do Jira o `wrangler deploy` as apagaria do Worker. Os
secrets do Worker (`JIRA_API_TOKEN`, `CRON_SECRET`...) não passam pelo build e
não são alterados.

O deploy automático **não** aplica migrations. Código que depende de migration
nova só pode chegar na `main` depois de `npm run db:migrate:remote`.

## Migrations do banco

```bash
npm run db:generate        # gera drizzle/NNNN_*.sql a partir de db/schema.ts
npm run db:migrate:remote  # aplica no D1 remoto (pede confirmação y/n)
```

`scripts/db-migrate-remote.mjs` lê a tabela `d1_migrations`, aplica **só** o que
falta, e **aborta** se não conseguir ler o controle (nunca reexecuta
`CREATE TABLE` sobre banco populado).

Cargas de dados pontuais têm scripts próprios (ex.: `scripts/seed-parts.mjs`
gera `.wrangler-parts.sql`, aplicado com
`wrangler d1 execute caju-os-prod --remote --file=...`).

## Variáveis de ambiente

### Vars (não secretas) — injetadas de `.env.local` no build

| Nome | Uso |
|---|---|
| `JIRA_BASE_URL` | ex.: `https://delfia.atlassian.net` |
| `JIRA_EMAIL` | conta de integração com acesso ao projeto |
| `JIRA_PROJECT_KEY` | ex.: `FSA` |

Build-time também: `NEXT_PUBLIC_SIGNALING_URL` (opcional; tem fallback
hardcoded para o Railway em `lib/voice-chat.ts`).

### Secrets — `wrangler secret put <NOME> --name caju-os`

| Nome | Uso | Estado |
|---|---|---|
| `JIRA_API_TOKEN` | token da API do Jira | necessário |
| `CRON_SECRET` | protege `/api/tasks/sweep` | necessário para a varredura |
| `TURN_KEY_ID` | Cloudflare Realtime TURN | opcional (sem ele: só STUN) |
| `TURN_KEY_API_TOKEN` | idem | opcional |
| `TRACKINGMORE_API_KEY` | rastreio automático de spares (TrackingMore, API v4) | opcional (sem ele: spare é cadastrado sem consulta) |
| `GOOGLE_MAPS_API_KEY` | **obsoleto** (mapa é Leaflet) | secret órfão; pode remover |

### Bindings — definidos por `scripts/patch-wrangler.mjs`

| Binding | Recurso |
|---|---|
| `DB` | D1 `caju-os-prod` |
| `AI` | Workers AI (OCR da RAT) |

### Firebase (cliente) — **não são segredos**

Config do cliente Firebase está hardcoded em `lib/firebase.ts` (`apiKey`,
`authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
Projeto: `caju-websys`. É a chave pública do cliente; não precisa de env var.

### Onde configurar na Cloudflare

- Secrets: `wrangler secret put` (CLI) ou painel do Worker → Settings →
  Variables and Secrets.
- Bindings e cron: gerados no deploy pelo `patch-wrangler.mjs`; não edite pelo
  painel (o próximo deploy sobrescreve).

## Validar produção depois do deploy

```bash
curl -s https://operacoes.cajutech.net/api/app-version         # {"version":"0.1.14",...}
curl -s -o /dev/null -w "%{http_code}\n" https://operacoes.cajutech.net/    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://operacoes.cajutech.net/api/technicians  # 401 (protegida)
```

Manual, logado como gerência: Kanban carrega, abrir um chamado, "Jira
conectado", mapa renderiza com marcadores, chat abre. Checklist completo em
`docs/TESTING_CHECKLIST.md`.

DNS (após deploy com `custom_domain`):

```bash
nslookup -type=MX cajutech.net 8.8.8.8      # MX Outlook intacto — NÃO pode mudar
nslookup operacoes.cajutech.net 8.8.8.8     # deve resolver para IPs Cloudflare
```

## Rollback

**Código:** `git revert <commit>` + `npm run deploy`. Ou publique o commit
anterior conhecido bom.

**DNS / domínio inteiro:** a produção antiga no OpenAI Sites continua no ar. No
painel DNS da Cloudflare, edite o registro `operacoes` de volta para:

```
CNAME  operacoes  →  custom-domains.chatgpt.site   (DNS only)
```

e remova o custom domain do Worker (`custom_domain` fora do `.cloudflare.json` +
deploy). O tráfego volta para o ambiente antigo em minutos.

**Migration:** o D1 não tem rollback automático. `scripts/db-migrate-remote.mjs`
aplica tudo dentro de uma transação — se falhar, o D1 volta ao estado anterior.
Para desfazer uma migration já aplicada, escreva uma nova que reverte.

## Desktop (Tauri)

```bash
npm run desktop:build
```

Só recompile o EXE quando mudar `src-tauri/`, a versão, ícone, permissões ou
comandos Rust. Mudanças só-web chegam ao 0.1.15 pelo deploy — ele carrega
`https://operacoes.cajutech.net`. O artefato NSIS sai em
`src-tauri/target/release/bundle/nsis/`; publique em
`public/downloads/Caju-OS-<versão>-x64-setup.exe` e atualize
`app/api/app-version/route.ts`.
