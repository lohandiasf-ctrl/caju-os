# WhatsApp Cloud API

## Webhook do Caju OS

- URL de callback: `https://operacoes.cajutech.net/api/whatsapp/webhook`
- Campos a assinar na Meta: `messages`
- O endpoint valida `x-hub-signature-256` com `META_APP_SECRET` e guarda
  mensagens/status no D1. Não registra a carga bruta em logs.

## Secrets do Worker

Cadastre no Worker `caju-os` (Cloudflare → Settings → Variables and Secrets):

- `WHATSAPP_VERIFY_TOKEN`: frase aleatória longa, usada também no formulário
  da Meta como **Verificar token**.
- `META_APP_SECRET`: App Secret em Meta for Developers → App settings → Basic.
- `WHATSAPP_ACCESS_TOKEN`: token permanente da Cloud API (para envio; ainda
  não usado por esta primeira etapa de recebimento).
- `WHATSAPP_PHONE_NUMBER_ID`: identificador do número Cloud API.

Após os dois primeiros secrets existirem, cole a URL e o mesmo verify token no
formulário da Meta e clique em **Verificar e salvar**. Em Webhook fields,
assine `messages`.
