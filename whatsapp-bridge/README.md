# whatsapp-bridge

Non-official WhatsApp bridge for Caju OS, built on [Baileys](https://github.com/WhiskeySockets/Baileys)
(the whatsapp-web protocol, not Meta's Cloud API). Use this only if you accept
the trade-off below — the officially supported path is the Meta Cloud API
integration already in `app/api/whatsapp/`.

## Why this exists

The Meta Cloud API requires a phone number to either fully migrate away from
the regular WhatsApp/WhatsApp Business app, or go through the "coexistence"
Embedded Signup flow (which needs the WhatsApp product properly attached to a
Meta app — blocked for this account as of 2026-09-15). This bridge is the
workaround: it connects as a *linked device*, exactly like WhatsApp Web, so
the phone app keeps working normally alongside it.

## Trade-off — read before running in production

- **Violates WhatsApp's Terms of Service.** This is not sanctioned by Meta.
- **Ban risk.** High message volume or automated-looking patterns can get the
  number banned, with no appeal path.
- **Less stable than the official API.** Baileys reverse-engineers a protocol
  Meta doesn't publish; it can break when WhatsApp changes something,
  requiring a library update.
- Use it for pilots or low volume. If the business depends on WhatsApp
  reliability, migrate to the official Cloud API instead.

## What it needs to run

This is a **separate, always-on Node.js process** — it cannot run on
Cloudflare Workers (no persistent WebSocket, no filesystem for session
storage). Host it on something that stays running: a small VPS, Railway,
Render, Fly.io, etc. It keeps the WhatsApp session in `./auth/` on disk —
back that up, losing it means re-scanning the QR code.

## Setup

```bash
cd whatsapp-bridge
npm install
```

Environment variables (put them in `.env` or your host's secret manager):

```bash
CAJU_WEBHOOK_URL=https://operacoes.cajutech.net/api/whatsapp/bridge-webhook
WHATSAPP_BRIDGE_SECRET=<same random secret as the Caju OS Worker's WHATSAPP_BRIDGE_SECRET>
PORT=3300
```

```bash
npm start
```

On first run it prints a QR code in the terminal. Open WhatsApp on the phone
that owns the number → **Aparelhos conectados** → **Conectar aparelho** →
scan it. After that it reconnects automatically using the saved session.

## Wiring it to Caju OS

In the Cloudflare Worker (`caju-os`), set:

```bash
npx wrangler secret put WHATSAPP_BRIDGE_URL --name caju-os
# e.g. https://your-bridge-host.example.com
npx wrangler secret put WHATSAPP_BRIDGE_SECRET --name caju-os
# same value as this service's WHATSAPP_BRIDGE_SECRET
```

Once both are set, `app/api/whatsapp/conversations/[phone]/send/route.ts`
sends through this bridge instead of the Meta Graph API automatically — no
code change needed on the Caju OS side. Incoming messages arrive at
`app/api/whatsapp/bridge-webhook/route.ts`, which writes to the same
`whatsapp_messages` / `whatsapp_conversations` tables the Meta integration
uses, so the WhatsApp inbox screen works the same either way.

The bridge's own HTTP port (`/send`) needs to be reachable from the Cloudflare
Worker over the public internet (or a tunnel) — there's no shared private
network between a Worker and an arbitrary host.
