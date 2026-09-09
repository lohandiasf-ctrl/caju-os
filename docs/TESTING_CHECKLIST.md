# Checklist de testes — Caju OS

## Automático (sempre, antes de qualquer deploy)

```bash
npm test            # 3 testes: validação de chamado, política de retry, requisitos
npx tsc --noEmit    # precisa ficar 100% limpo
npm run lint        # oxlint — deve sair com código 0
npm run build       # build de produção sem erro
```

`npm run release` encadeia tudo + deploy. Não use `release` sem autorização
para publicar.

## Após o deploy (fumaça, via curl)

```bash
curl -s https://operacoes.cajutech.net/api/app-version                       # JSON com version
curl -s -o /dev/null -w "%{http_code}\n" https://operacoes.cajutech.net/     # 200
curl -s -o /dev/null -w "%{http_code}\n" https://operacoes.cajutech.net/login # 200
curl -s -o /dev/null -w "%{http_code}\n" https://operacoes.cajutech.net/api/technicians   # 401
curl -s -o /dev/null -w "%{http_code}\n" https://operacoes.cajutech.net/api/operations    # 401
```

Se mexeu em migration:

```bash
npm run db:migrate:remote
# depois confirme a contagem esperada:
npx wrangler d1 execute caju-os-prod --remote --command "SELECT COUNT(*) FROM d1_migrations;"
```

Se mexeu em DNS / `custom_domain`:

```bash
nslookup -type=MX cajutech.net 8.8.8.8         # MX Microsoft — NÃO pode ter mudado
nslookup -type=TXT cajutech.net 8.8.8.8        # SPF + MS= intactos
nslookup operacoes.cajutech.net 8.8.8.8        # IPs Cloudflare
```
E peça ao usuário para **mandar um e-mail de fora para `corporativo@cajutech.net`**
e confirmar a entrega. DNS certo no papel ≠ e-mail entregue.

## Manual (logado como gerência)

Marque o que a mudança tocou.

### Base
- [ ] Login funciona; papel correto exibido no menu.
- [ ] `/acesso-negado` aparece para papel sem permissão (teste com um usuário
      `tecnico` em `/financeiro`).
- [ ] Tela de loading da marca aparece durante a verificação de acesso.

### Chamados / Jira
- [ ] Kanban carrega; filtros por status e prioridade funcionam.
- [ ] Abrir um chamado mostra "Jira conectado" e os dados do Jira.
- [ ] Trocar de chamado no Kanban **não** altera nada no Jira.
- [ ] Editar um campo do resumo técnico e salvar → grava no Jira e na
      auditoria (`operational_audit`).
- [ ] **Agendar um chamado real** (técnico + data/hora) e transicionar para
      Agendado — *prioridade 1, ainda não validado no ambiente novo.*
- [ ] Botão "Validar" copia o link do Jira; mensagem "Link copiado. Envie no
      grupo SUP" aparece.

### Técnicos / mapa
- [ ] `/mapa` renderiza com marcadores; tema escuro.
- [ ] Buscar uma cidade **sem técnico** (ex.: "Camamu") centraliza no ponto e
      lista os mais próximos com distância.
- [ ] Clicar num técnico abre o painel com WhatsApp / telefone / e-mail.
- [ ] Perfil `tecnico`: a lista de técnicos **não** traz CPF nem chave PIX.

### N1 / evidências
- [ ] Anexar uma foto escura → aviso de qualidade aparece.
- [ ] Anexar RAT + evidência e validar o chamado.

### Comunicação
- [ ] Enviar mensagem direta e em grupo.
- [ ] Chamada de voz 1-a-1: áudio nos dois lados.
- [ ] Compartilhar tela: vídeo aparece do outro lado (testar desktop e mobile).
- [ ] Notificação desktop respeita quiet hours / mute.

### Tarefas delegadas
- [ ] Criar tarefa ligada a um chamado, aceitar, ver o responsável registrado.
- [ ] (Opcional) forçar `dueAt` no passado e rodar
      `POST /api/tasks/sweep` com o `x-cron-secret` → mensagem aos gerentes +
      auditoria; segunda chamada **não** repete a escalação.

### Financeiro
- [ ] Papel não-gerência: campos de valor/pagamento aparecem desabilitados; a
      API recusa (`403`) alteração financeira.
- [ ] Escolher peça do catálogo soma o preço no campo de valor.

### Feedback
- [ ] Qualquer papel abre `/?view=feedback`, cria um registro, dá voto.
- [ ] Gerência muda o status; a resposta fica visível para o autor.

### RAT (OCR)
- [ ] Primeiro uso: aparece o aviso de licença Meta com botão "Aceitar e
      habilitar" (só gerência).
- [ ] Após aceitar, "Ler RAT e preencher" com uma foto real preenche os campos
      (qualidade variável — é conveniência).

## Regressão desktop (se recompilou o EXE)
- [ ] Instala e abre em `https://operacoes.cajutech.net`.
- [ ] Controles de janela (minimizar / maximizar / fechar) funcionam.
- [ ] `app-version` no app bate com `app/api/app-version/route.ts`.
