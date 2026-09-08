# Leitura automática da RAT (implementado)

> Este documento nasceu como briefing para outra IA. A implementação final está
> descrita ao fim; o corpo abaixo permanece como registro do contexto do projeto.

# Briefing: leitura automática da RAT para preencher o resumo técnico

## Objetivo

Quando o técnico anexa a RAT (Relatório de Atendimento Técnico) a um chamado, o
sistema deve ler o documento e preencher automaticamente três campos do
formulário, deixando-os editáveis para revisão humana antes de salvar:

- `identifiedProblem` — "Problema identificado"
- `testsPerformed` — "Testes feitos"
- `partToReplace` — "Peça a ser trocada"

A RAT chega como **imagem** (foto do papel, tirada em campo) ou **PDF**.

---

## Stack e ambiente

| Item | Valor |
|---|---|
| Framework | `vinext` 1.0.0-beta.5 (RSC, roteamento estilo Next App Router) |
| UI | React 19.2, TypeScript 5.9 (strict), Tailwind v4 |
| Runtime | **Cloudflare Workers** (não Node) |
| Banco | Cloudflare D1 + Drizzle ORM |
| Build | `npm run build` (Vite 8) |
| Deploy | `npm run deploy` |
| Node local | v24 |
| Worker | `caju-os` · produção em `https://operacoes.cajutech.net` |

Rotas de API ficam em `app/api/**/route.ts` e exportam `GET`/`POST`/`PATCH`/`PUT`.
Rodam **no runtime de Workers**: não há `fs`, `Buffer` do Node nem dependências
nativas. Use APIs web (`fetch`, `FormData`, `crypto.subtle`, `ArrayBuffer`).

---

## Autenticação (obrigatória em qualquer rota nova)

```ts
import { requireApiUser } from '@/lib/server/firebase-auth';

export async function POST(request: Request) {
  const user = await requireApiUser(request);          // lança Response 401/403
  // requireApiUser(request, ['gerencia'])  → restringe por papel
}
```

Papéis: `gerencia`, `coordenador`, `n1`, `analista`, `tecnico`.
O cliente envia `Authorization: Bearer <firebase id token>`.

Padrão de erro usado no projeto:

```ts
catch (error) {
  if (error instanceof Response) return error;
  return Response.json({ error: 'mensagem' }, { status: 500 });
}
```

---

## Onde os campos existem hoje

**Duas telas** usam os mesmos três campos:

1. `components/jira-ticket-details.tsx` (~linha 206)
   Estado: `const [form, setForm] = useState<Record<string, string>>({})`
   Renderiza os três `textarea` a partir de um array de pares `[key, label]`.

2. `components/operation-workflow-dialog.tsx` (~linha 1263)
   Estado: `form` do tipo `Record<string, string | number | boolean | null>`,
   atualizado por `set("identifiedProblem", valor)`.

**Formato no Jira** — os três viram um único campo customizado de texto
(`lib/server/jira.ts:256`):

```
PROBLEMA IDENTIFICADO: <texto>

TESTES FEITOS: <texto>

PEÇA A SER TROCADA: <texto>
```

E são lidos de volta por `parseDefect()` (`lib/server/jira.ts:527` e
`components/jira-ticket-details.tsx:243`). **Preserve esse formato.**

---

## Onde o anexo é enviado hoje

`app/api/jira/issues/[key]/attachments/route.ts` (POST):

- recebe `multipart/form-data` com campo `files` (múltiplos)
- máx. 8 arquivos · 25 MB cada · 50 MB total
- extensões: `png jpg jpeg webp gif heic mp4 mov webm avi pdf doc docx xls xlsx csv txt`
- encaminha para o Jira via `uploadJiraAttachments(key, files, user.email)`

No cliente, o upload está em `components/jira-ticket-details.tsx`, função
`uploadFiles()` (~linha 140). Antes de enviar ela chama
`validateEvidenceFiles()` → `inspectImageQuality()`, que usa
`createImageBitmap` + `canvas.getImageData` para medir resolução, brilho e
contraste. **Esse é o ponto natural para disparar a extração.**

---

## Abordagem recomendada: Cloudflare Workers AI

A conta já é Cloudflare. Workers AI roda no mesmo Worker, tem cota gratuita
diária e **não exige novo fornecedor, chave no cliente nem faturamento**.

Modelo sugerido para visão/documento:
`@cf/meta/llama-3.2-11b-vision-instruct` (confirmar disponibilidade e nome atual
na documentação — a lista muda).

### ⚠️ Ponto crítico e não óbvio: como adicionar o binding

A configuração de deploy **é gerada pelo build e depois reescrita** por
`scripts/patch-wrangler.mjs`. Não existe `wrangler.toml` versionado.

Para um binding novo (ex.: `AI`), é preciso mexer em **dois** lugares:

1. `vite.config.ts` → objeto `localBindingConfig` (usado no dev)
2. `scripts/patch-wrangler.mjs` → que edita `dist/server/wrangler.json` após o
   build, definindo D1, nome do Worker, vars, rota de domínio e cron

Se adicionar só no `vite.config.ts`, **o binding não chega à produção.**

3. Tipar em `db/env.d.ts`:

```ts
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    JIRA_BASE_URL: string;
    // ...
    AI: Ai;              // <- adicionar
  }
}
```

Uso na rota: `import { env } from 'cloudflare:workers'` e então `env.AI.run(...)`.

### Secrets (se optar por serviço externo em vez de Workers AI)

```powershell
npx wrangler secret put NOME_DO_SECRET --name caju-os
```

Nunca use `NEXT_PUBLIC_*` para credenciais: são embutidas no bundle do cliente e
ficam públicas.

---

## O que construir

1. **Rota** `app/api/rat/extract/route.ts` (POST, autenticada)
   - recebe o arquivo da RAT (`multipart/form-data`)
   - imagem → manda direto ao modelo de visão
   - PDF → precisa de estratégia (ver "Questões em aberto")
   - devolve JSON:
     ```json
     {
       "identifiedProblem": "...",
       "testsPerformed": "...",
       "partToReplace": "...",
       "confidence": "alta | media | baixa"
     }
     ```
   - nunca lançar erro fatal: se não conseguir extrair, devolver campos vazios

2. **Cliente**: ao selecionar um arquivo cujo nome/tipo indique RAT, chamar a
   rota e **pré-preencher** os campos, sem sobrescrever texto já digitado pelo
   usuário. Sinalizar visualmente que veio da RAT e que precisa de conferência.

3. **Não bloquear o fluxo**: extração é conveniência. Falha, lentidão ou
   resultado ruim não podem impedir o técnico de preencher à mão e salvar.

---

## Restrições

- Runtime Workers: sem `fs`, sem libs nativas, sem `pdf-parse`/`sharp`
- Bundle já tem ~1,7 MB; evitar dependências grandes no cliente
- Português do Brasil na interface e nas mensagens
- Fotos de RAT são tiradas em campo: tortas, com sombra, iluminação ruim
- Preservar o formato de texto do Jira descrito acima

---

## Validação antes de entregar

```powershell
npx tsc --noEmit     # precisa ficar limpo (hoje está)
npm test             # 3 testes, todos passando
npm run build
npm run deploy
```

---

## Questões em aberto (decidir na implementação)

1. **PDF**: Workers AI recebe imagem, não PDF. Converter no cliente (render em
   canvas) e enviar como imagem? Ou aceitar só imagem numa primeira versão?
2. **Disparo**: automático ao anexar, ou botão explícito "Ler RAT"? Automático
   gasta cota em todo anexo, inclusive nos que não são RAT.
3. **Identificar que é RAT**: hoje `components/n1-ticket-actions.tsx` tem um
   campo separado de upload com `kind: 'rat'`, mas em `jira-ticket-details.tsx`
   todos os anexos entram juntos, sem distinção de tipo.
4. **Sobrescrita**: se o campo já tiver texto, preencher mesmo assim, ignorar,
   ou perguntar?
5. **Cota**: quantas RATs por dia? Se ultrapassar o gratuito do Workers AI, qual
   o comportamento esperado — degradar silenciosamente?


---

# Implementação final

- Rota: `app/api/rat/extract/route.ts` (POST, autenticada por `requireApiUser`)
- Modelo: `@cf/meta/llama-3.2-11b-vision-instruct` via binding `AI` (Workers AI)
- Formato de entrada correto: `{ prompt, image: number[] }` no topo — **não**
  `messages` com `content:[{type:'image'}]`, que este modelo não aceita.
- Binding declarado em **dois** lugares, ambos necessários:
  `vite.config.ts` (dev) e `scripts/patch-wrangler.mjs` (deploy).
- Gatilho: botão **"Ler RAT e preencher"** na seção Resumo técnico de
  `components/jira-ticket-details.tsx`. Explícito de propósito: evita gastar
  cota em todo anexo e resolve a ambiguidade de qual arquivo é a RAT.
- Merge: nunca sobrescreve campo já digitado pelo técnico.
- Falha nunca bloqueia: qualquer erro devolve 200 com campos vazios e um `info`.
- PDF ainda não é lido (exigiria rasterizar, sem caminho barato no runtime de
  Workers). Responde com `info` explicando, não com erro.

## Verificado

Binding `AI` presente no `wrangler.json` publicado, junto de D1, entry point e
cron; rota devolve 401 sem token; `tsc` limpo; app servindo normalmente.

**Não verificado:** a extração de ponta a ponta com uma imagem real — o teste
automatizado via navegador não completou. Precisa de um teste manual com uma
foto de RAT de verdade.
