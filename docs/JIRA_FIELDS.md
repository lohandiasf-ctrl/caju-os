# Jira — campos e regras de integração

O catálogo completo de `customfield_*` (tipos na API, opções) está em
[`jira-custom-fields.md`](jira-custom-fields.md). Este arquivo cobre os campos
que o código usa e as regras de fluxo que **não podem** ser quebradas.

Integração: Jira Cloud REST API v3, auth Basic (`JIRA_EMAIL:JIRA_API_TOKEN`).
Código: `lib/server/jira.ts`. Projeto: `JIRA_PROJECT_KEY` (ex.: `FSA`).

---

## Campos usados pelo Caju OS

| Campo | ID | Tipo | Papel no Caju OS |
|---|---|---|---|
| Data/Hora – Agendamento | `customfield_12036` | DateTime ISO-8601 | data do agendamento; **obrigatório** antes da transição para Agendado |
| Data/Hora – Início | `customfield_10702` | DateTime ISO-8601 | início efetivo do atendimento; **obrigatório** antes de enviar para validação |
| Data/Hora – Término | `customfield_10703` | DateTime ISO-8601 | término efetivo do atendimento; **obrigatório** e posterior ao início antes de enviar para validação |
| Dados dos técnicos | `customfield_12279` | TextArea (ADF) | bloco de texto com nome/CPF/RG/telefone do técnico; **fallback** quando os campos individuais não estão na tela |
| Nome do Técnico | `customfield_12316` | String | preenchido no agendamento |
| Telefone do Técnico | `customfield_16237` | String | idem |
| RG | `customfield_11956` | String | idem (pode ser complementado à mão) |
| CPF/CNPJ Técnico | `customfield_16238` | String | idem |
| Número Contato | `customfield_11963` | String | contato do solicitante |
| Código da Loja | `customfield_14954` | Select | leitura |
| Código da loja (Texto) | `customfield_14809` | String | leitura |
| Valor Total de Equipamentos | `customfield_14880` | Number (Float) | somado pelo catálogo de peças na tela de detalhe |
| Chamado Faturado | `customfield_19825` | Select (`Sim`/`Não`) | leitura |

Outros IDs aparecem em `lib/server/jira.ts` para leitura de resumo/defeito
(`customfield_11955`, `11994`, `12278`, `12413`, `14827`). Ver o catálogo para
o significado.

## Regra de escrita: campo fora da tela

Se `PUT /rest/api/3/issue/{key}` retornar

```
Field 'customfield_XXXXX' cannot be set. It is not on the appropriate screen, or unknown.
```

o sistema **não deve travar o fluxo local**. Ele deve:

1. Repetir a escrita usando `customfield_12279` (bloco ADF com os mesmos
   dados), que costuma estar em todas as telas; **ou**
2. Enfileirar a operação em `jira_sync_jobs` (outbox durável), reprocessável
   pela tela de administração (`/api/admin/jira-sync`).

Nunca suponha que um `customfield` está disponível em todo tipo de chamado ou
toda transição. Quando possível, consulte `?expand=names&fields=*all` no GET e
`GET /issue/{key}/transitions` antes de escrever.

## Fluxo de agendamento

O Jira exige **técnico + data/hora preenchidos antes** de transicionar para
"Agendado". Ordem:

1. `PUT /rest/api/3/issue/{key}` com:
   - `customfield_12316`, `customfield_16237`, `customfield_11956`,
     `customfield_16238` (campos individuais do técnico), **e**
   - `customfield_12279` (bloco ADF equivalente — satisfaz validadores de
     workflow que checam o campo antigo), **e**
   - `customfield_12036` (data/hora do agendamento).
2. `POST /rest/api/3/issue/{key}/transitions` com a transição para Agendado.
   O ID **`9`** costuma ser essa transição, mas **consulte
   `GET /issue/{key}/transitions`** quando possível em vez de assumir — a
   transição inclui `customfield_12036` e `customfield_12279` no corpo para
   passar pelos validadores.

## Regras de negócio ligadas ao Jira

Ver `docs/WORKFLOW_RULES.md` para a lista completa. Em resumo:

- Trocar a seleção de chamado no Kanban **não** altera status no Jira. Só
  altera após clique explícito de salvar.
- Não avançar para "Técnico em campo" antes de agendar, quando o workflow do
  Jira exigir a sequência.
- Não permitir validação sem valores preenchidos, evidências anexadas e status
  correto.
- Evidência nova deve virar comentário / observação interna no Jira quando
  possível, não só anexo.
- O resumo técnico salvo no Jira é **um único campo de texto** formatado:

  ```
  PROBLEMA IDENTIFICADO: <texto>

  TESTES FEITOS: <texto>

  PEÇA A SER TROCADA: <texto>
  ```

  Lido de volta por `parseDefect()` em `lib/server/jira.ts` e
  `components/jira-ticket-details.tsx`. **Preserve esse formato** ao mexer no
  OCR da RAT ou no catálogo de peças.
