# Onboarding do Codex — Caju OS

Cole este texto no Codex na primeira sessão dele neste projeto. É um guia único
de entrada; a partir daí ele segue o `AGENTS.md` normalmente.

---

Você é o **Codex** trabalhando no projeto **Caju OS**, junto com o **Claude**,
no mesmo repositório. Sua tarefa nesta primeira sessão é se orientar e deixar
tudo pronto para trabalhar sem colidir com o outro agente nem com o usuário.

## O que é este projeto

Plataforma interna de gestão operacional de field service, integrada ao Jira
Cloud. Saiu do OpenAI Sites e hoje roda num Cloudflare Worker
(`operacoes.cajutech.net`). Stack: **vinext** (compatível com Next App Router)
+ React 19 + TypeScript, rodando em **Cloudflare Workers** (sem `fs`, sem libs
nativas), banco **Cloudflare D1** com Drizzle, autenticação **Firebase**.

## Passo 1 — Confirme onde você está

O repositório de trabalho é o do **GitHub**: `lohandiasf-ctrl/caju-os`.

```bash
git remote -v
```

- `origin` deve apontar para `github.com/lohandiasf-ctrl/caju-os`. Se ainda
  apontar para `git.chatgpt-team.site/...`, você está no repositório antigo do
  OpenAI Sites — peça ao usuário para conectar o repo do GitHub antes de
  continuar.
- Existe um remote `openai-sites` — **não use**. É só o histórico da produção
  antiga, mantido como rollback.

## Passo 2 — Leia a documentação, nesta ordem

1. `AGENTS.md` — suas regras (é o que você lê sempre, todo início de sessão).
2. `docs/AI_HANDOFF.md` — estado atual, stack, onde ficam as coisas, protocolo
   de handoff.
3. `docs/ARCHITECTURE.md` — como o sistema é montado.
4. `docs/WORKFLOW_RULES.md` — o que **não pode** ser quebrado.
5. `docs/KNOWN_BUGS.md` — o que já é conhecido (resolvido / pendente / validar
   em produção).
6. `docs/JIRA_FIELDS.md` — se a tarefa toca o Jira.
7. `docs/DEPLOYMENT.md` — se a tarefa toca build/deploy/env.
8. `docs/CHANGELOG.md` — o que mudou recentemente e por quê.

Depois: `git status --short` e `git log -10 --oneline` para ver o que está em
andamento.

## Passo 3 — Entenda seus limites

**Você PODE:**
- Ler todo o código e a documentação.
- Escrever código numa branch `codex/nome-da-tarefa`.
- Rodar `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Gerar migration (`npm run db:generate`) e commitar o `.sql`.
- Abrir Pull Request contra `main`.
- Atualizar os arquivos em `docs/`.

**Você NÃO PODE:**
- Commitar direto na `main` — sempre branch + PR.
- Fazer merge do próprio PR — quem revisa e mergeia é o **usuário**.
- Publicar produção — `npm run deploy`, `npm run release` e `wrangler deploy`
  precisam de credenciais que só existem na máquina do usuário
  (`.cloudflare.json` e `.env.local` são gitignored). Se a tarefa exige
  deploy, deixe isso explícito no PR para o usuário rodar.
- Aplicar migration em produção (`npm run db:migrate:remote`) — só o usuário.
- Gravar segredos no Git.
- Aceitar termos/licenças de serviços em nome do usuário.

## Passo 4 — O ciclo de trabalho

Toda tarefa começa assim:

```bash
git checkout main
git pull
git checkout -b codex/nome-da-tarefa
npm install            # só se package.json mudou
```

Faça a mudança **pequena e verificável**. Depois:

```bash
npm test
npx tsc --noEmit
npm run build
# atualize docs/CHANGELOG.md com o que mudou e por quê
git add <caminhos>     # NÃO use "git add -A" às cegas — revise git status antes
git commit -m "descrição clara do que e por quê"
git push -u origin codex/nome-da-tarefa
```

Abra o PR contra `main` com: o que foi feito, o que ficou pendente, como
testar. O usuário revisa e mergeia. Se ele mergear, quem publica é ele.

## Passo 5 — Evitar colisão com o Claude

- **Uma tarefa por branch.** Não empilhe assuntos diferentes num PR.
- Antes de começar, olhe `docs/CHANGELOG.md` e as branches abertas
  (`git branch -r`) para não pegar algo que o Claude já está fazendo.
- **`app/page.tsx` tem ~3300 linhas** e é o maior risco de conflito de merge.
  Se sua tarefa toca esse arquivo, diga isso no PR logo no título, para o
  Claude não mexer nele em paralelo. Se der para resolver a tarefa sem tocar
  `page.tsx`, prefira.
- Não duplique funcionalidade. Já há duplicações conhecidas (validação de
  foto, campos de resumo técnico em duas telas, módulos órfãos em `lib/`) —
  procure antes de criar.

## Passo 6 — Handoff Codex → Claude

Quando terminar, deixe rastro suficiente para o Claude continuar sem a memória
da sua conversa:

- `docs/CHANGELOG.md` atualizado (o que mudou, o que ficou pendente).
- `docs/KNOWN_BUGS.md` atualizado se corrigiu ou descobriu um bug.
- `docs/AI_HANDOFF.md` atualizado se mudou arquitetura, ambiente, versão,
  migration ou release.
- No PR: liste arquivo novo em `scripts/`, rota nova em `app/api/`, tabela
  nova em `db/schema.ts`.
- Se deixou migration para aplicar ou algo que precisa de decisão humana,
  escreva isso **explicitamente** no PR e no CHANGELOG — não deixe só na
  conversa.

## Tarefa sugerida para esta primeira sessão

Para provar que o ciclo funciona, pegue uma tarefa pequena e isolada de
`docs/KNOWN_BUGS.md`. Boas candidatas de baixo risco:

- Remover ou integrar os módulos órfãos em `lib/` (`dispatch-engine.ts`,
  `knowledge-base.ts`, `delegated-tasks.ts`, `audit-engine.ts` — nenhum é
  importado por nada; `image-validation.ts` é usado, não mexa nele).
- Consolidar as duas validações de foto numa só (`lib/image-validation.ts` vs.
  a inline em `components/jira-ticket-details.tsx`).

Faça numa branch `codex/`, abra o PR, e pare. O usuário mergeia e o Claude
confere no próximo trabalho.
