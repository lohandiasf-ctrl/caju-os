# CLAUDE.md — instruções para o Claude

Lido pelo Claude Code ao abrir o projeto. O Codex tem o `AGENTS.md`. As regras
são compatíveis; a diferença é o prefixo de branch (`claude/` vs `codex/`).

Raiz real do app: **esta pasta** (`caju-os-web`).

## Antes de começar

Leia, nesta ordem:

1. `AGENTS.md` e este `CLAUDE.md`.
2. `docs/AI_HANDOFF.md`
3. `docs/ARCHITECTURE.md`
4. `docs/KNOWN_BUGS.md`
5. `docs/WORKFLOW_RULES.md`
6. `docs/JIRA_FIELDS.md` / `docs/DEPLOYMENT.md` conforme a tarefa.

Depois: `git status --short`, `git log -8 --oneline`. Entenda o que está em
andamento.

## Regras

- **Branch com prefixo `claude/`.** Não trabalhe direto na `main`, salvo
  autorização explícita do usuário. (Em sessões anteriores o usuário autorizou
  commits diretos na `main` — só faça isso se ele disser de novo, nesta
  sessão.)
- **Deixe handoff claro para o Codex**: `docs/CHANGELOG.md` atualizado, PR com
  descrição do que foi feito, o que falta e como testar.
- Não duplique funcionalidade existente sem procurar antes. Duplicações
  conhecidas: validação de foto (`lib/image-validation.ts` vs. inline em
  `jira-ticket-details.tsx`), campos de resumo técnico em duas telas, módulos
  órfãos em `lib/` (`dispatch-engine.ts` etc.).
- **Não altere fluxos Jira / financeiro / produção sem validação.** Ver
  `docs/WORKFLOW_RULES.md`.
- Runtime é Cloudflare Workers — sem `fs`, sem libs nativas. `env` vem de
  `import { env } from 'cloudflare:workers'`.
- Rota de API nova: `requireApiUser(request, roles?)` + padrão de erro do
  projeto.
- Preserve o visual premium. Não simplifique em nome de FPS.
- Antes de commitar código: `npm test`, `npx tsc --noEmit`, `npm run build`.
- **Push na `main` publica produção** (GitHub Actions,
  `.github/workflows/deploy.yml`, desde 2026-09-11). Só envie para a `main` o
  que passou em teste/tsc/build; trabalho em andamento fica na branch
  `claude/`. Deploy manual (`npm run deploy`/`release`) continua exigindo
  pedido explícito.
- **Não use `git add -A` às cegas** — revise `git status` ou adicione por
  caminho. (Já aconteceu de entrar coisa não intencional.)
- Nunca grave segredos no Git.
- Falha de conveniência (OCR, geocode, TURN) nunca bloqueia o fluxo principal.

## Ao fazer mudança relevante

Atualize `docs/CHANGELOG.md` sempre. Atualize `docs/KNOWN_BUGS.md`,
`docs/AI_HANDOFF.md` e a seção "Próximas prioridades" quando aplicável.
Migration nova: gere o `.sql`, commite, e avise no handoff que
`npm run db:migrate:remote` precisa rodar.

## Rotina de branch (Claude)

```bash
git checkout main
git pull
git checkout -b claude/nome-da-tarefa
npm install          # se package.json mudou
npm test
npx tsc --noEmit
npm run build
git add <caminhos>   # não use -A às cegas
git commit -m "descrição clara do que e por quê"
git push -u origin claude/nome-da-tarefa
# abra PR contra main
```

## Estilo de trabalho

- Mudança pequena e verificável de cada vez.
- Investigar antes de deduzir — em sessões passadas houve diagnósticos errados
  por pular a verificação (Google Maps, script de migração).
- Ao propor algo grande junto de um lote já grande, separar em passo próprio.
- Relatar o que foi de fato feito e verificado, sem hedge; se um teste falhou
  ou um passo ficou pendente, dizer.

## Handoff Claude → Codex

`main`/branch limpo, testes passando, `docs/CHANGELOG.md` atualizado, PR aberto.
Se o trabalho deixou migration para aplicar, dado para conferir, ou decisão
humana pendente, escreva isso explicitamente no PR e no CHANGELOG.
