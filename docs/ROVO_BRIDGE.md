# Ponte Caju OS ↔ Rovo

Metade desta integração vive no Jira, não neste repositório. O código do Caju OS
está pronto; esta página é o que falta configurar no admin do Jira.

## Por que dá essa volta

O Rovo **não expõe API pública de chat**. Não existe endpoint para o Caju OS
chamar e esperar a resposta. O único caminho suportado pela Atlassian é usar uma
regra de **Jira Automation** como intermediária, e ela responde por callback:

```
Caju OS  --POST-->  webhook de entrada (regra de Automation)
                      -> ação "Use Rovo agent"
                      -> {{agentResponse}}
                      -> "Send web request" --> POST /api/rovo/callback
                                                   |
Caju OS mostra a resposta  <-----------------------+
```

Consequência que não dá para contornar: **é assíncrono**. A tela pergunta e
espera; a resposta chega em outra requisição. O Caju OS consulta a cada 2s e
desiste em 2 minutos.

## Pré-requisitos

- Licença do Rovo ativa.
- Permissão para criar regra de Automation no projeto.
- Cada pergunta consome **uma execução de Automation** do plano.

## 1. Regra de Automation no Jira

**Gatilho:** *Incoming webhook*. Guarde a URL gerada — ela vira
`ROVO_WEBHOOK_URL`. Em "Execute a regra com": **Nenhum item** (a pergunta não
está presa a uma issue).

O Caju OS envia este corpo:

```json
{
  "requestId": "uuid-da-pergunta",
  "question": "texto da pergunta",
  "ticketKey": "FSA-123",
  "askedBy": "pessoa@cajutech.net",
  "callbackUrl": "https://operacoes.cajutech.net/api/rovo/callback"
}
```

**Ação 1 — Use Rovo agent.** Escolha o agente e passe a pergunta:

```
{{webhookData.question}}

Chamado: {{webhookData.ticketKey}}
Pedido por: {{webhookData.askedBy}}
```

**Ação 2 — Send web request.**

- URL: `{{webhookData.callbackUrl}}`
- Método: `POST`, tipo `application/json`
- Cabeçalho: `x-rovo-secret` com o mesmo valor de `ROVO_CALLBACK_SECRET`
- Corpo:

```json
{
  "requestId": "{{webhookData.requestId}}",
  "answer": "{{agentResponse}}"
}
```

### Se quiser que o Rovo proponha uma ação

Peça ao agente que termine com um bloco JSON e mande esse bloco no campo
`action` do callback. A ação **não é aplicada pelo callback**: ela vira uma
proposta pendente e passa pela mesma confirmação do assistente local, com a
mesma lista fechada (`comment`, `transition`, `schedule`) e a mesma auditoria.
Só quem fez a pergunta pode confirmar, uma vez, em até 30 minutos.

## 2. Segredos no Cloudflare

```bash
npx wrangler secret put ROVO_WEBHOOK_URL     # URL do webhook da regra
npx wrangler secret put ROVO_CALLBACK_SECRET # valor longo e aleatório
```

`ROVO_CALLBACK_SECRET` é a única porta do callback — o Jira não manda token do
Firebase, então o endpoint é público e o segredo é o que o protege. Comparação
em tempo constante em `lib/rovo.ts`. **Nunca** comite esse valor.

## 3. Migrations

```bash
npm run db:migrate:remote
```

Cria `rovo_requests` (0035) e `assistant_actions` (0034).

## Quando algo não funciona

| Sintoma | Onde olhar |
|---|---|
| "A ponte com o Rovo não está configurada" | `ROVO_WEBHOOK_URL` não chegou ao Worker |
| "O Jira recusou a pergunta (HTTP 4xx)" | URL do webhook errada ou regra desativada |
| Fica pendente e expira em 2 min | A regra rodou mas não chamou o callback. Veja o log de auditoria da regra no Jira |
| Callback responde 401 | `x-rovo-secret` diferente de `ROVO_CALLBACK_SECRET` |
| Callback responde 409 | Retentativa da regra numa pergunta já respondida — esperado, não é erro |

## O que ficou de fora de propósito

O callback nunca escreve no Jira sozinho. O Rovo pode **sugerir**; aplicar
depende de uma pessoa confirmar no Caju OS. Isso é o que mantém a trilha de
auditoria honesta — sem confirmação, não haveria a quem atribuir a escrita.
