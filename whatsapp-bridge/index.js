// Non-official WhatsApp bridge for Caju OS, built on Baileys (whatsapp-web
// protocol, not Meta's Cloud API). Scan the QR code once with the same phone
// that already has WhatsApp — this behaves like adding a Linked Device, so
// the regular phone app keeps working. See README.md before running this in
// production: this violates WhatsApp's Terms of Service and risks a ban.

import baileys from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import http from 'node:http';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

const CAJU_WEBHOOK_URL = process.env.CAJU_WEBHOOK_URL; // e.g. https://operacoes.cajutech.net/api/whatsapp/bridge-webhook
const BRIDGE_SECRET = process.env.WHATSAPP_BRIDGE_SECRET;
const PORT = Number(process.env.PORT || 3300);

if (!CAJU_WEBHOOK_URL || !BRIDGE_SECRET) {
  console.error('Faltam variáveis de ambiente: CAJU_WEBHOOK_URL e WHATSAPP_BRIDGE_SECRET são obrigatórias.');
  process.exit(1);
}

let sock;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('Escaneie este QR code no WhatsApp do celular (Aparelhos conectados > Conectar aparelho):');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log('Conexão fechada.', loggedOut ? 'Sessão encerrada — apague ./auth e escaneie o QR de novo.' : 'Reconectando...');
      if (!loggedOut) start();
    } else if (connection === 'open') {
      console.log('Bridge do WhatsApp conectado.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      if (!message.message || message.key.fromMe) continue;
      const contactPhone = message.key.remoteJid?.replace(/@s\.whatsapp\.net$/, '');
      if (!contactPhone) continue;
      const text = message.message.conversation
        || message.message.extendedTextMessage?.text
        || message.message.imageMessage?.caption
        || null;
      await forwardToCaju({
        wamid: message.key.id,
        contactPhone,
        contactName: message.pushName || null,
        direction: 'incoming',
        messageType: text ? 'text' : 'unknown',
        body: text,
        occurredAt: message.messageTimestamp ? new Date(Number(message.messageTimestamp) * 1000).toISOString() : new Date().toISOString(),
      });
    }
  });
}

async function forwardToCaju(payload) {
  try {
    const response = await fetch(CAJU_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET },
      body: JSON.stringify(payload),
    });
    if (!response.ok) console.error('Caju OS recusou a mensagem encaminhada:', response.status, await response.text().catch(() => ''));
  } catch (error) {
    console.error('Falha ao encaminhar mensagem para o Caju OS:', error);
  }
}

// Minimal HTTP API so the Caju OS backend can send outbound messages through
// this same phone number. Guarded by the same shared secret as the webhook.
http.createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/send') {
    response.writeHead(404).end();
    return;
  }
  if (request.headers['x-bridge-secret'] !== BRIDGE_SECRET) {
    response.writeHead(403).end(JSON.stringify({ error: 'Segredo inválido.' }));
    return;
  }
  let raw = '';
  for await (const chunk of request) raw += chunk;
  let body;
  try { body = JSON.parse(raw); } catch { response.writeHead(400).end(JSON.stringify({ error: 'JSON inválido.' })); return; }
  const to = typeof body?.to === 'string' ? body.to.replace(/\D/g, '') : '';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!to || !text) { response.writeHead(400).end(JSON.stringify({ error: 'to e text são obrigatórios.' })); return; }
  if (!sock) { response.writeHead(503).end(JSON.stringify({ error: 'Bridge ainda não conectado ao WhatsApp.' })); return; }
  try {
    const sent = await sock.sendMessage(`${to}@s.whatsapp.net`, { text });
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ wamid: sent.key.id }));
  } catch (error) {
    console.error('Falha ao enviar mensagem:', error);
    response.writeHead(502).end(JSON.stringify({ error: 'Falha ao enviar pelo WhatsApp.' }));
  }
}).listen(PORT, () => console.log(`Bridge HTTP ouvindo na porta ${PORT}`));

start();
