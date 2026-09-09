# Regras críticas de fluxo — Caju OS

Regras que **não podem** ser quebradas. Se uma mudança conflita com uma delas,
pare e confirme com o usuário.

---

## Jira

1. **Trocar a seleção de chamado no Kanban não altera status no Jira.** O
   status só muda após clique explícito de salvar/transicionar.
2. **Não avançar para "Técnico em campo" antes de agendar** quando o workflow
   do Jira exigir a sequência (agendar = técnico + `customfield_12036`
   preenchidos + transição para Agendado).
3. **Não permitir validação** sem: valores preenchidos, evidências anexadas e
   status correto do chamado.
4. **Evidência nova** deve ser anexada como comentário / observação interna no
   Jira quando possível — não só como anexo solto.
5. Campo que retorna `cannot be set. It is not on the appropriate screen`:
   usar fallback por `customfield_12279`/ADF **ou** enfileirar em
   `jira_sync_jobs`. **Nunca travar o fluxo local.**
6. Sempre que possível, consultar `GET /issue/{key}/transitions` e os
   metadados de campos em vez de assumir IDs. A transição para Agendado
   costuma ser `9`, mas confirme.
7. Preservar o formato do resumo técnico salvo no Jira:
   `PROBLEMA IDENTIFICADO: ... / TESTES FEITOS: ... / PEÇA A SER TROCADA: ...`
   (um único campo de texto, lido por `parseDefect()`).

## Financeiro

8. **Alterações financeiras são restritas a `gerencia`.** A rota
   `/api/operations` valida `hasFinancialChange()` + papel e retorna `403`
   para os demais. Não relaxar essa checagem sem pedido explícito.
9. CPF, chave PIX, dados bancários e endereço completo de técnico só vão para
   os papéis que tratam pagamento / cadastro. `/api/technicians` já filtra —
   não reabrir para todos.
10. Dinheiro sempre em **centavos** (inteiro). Nunca float, nunca string com
    vírgula persistida como número.

## Auditoria e histórico

11. **Toda automação e toda mudança de campo relevante deixa auditoria** em
    `operational_audit` (colaborador, data/hora, valor anterior, valor novo,
    origem, motivo).
12. `operational_audit` é **append-only**. Nunca `UPDATE` nem `DELETE`.
13. Mudança importante de chamado grava um `ticket_snapshot` do estado
    anterior antes de aplicar.

## Deploy e produção

14. **Produção só recebe build testado** (`npm test && npx tsc --noEmit &&
    npm run build` passando).
15. **Nunca publicar produção sem pedido explícito do usuário.** Isso vale
    para `npm run deploy`, `npm run release`, `wrangler deploy` e qualquer
    variante.
16. Não fazer deploy que inclua `custom_domain` novo sem o usuário saber que
    o DNS de `operacoes.cajutech.net` será repontado.
17. Migration nova: gerar (`npm run db:generate`), commitar o `.sql`, e
    **avisar no handoff** que `npm run db:migrate:remote` precisa rodar. Não
    aplicar em produção sem pedido.

## Git

18. **Não trabalhar direto na `main`** sem autorização explícita. Branch com
    prefixo `claude/...` ou `codex/...`, PR contra `main`.
19. Antes de editar: `git status --short`, entender alterações pendentes,
    preservar trabalho do usuário. Não apagar arquivos rastreados sem avaliar
    impacto.
20. **Não usar `git add -A` às cegas.** Já entrou coisa não intencional no
    histórico três vezes assim (skills do caveman, prompt em markdown).
    Adicione por caminho ou revise `git status` antes.
21. Não commitar: `node_modules/`, `.env*`, `.cloudflare.json`, logs, builds
    temporários, `.tar.gz`, `.exe`, caches, arquivos `.wrangler-*.sql`
    gerados.
22. Nunca gravar tokens, senhas, cookies ou credenciais no Git.

## Produto / UX

23. **Não simplificar o visual** (blur, transparência, transições) em nome de
    performance. Já foi tentado ("60 FPS") e rejeitado pelo usuário. Otimize
    lógica e renderização, não o design.
24. Não declarar "tempo real" o que depende de polling.
25. Antes de criar funcionalidade, **procurar se já existe.** Há duplicações
    conhecidas (validação de foto, campos do resumo técnico em duas telas,
    módulos órfãos em `lib/`) — não adicionar mais.
26. Falha de conveniência (OCR da RAT, geocodificação, TURN) **nunca** bloqueia
    o fluxo principal — degrada e segue.
