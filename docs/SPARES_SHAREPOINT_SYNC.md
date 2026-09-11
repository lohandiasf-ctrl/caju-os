# Sincronização de Spares com SharePoint

## Objetivo

O Caju OS grava cada spare no D1 e mantém a planilha **CAJU TECH - Envio de
Equipamentos - AMERICANAS - Copiar.xlsx** no site compartilhado como fonte
única de dados.
O cadastro nunca
é perdido quando Excel ou Power Automate ficam indisponíveis: ele recebe estado
`pending`/`failed` e pode ser reenviado pelo botão **Sincronizar planilha**.

O Excel REST do Microsoft Graph não aceita permissão de aplicação para listar
ou inserir linhas de tabela; essas operações exigem uma sessão delegada de um
usuário. Para não guardar refresh token pessoal no Worker, a integração usa
dois fluxos do Power Automate com o conector **Excel Online (Business)**.

## Preparar a planilha

Use a tabela existente `Tabela13` na planilha (ou crie uma nova chamada
`SparesCaju` se quiser separar os dados). Os cabeçalhos
devem permanecer:

`STATUS`, `FSA`, `CIDADE`, `EQUIPAMENTO`, `CÓDIGO DE RASTREIO`,
`PREVISÃO DE ENTREGA`, `TÉCNICO RESPONSÁVEL`, `PREVISÃO DE ATENDIMENTO`,
`OBSERVAÇÃO`, `ENDEREÇO`, `FORNECEDOR`.

Adicione uma coluna `externalKey` (pode ficar oculta). Ela impede duplicidade
quando uma sincronização é repetida.

## Fluxo 1 — Caju OS para Excel

1. Crie um fluxo com o gatilho **When an HTTP request is received**.
2. Proteja o fluxo conferindo o header `x-caju-sync-token`.
3. Procure primeiro por `externalKey` na tabela. Se já existir, use **Update a
   row**; se não existir, use **Add a row into a table**. Essa verificação deixa
   o fluxo idempotente quando o Worker repete uma tentativa após timeout.
4. Mapeie o objeto `spare` recebido:
   - `status` → `STATUS`
   - `ticketKey` → `FSA`
   - `city` → `CIDADE`
   - `equipment` → `EQUIPAMENTO`
   - `trackingCode` → `CÓDIGO DE RASTREIO`
   - `expectedDelivery` → `PREVISÃO DE ENTREGA`
   - `technician` → `TÉCNICO RESPONSÁVEL`
   - `expectedService` → `PREVISÃO DE ATENDIMENTO`
   - `note` → `OBSERVAÇÃO`
   - `address` → `ENDEREÇO`
   - `supplier` → `FORNECEDOR`
   - `externalKey` → `externalKey`
5. Responda HTTP 200 após inserir a linha.

## Fluxo 2 — Excel para Caju OS

1. Crie outro fluxo HTTP e confira o mesmo header secreto. O Worker chama o
   gatilho com `POST` e o corpo `{ "action": "list-spares" }`.
2. Use **List rows present in a table** na tabela `Tabela13`.
3. **Ative a paginação nessa ação** — menu `...` → **Settings** → **Pagination**
   ligado → **Threshold** `5000`.

   > Este passo não é opcional. Sem ele o conector devolve **apenas as
   > primeiras 256 linhas** e ainda responde HTTP 200, então a sincronização
   > parece concluída enquanto o resto da planilha nunca chega ao sistema. Foi
   > exatamente o que aconteceu em 2026-09-11: 256 das ~381 linhas importadas, e
   > a FSA-132148 (linha 381) invisível no sistema. A rota agora detecta esse
   > truncamento e avisa em vez de reportar sucesso, mas quem corrige é a
   > paginação aqui.
4. Responda HTTP 200 com `{ "items": <value da ação de listar linhas> }`.

O botão **Sincronizar planilha** chama esse fluxo, importa alterações e depois
reenvia registros locais pendentes. Além disso, o Worker executa a mesma
sincronização automaticamente a cada dez minutos; novos cadastros feitos no
sistema continuam tentando o envio imediatamente.

## Secrets do Worker

Cadastre sem imprimir os valores no terminal compartilhado:

```powershell
npx wrangler secret put SPARES_SYNC_PUSH_URL
npx wrangler secret put SPARES_SYNC_PUSH_URL_ORIGINAL
npx wrangler secret put SPARES_SYNC_PULL_URL
npx wrangler secret put SPARES_SYNC_TOKEN
```

`SPARES_SYNC_PUSH_URL` é o fluxo que grava na planilha compartilhada. O antigo
arquivo pessoal não existe mais no OneDrive; não configure
`SPARES_SYNC_PUSH_URL_ORIGINAL` até que seja restaurado em uma biblioteca que o
conector consiga acessar. O Worker considera a gravação concluída somente
quando todos os fluxos configurados respondem 2xx; se uma planilha falhar, o
registro fica pendente/failed para reenvio.

No momento, a cópia está disponível ao conector em:
`SharePoint Site - CAJU TECH - SOLUCOES EM INFORMATICA` → biblioteca
`Documentos` → `CAJU TECH - Envio de Equipamentos - AMERICANAS - Copiar.xlsx` →
`Tabela13`.

O fluxo de gravação da cópia foi criado como **Caju OS - Spare - Registrar na
planilha compartilhada** (ID do fluxo:
`69125046-bb4e-4cb0-956b-74ab66ce8cdc`). O gatilho HTTP e a resposta do fluxo
exigem Power Automate Premium; o designer salvou a definição, mas ela só pode
ser ativada depois que o proprietário habilitar uma licença Premium ou uma
avaliação no ambiente.

O link antigo do arquivo pessoal foi verificado e retorna que o arquivo não foi
encontrado. A interface não tenta mais abri-lo: ela abre somente a planilha
compartilhada válida, evitando dois destinos concorrentes.

Depois execute a migration `0021_spares.sql`, valide em staging e publique o
Worker. As URLs dos gatilhos são segredos porque normalmente contêm assinatura.

## Contrato da API interna

- `GET /api/spares`: lista o cadastro persistente e a disponibilidade do conector.
- `POST /api/spares`: cadastra no D1 e tenta enviar ao Excel imediatamente.
- `POST /api/spares/sync`: lê o Excel e reenvia pendências ao Excel.

Todas as rotas exigem Firebase ID token e papel `gerencia`.
