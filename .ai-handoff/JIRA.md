# Integração Jira

## Princípio

Toda ação feita no Caju OS deve refletir no Jira imediatamente ou apresentar um erro acionável. Não altere apenas o estado visual/local.

Fluxo seguro para status:

1. Recarregar o chamado atual do Jira.
2. Consultar `GET /rest/api/3/issue/{key}/transitions`.
3. Atualizar campos obrigatórios aceitos pela tela do chamado com `PUT /rest/api/3/issue/{key}`.
4. Executar `POST /rest/api/3/issue/{key}/transitions` usando o ID retornado.
5. Recarregar e confirmar o status final.

Se o Jira responder “field cannot be set / not on appropriate screen”, o campo deve ser omitido para aquele tipo de chamado, sem bloquear todos os demais campos. A implementação usa metadados e fallbacks em `lib/server/jira.ts`.

## Campos conhecidos

| Finalidade | ID Jira | Observação |
|---|---|---|
| Data/hora do agendamento | `customfield_12036` | DateTime ISO com offset |
| Dados dos técnicos | `customfield_12279` | Pode exigir ADF conforme a tela |
| Nome do técnico | `customfield_12316` | Texto |
| Telefone do técnico | `customfield_16237` | Legado; requisito atual diz não enviar telefone |
| RG do técnico | `customfield_11956` | Legado/condicional |
| CPF/CNPJ do técnico | `customfield_16238` | Pode não existir na tela de alguns chamados |
| Número de contato | `customfield_11963` | Legado/condicional |

Requisito de negócio mais recente para “Dados dos técnicos”: enviar nome completo, CPF e endereço completo; não incluir telefone. Confirme com o Jira quais campos individuais estão habilitados antes de enviá-los.

Existe uma listagem maior fornecida pelo usuário em:
`C:\Users\Lohan Dias\.codex\attachments\86774612-a4f7-45ed-aadd-4dae239902b9\pasted-text.txt`.
Ela é referência auxiliar, não substitui `editmeta`, transições e os metadados vivos da API.

## ADF

Comentários e campos rich-text no Jira v3 devem usar Atlassian Document Format:

```json
{"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"Texto"}]}]}
```

Não envie string simples para um campo que a API identifica como documento.

## Evidências

- Upload: `POST /rest/api/3/issue/{key}/attachments`, multipart, com `X-Atlassian-Token: no-check`.
- O Caju OS também registra uma observação interna associada ao envio.
- Preview/download passa pelas rotas proxy em `app/api/jira/issues/[key]/attachments/**`; não exponha credenciais Jira ao navegador.

## Transições obrigatórias

“Agendado” exige data/hora e dados do técnico. IDs de transição não devem ser tratados como globais, mesmo que `9` tenha sido observado: consultar as transições disponíveis de cada chamado é obrigatório.

