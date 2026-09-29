# WhatsApp da caixa de entrada pelo OpenWA

Substitui a `whatsapp-bridge/` (Baileys sob medida) pelo
[OpenWA](https://github.com/rmyndharis/OpenWA) (MIT, v0.23.7). O Caju OS não
muda: o `adapter/` fala com ele **igual à ponte antiga** (mesmas rotas e mesmo
webhook) e por dentro usa a API do OpenWA.

```
Caju OS ──x-bridge-secret──▶ caju-openwa-adapter ──X-API-Key──▶ caju-openwa (rede privada)
Caju OS ◀── /api/whatsapp/bridge-webhook ── adapter ◀── webhook assinado (HMAC) ── OpenWA
```

Dois apps no Fly.io (região gru):

| App | O que é | Endereço |
|---|---|---|
| `caju-openwa` | OpenWA, motor Baileys, painel desligado | só `caju-openwa.internal:2785` |
| `caju-openwa-adapter` | tradução Caju OS ⇄ OpenWA | `https://caju-openwa-adapter.fly.dev` (exige `x-bridge-secret`) |

## Como subir

```bash
# OpenWA (clone a v0.23.7 e copie fly.openwa.toml para OpenWA/fly.toml)
git clone --depth 1 --branch v0.23.7 https://github.com/rmyndharis/OpenWA.git
flyctl apps create caju-openwa && flyctl volumes create openwa_data -a caju-openwa -r gru -s 1
flyctl secrets set API_MASTER_KEY=<32+ caracteres> -a caju-openwa
cd OpenWA && flyctl deploy . -a caju-openwa -c fly.toml --remote-only

# Camada de tradução
cd adapter
flyctl apps create caju-openwa-adapter && flyctl volumes create adapter_data -a caju-openwa-adapter -r gru -s 1
flyctl secrets set OPENWA_KEY=... WHATSAPP_BRIDGE_SECRET=... OPENWA_HOOK_SECRET=... -a caju-openwa-adapter
flyctl deploy . -a caju-openwa-adapter --remote-only
```

- **`OPENWA_KEY`**: o OpenWA guarda a chave do primeiro boot no banco; trocar
  `API_MASTER_KEY` depois **não** a substitui. Crie uma chave com
  `POST /api/auth/api-keys` e revogue a de boot (`/revoke`). O OpenWA imprime a
  chave de boot no log: não cole logs em lugar nenhum.
- **`WHATSAPP_BRIDGE_SECRET`** do adapter = `WHATSAPP_BRIDGE_SECRET[_CAJU]` do Worker;
  e `WHATSAPP_BRIDGE_URL[_CAJU]` = o endereço do adapter. Cada número tem seu
  par de segredos (é assim que o Caju OS sabe de qual número veio a mensagem).
- `SSRF_ALLOWED_HOSTS` no OpenWA libera só o endereço privado do adapter.
- Conectar o número: tela WhatsApp do Caju OS mostra o QR; no celular do chip,
  Aparelhos conectados → Conectar um aparelho.

Testes da tradução: `cd adapter && node --test`.
