# AGENTS.md — instruções para o Codex

Este arquivo é lido pelo Codex ao abrir o projeto. O Claude tem o `CLAUDE.md`.
As regras dos dois são compatíveis; a diferença é o prefixo de branch.

Raiz real do app: **esta pasta** (`caju-os-web`), dentro de `Caju_Monitor_v2/`.
Não há outro projeto — todos os `package.json`, `vite.config.ts` e
`drizzle.config.ts` estão aqui.

## Antes de começar

Leia, nesta ordem:

1. `docs/AI_HANDOFF.md` — estado atual, stack, onde ficam as coisas.
2. `docs/ARCHITECTURE.md` — como o sistema é montado.
3. `docs/WORKFLOW_RULES.md` — o que não pode ser quebrado.
4. `docs/KNOWN_BUGS.md` — o que já é conhecido.
5. `docs/JIRA_FIELDS.md` — se a tarefa toca o Jira.
6. `docs/DEPLOYMENT.md` — se a tarefa toca build/deploy/env.

Depois: `git status --short` e `git log -8 --oneline`. Entenda o que já está
em andamento e **preserve o trabalho do usuário**.

## Regras obrigatórias

- **Branch com prefixo `codex/`.** Nunca commite direto na `main` sem
  autorização explícita do usuário. Abra PR contra `main`.
- Nunca grave tokens, senhas, cookies ou credenciais no Git. `.env.local` é só
  local; mantenha `.env.example` com valores vazios.
- **Não use `git add -A` às cegas.** Adicione por caminho ou revise
  `git status` antes de commitar.
- Não commite: `node_modules/`, `.env*`, `.cloudflare.json`, logs, builds
  temporários, `.tar.gz`, instaladores `.exe`, caches, `.wrangler-*.sql`
  gerados, artefatos do Codex/Claude.
- Não apague arquivos rastreados sem avaliar impacto e sem autorização.
- Runtime é **Cloudflare Workers**: sem `fs`, sem `Buffer` do Node, sem libs
  nativas. Use APIs web. Rotas de API pegam config via
  `import { env } from 'cloudflare:workers'`.
- Toda rota de API nova usa `requireApiUser(request, roles?)` de
  `lib/server/firebase-auth.ts` e o padrão de erro do projeto (retorna
  `Response.json({ error }, { status })`; repassa `Response` do catch).
- Para o Jira: descubra transições e campos permitidos pela API. Não suponha
  que um `customfield` está em toda tela / tipo de chamado. Status muda só
  após clique explícito; campos obrigatórios primeiro, transição depois.
- Preserve o visual premium (blur, transparência, transições). O usuário
  rejeitou a simplificação feita para "60 FPS".
- O EXE Tauri (0.1.13) carrega `https://operacoes.cajutech.net`; mudanças
  só-web chegam nele pelo deploy. Só gere instalador novo se `src-tauri/`,
  versão, ícone, permissões ou comandos Rust mudarem.
- Para mudanças de código: rode `npm test`, `npx tsc --noEmit` e
  `npm run build`. Se não passar, não commite.
- **Push na `main` publica produção.** Desde 2026-09-11, o Cloudflare
  Workers Builds roda testes, `tsc`, build e deploy a cada push na `main`
  (ver `docs/DEPLOYMENT.md`). Só envie para a `main` o que já está testado; trabalho em andamento
  fica na branch `codex/`. Deploy manual (`npm run deploy` / `release` /
  `wrangler deploy`) continua exigindo pedido explícito do usuário.
- Não declare "tempo real" o que depende de polling.
- Antes de criar funcionalidade, procure se já existe (há duplicações
  conhecidas — ver `docs/WORKFLOW_RULES.md` item 25).

## Ao fazer mudança relevante

- Atualize `docs/CHANGELOG.md` (o que mudou, por quê, o que ficou pendente).
- Atualize `docs/KNOWN_BUGS.md` se corrigiu ou descobriu um bug.
- Atualize `docs/AI_HANDOFF.md` se mudou arquitetura, ambiente, versão,
  migration ou processo de release.
- Registre decisões técnicas não óbvias no CHANGELOG ou como comentário no
  código — não deixe só na conversa.
- Para Cloudflare, siga `docs/DEPLOYMENT.md`. Migration nova: gere o `.sql`,
  commite, e **avise no handoff** que `npm run db:migrate:remote` precisa
  rodar.

## Rotina de branch (Codex)

```bash
git checkout main
git pull
git checkout -b codex/nome-da-tarefa
npm install          # se package.json mudou
npm test
npx tsc --noEmit
npm run build
git add <caminhos>   # não use -A às cegas
git commit -m "descrição clara do que e por quê"
git push -u origin codex/nome-da-tarefa
# abra PR contra main
```

## Ordem recomendada de trabalho

1. `git status --short` e `git log -8 --oneline`.
2. Ler a área do código envolvida e os testes correspondentes.
3. Fazer uma mudança pequena e verificável.
4. Rodar validações proporcionais ao risco (`docs/TESTING_CHECKLIST.md`).
5. Atualizar os docs e abrir o PR.

## Handoff Codex → Claude

Deixe: `main`/branch limpo, testes passando, `docs/CHANGELOG.md` atualizado,
PR aberto com descrição do que foi feito / o que falta / como testar. Liste
qualquer arquivo novo em `scripts/`, rota nova em `app/api/`, ou tabela nova
em `db/schema.ts`. Se mexeu em fluxo Jira/financeiro/produção, descreva o
teste que validou.
