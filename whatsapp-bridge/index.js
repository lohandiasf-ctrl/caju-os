// Non-official WhatsApp bridge for Caju OS, built on Baileys (whatsapp-web
// protocol, not Meta's Cloud API). Scan the QR code once with the same phone
// that already has WhatsApp — this behaves like adding a Linked Device, so
// the regular phone app keeps working. See README.md before running this in
// production: this violates WhatsApp's Terms of Service and risks a ban.

import makeWASocket, {
  useMultiFileAuthState, DisconnectReason, downloadMediaMessage, normalizeMessageContent, getContentType,
  USyncQuery, USyncUser,
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';

const CAJU_WEBHOOK_URL = process.env.CAJU_WEBHOOK_URL; // e.g. https://operacoes.cajutech.net/api/whatsapp/bridge-webhook
const BRIDGE_SECRET = process.env.WHATSAPP_BRIDGE_SECRET;
const PORT = Number(process.env.PORT || 3300);
// Lives on the same Fly volume as the session, so media survives redeploys.
const MEDIA_DIR = './auth/media';
const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const TYPING_TTL_MS = 12_000;

if (!CAJU_WEBHOOK_URL || !BRIDGE_SECRET) {
  console.error('Faltam variáveis de ambiente: CAJU_WEBHOOK_URL e WHATSAPP_BRIDGE_SECRET são obrigatórias.');
  process.exit(1);
}

await mkdir(MEDIA_DIR, { recursive: true });

const silentLogger = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return silentLogger; } };
const presence = new Map(); // jid -> { state, at }
const presenceSubscribedAt = new Map(); // jid -> ms
const photoCache = new Map(); // jid -> { url, at }
const groupCache = new Map(); // group jid -> { subject, at }
const NAMES_FILE = './auth/names.json';
// Display names learned from messages and contact events, keyed by every JID
// form a person shows up under (phone, "@lid"). Used to turn "@2094791..."
// mentions into "@Name". Persisted on the volume so a redeploy keeps them.
const names = new Map(Object.entries(JSON.parse(await readFile(NAMES_FILE, 'utf8').catch(() => '{}'))));
let namesSaveTimer;
const PHONES_FILE = './auth/phones.json';
// "@lid" (linked ID) -> phone JID, learned from the sender_pn WhatsApp sends
// with each message. Creating a group needs the phone JID, not the "@lid".
const phones = new Map(Object.entries(JSON.parse(await readFile(PHONES_FILE, 'utf8').catch(() => '{}'))));
let phonesSaveTimer;
// What the Caju OS inbox shows when the WhatsApp session is down.
let connectionState = { status: 'connecting', since: new Date().toISOString() };
// Latest pairing QR, so a manager can scan it from the Caju OS inbox instead
// of the Fly logs. Cleared as soon as the session opens or closes.
let currentQr = null;
let sock;

// Each group-list sync is one heavy query; reconnects only resync once an hour
// (renames and new groups still arrive right away through events).
const GROUP_SYNC_MIN_INTERVAL_MS = 60 * 60 * 1000;
let lastGroupSyncAt = 0;

// Profile photo lookups are queries too; cap them so opening a big group
// doesn't flood WhatsApp. Over the cap the caller is told to retry later.
const PHOTO_LOOKUPS_PER_MINUTE = 10;
let photoWindow = { startedAt: 0, count: 0 };

// Watchdog: Baileys can report "open" while WhatsApp stops answering queries
// (keep alive times out, nothing arrives). Ping on our own and force a
// reconnect after repeated failures, instead of waiting for a manual restart.
const WATCHDOG_INTERVAL_MS = 90_000;
const WATCHDOG_TIMEOUT_MS = 20_000;
const WATCHDOG_MAX_FAILURES = 3;
const WATCHDOG_COOLDOWN_MS = 10 * 60 * 1000;
let watchdogFailures = 0;
let lastForcedReconnectAt = 0;

function setConnectionState(status) {
  if (connectionState.status !== status) connectionState = { status, since: new Date().toISOString() };
}

setInterval(async () => {
  if (!sock || connectionState.status !== 'open') { watchdogFailures = 0; return; }
  try {
    await sock.query({ tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:p' }, content: [{ tag: 'ping', attrs: {} }] }, WATCHDOG_TIMEOUT_MS);
    watchdogFailures = 0;
  } catch (error) {
    watchdogFailures += 1;
    console.error(`Watchdog: WhatsApp não respondeu ao ping (${watchdogFailures}/${WATCHDOG_MAX_FAILURES}):`, error?.message ?? error);
    if (watchdogFailures < WATCHDOG_MAX_FAILURES || Date.now() - lastForcedReconnectAt < WATCHDOG_COOLDOWN_MS) return;
    watchdogFailures = 0;
    lastForcedReconnectAt = Date.now();
    console.error('Watchdog: forçando reconexão.');
    sock.end(new Error('Watchdog: WhatsApp parou de responder'));
  }
}, WATCHDOG_INTERVAL_MS);

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      currentQr = qr;
      setConnectionState('qr');
      console.log('Escaneie este QR code no WhatsApp do celular (Aparelhos conectados > Conectar aparelho):');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'close') {
      currentQr = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      setConnectionState(loggedOut ? 'logged_out' : 'connecting');
      console.log('Conexão fechada.', loggedOut ? 'Sessão encerrada — apague ./auth e escaneie o QR de novo.' : 'Reconectando...');
      if (!loggedOut) start();
    } else if (connection === 'open') {
      currentQr = null;
      setConnectionState('open');
      console.log('Bridge do WhatsApp conectado.');
      if (Date.now() - lastGroupSyncAt > GROUP_SYNC_MIN_INTERVAL_MS) {
        syncAllGroups().catch((error) => console.error('Falha ao sincronizar grupos:', error?.message ?? error));
      }
      // First connection of a number: pull the address book so contacts the
      // inbox only knows by "@lid" get their phone number.
      if (!phones.size) resyncContacts().catch(() => {});
    }
  });

  // Renamed groups and groups the number joins reach the inbox right away,
  // instead of waiting for the next message in them.
  sock.ev.on('groups.update', (updates) => {
    const changed = updates.filter((group) => group.id && typeof group.subject === 'string');
    for (const group of changed) groupCache.set(group.id, { subject: group.subject, at: Date.now() });
    if (changed.length) void forwardGroups(changed);
  });
  sock.ev.on('groups.upsert', (groups) => {
    for (const group of groups) if (group.id && group.subject) groupCache.set(group.id, { subject: group.subject, at: Date.now() });
    void forwardGroups(groups);
  });

  sock.ev.on('contacts.upsert', (contacts) => contacts.forEach(learnContact));
  sock.ev.on('contacts.update', (contacts) => contacts.forEach(learnContact));
  // WhatsApp tells us the phone behind a "@lid" chat when the contact shares it.
  sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => learnPhone(lid, jid));

  sock.ev.on('presence.update', ({ id, presences }) => {
    for (const value of Object.values(presences ?? {})) {
      if (value?.lastKnownPresence) presence.set(id, { state: value.lastKnownPresence, at: Date.now() });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'append' also carries messages sent from the phone while this device
    // was catching up; bound it to recent ones so a reconnect doesn't replay
    // a whole history into the inbox.
    if (type !== 'notify' && type !== 'append') return;
    for (const message of messages) {
      try { await handleMessage(message, type); } catch (error) { console.error('Falha ao processar mensagem:', error); }
    }
  });
}

async function handleMessage(message, type) {
  const jid = message.key.remoteJid;
  if (!jid || !message.message || !isSupportedChat(jid)) return;
  const occurredAtMs = message.messageTimestamp ? Number(message.messageTimestamp) * 1000 : Date.now();
  if (type === 'append' && Date.now() - occurredAtMs > 24 * 60 * 60 * 1000) return;

  const content = normalizeMessageContent(message.message);
  // Deletes and edits arrive as protocol messages pointing at the original.
  const protocol = content?.protocolMessage;
  if (protocol?.key?.id) {
    if (protocol.type === 0 || protocol.type === 'REVOKE') {
      await forwardToCaju({ type: 'revoke', contactPhone: jid, wamid: protocol.key.id });
    } else if (protocol.type === 14 || protocol.type === 'MESSAGE_EDIT') {
      const edited = parseContent(normalizeMessageContent(protocol.editedMessage));
      if (edited?.body) await forwardToCaju({ type: 'edit', contactPhone: jid, wamid: protocol.key.id, body: resolveMentions(edited.body, edited.contextInfo) });
    }
    return;
  }
  const parsed = parseContent(content);
  if (!parsed) return;

  const wamid = message.key.id;
  const fromMe = Boolean(message.key.fromMe);
  if (!fromMe) {
    learnName(message.pushName, message.key.participant, message.key.participantPn, message.key.participantLid, isGroup(jid) ? null : jid);
    learnPhone(message.key.participantLid ?? message.key.participant, message.key.participantPn);
    if (!isGroup(jid)) learnPhone(jid, message.key.senderPn);
  }
  if (parsed.body) parsed.body = resolveMentions(parsed.body, parsed.contextInfo);
  let mediaId = null;
  if (parsed.media) {
    mediaId = safeId(wamid);
    if (!await mediaExists(mediaId)) {
      const size = Number(parsed.media.fileLength ?? 0);
      if (size && size > MAX_MEDIA_BYTES) {
        mediaId = null;
      } else {
        try {
          const buffer = await downloadMediaMessage({ ...message, message: content }, 'buffer', {}, { logger: silentLogger, reuploadRequest: sock.updateMediaMessage });
          await saveMedia(mediaId, buffer, { mimetype: parsed.media.mimetype ?? 'application/octet-stream', fileName: parsed.media.fileName ?? null });
        } catch (error) {
          console.error('Falha ao baixar mídia:', error?.message ?? error);
          mediaId = null;
        }
      }
    }
  }

  await forwardToCaju({
    wamid,
    // WhatsApp sometimes addresses a contact by a "@lid" (linked ID) instead
    // of "@s.whatsapp.net" — keep the full JID so replies target it.
    contactPhone: jid,
    // On our own messages pushName is our name, not the contact's. In a group
    // it names the participant who wrote, so the conversation gets the group
    // subject instead.
    contactName: fromMe ? null : (message.pushName || nameFor(message.key.participantPn) || nameFor(message.key.participant) || null),
    conversationName: isGroup(jid) ? await groupSubject(jid) : undefined,
    // Who wrote it inside a group, so the inbox can show their photo. The
    // phone-number JID resolves profile photos more reliably than "@lid".
    senderJid: isGroup(jid) && !fromMe ? (message.key.participantPn || message.key.participant || null) : undefined,
    direction: fromMe ? 'outgoing' : 'incoming',
    messageType: parsed.type,
    body: parsed.body,
    mediaId,
    ...quotedFrom(parsed.contextInfo),
    occurredAt: new Date(occurredAtMs).toISOString(),
  });
}

// The message being replied to, as a short preview (WhatsApp sends a copy).
function quotedFrom(contextInfo) {
  if (!contextInfo?.stanzaId || !contextInfo.quotedMessage) return {};
  const quoted = parseContent(normalizeMessageContent(contextInfo.quotedMessage));
  const labels = { image: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', document: '📄 Documento', sticker: 'Figurinha', location: '📍 Localização', contact: '👤 Contato' };
  const body = quoted?.body ? resolveMentions(quoted.body, quoted.contextInfo) : null;
  const preview = quoted?.type === 'text' ? body : [labels[quoted?.type], quoted?.type === 'document' ? null : body].filter(Boolean).join(' · ');
  return {
    quotedWamid: contextInfo.stanzaId,
    quotedBody: (preview || 'Mensagem').slice(0, 500),
    quotedName: nameFor(contextInfo.participant) || null,
  };
}

function isGroup(jid) { return jid.endsWith('@g.us'); }

function isSupportedChat(jid) {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid') || isGroup(jid);
}

async function syncAllGroups() {
  const all = Object.values(await sock.groupFetchAllParticipating());
  for (const group of all) {
    groupCache.set(group.id, { subject: group.subject || null, at: Date.now() });
    // Participants come with both IDs, which is how most phone numbers are learned.
    (group.participants ?? []).forEach(learnContact);
  }
  await forwardGroups(all);
  lastGroupSyncAt = Date.now();
  console.log(`Grupos sincronizados: ${all.length}.`);
}

async function forwardGroups(groups) {
  const items = groups.filter((group) => group.id && isGroup(group.id)).map((group) => ({
    jid: group.id,
    subject: group.subject ?? null,
    createdAt: group.creation ? new Date(Number(group.creation) * 1000).toISOString() : null,
  }));
  for (let index = 0; index < items.length; index += 100) {
    await forwardToCaju({ type: 'groups', groups: items.slice(index, index + 100) });
  }
}

function jidUser(jid) { return String(jid ?? '').split('@')[0].split(':')[0]; }

function learnName(name, ...jids) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) return;
  let changed = false;
  for (const jid of jids) {
    const key = jidUser(jid);
    if (key && names.get(key) !== clean) { names.set(key, clean); changed = true; }
  }
  if (!changed) return;
  clearTimeout(namesSaveTimer);
  namesSaveTimer = setTimeout(() => {
    writeFile(NAMES_FILE, JSON.stringify(Object.fromEntries(names))).catch((error) => console.error('Falha ao salvar nomes:', error?.message ?? error));
  }, 5_000);
}

function nameFor(jid) { return jid ? names.get(jidUser(jid)) ?? null : null; }

// A contact (also each group participant) carries both of its IDs.
function learnContact(contact) {
  if (!contact?.id) return;
  learnName(contact.notify || contact.name, contact.id, contact.lid, contact.jid);
  learnPhone(contact.lid ?? contact.id, contact.jid ?? (String(contact.id).endsWith('@s.whatsapp.net') ? contact.id : null));
}

function learnPhone(lid, phoneJid) {
  if (!lid || !phoneJid || !String(lid).endsWith('@lid') || !String(phoneJid).endsWith('@s.whatsapp.net')) return;
  const key = jidUser(lid);
  const value = `${jidUser(phoneJid)}@s.whatsapp.net`;
  if (!key || phones.get(key) === value) return;
  phones.set(key, value);
  clearTimeout(phonesSaveTimer);
  phonesSaveTimer = setTimeout(() => {
    writeFile(PHONES_FILE, JSON.stringify(Object.fromEntries(phones))).catch((error) => console.error('Falha ao salvar telefones:', error?.message ?? error));
  }, 5_000);
}

// A group can only be created with phone JIDs.
function phoneJidFor(jid) {
  const value = String(jid ?? '');
  if (value.endsWith('@s.whatsapp.net')) return value;
  return phones.get(jidUser(value)) ?? null;
}

// Re-reads the account's contact list from WhatsApp. Each contact arrives
// with both of its IDs, which is what fills the lid -> phone map.
async function resyncContacts() {
  const before = phones.size;
  await sock.resyncAppState(['critical_unblock_low', 'regular_high', 'regular_low', 'regular'], false);
  console.log(`Contatos sincronizados: ${phones.size - before} telefone(s) novo(s), ${phones.size} no total.`);
  return { learned: phones.size - before, total: phones.size };
}

const lidLookupAt = new Map(); // lid user -> ms of the last failed lookup
const LID_LOOKUP_RETRY_MS = 60 * 60 * 1000;

// Asks WhatsApp which phone is behind a "@lid", for contacts whose number
// never came through a message, a contact event or a group. Best effort: the
// answer may simply not carry the phone JID.
async function resolveLidPhone(lid) {
  const known = phoneJidFor(lid);
  if (known) return known;
  const key = jidUser(lid);
  if (!key || Date.now() - (lidLookupAt.get(key) ?? 0) < LID_LOOKUP_RETRY_MS) return null;
  lidLookupAt.set(key, Date.now());
  try {
    const query = new USyncQuery().withContactProtocol().withLIDProtocol();
    query.withUser(new USyncUser().withId(`${key}@lid`).withLid(`${key}@lid`));
    const result = await sock.executeUSyncQuery(query);
    for (const item of result?.list ?? []) {
      const candidates = [item.id, item.lid, item.jid].filter((value) => typeof value === 'string' && value.endsWith('@s.whatsapp.net'));
      if (candidates.length) { learnPhone(`${key}@lid`, candidates[0]); return phoneJidFor(lid); }
    }
  } catch (error) {
    console.error('Falha ao resolver telefone do contato:', error?.message ?? error);
  }
  return null;
}

// "@209479127822392" -> "@Lana Melo" for the JIDs the message mentions.
function resolveMentions(body, contextInfo) {
  const mentioned = contextInfo?.mentionedJid ?? [];
  if (!mentioned.length) return body;
  return body.replace(/@(\d{6,})/g, (match, digits) => {
    const jid = mentioned.find((item) => jidUser(item) === digits);
    const name = jid ? nameFor(jid) : null;
    return name ? `@${name}` : match;
  });
}

async function groupSubject(jid) {
  const cached = groupCache.get(jid);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.subject;
  const subject = await sock.groupMetadata(jid).then((meta) => {
    (meta?.participants ?? []).forEach(learnContact);
    return meta?.subject || null;
  }, () => cached?.subject ?? null);
  groupCache.set(jid, { subject, at: Date.now() });
  return subject;
}

function parseContent(content) {
  const type = getContentType(content);
  if (!type) return null;
  const parsed = parseContentValue(type, content[type]);
  return parsed && { ...parsed, contextInfo: content[type]?.contextInfo ?? null };
}

function parseContentValue(type, value) {
  switch (type) {
    case 'conversation': return { type: 'text', body: value };
    case 'extendedTextMessage': return { type: 'text', body: value?.text ?? null };
    case 'imageMessage': return { type: 'image', body: value?.caption || null, media: value };
    case 'videoMessage': return { type: 'video', body: value?.caption || null, media: value };
    case 'audioMessage': return { type: 'audio', body: null, media: value };
    case 'documentMessage': return { type: 'document', body: value?.caption || value?.fileName || 'Arquivo', media: value };
    case 'stickerMessage': return { type: 'sticker', body: null, media: value };
    case 'locationMessage': return { type: 'location', body: `https://maps.google.com/?q=${value?.degreesLatitude},${value?.degreesLongitude}` };
    case 'contactMessage': return { type: 'contact', body: value?.displayName ?? 'Contato' };
    default: return null; // reactions, protocol/edit/revoke messages, polls...
  }
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

function safeId(id) { return String(id).replace(/[^A-Za-z0-9_-]/g, ''); }
async function mediaExists(id) { return stat(`${MEDIA_DIR}/${id}.bin`).then(() => true, () => false); }
async function saveMedia(id, buffer, meta) {
  await writeFile(`${MEDIA_DIR}/${id}.bin`, buffer);
  await writeFile(`${MEDIA_DIR}/${id}.json`, JSON.stringify(meta));
}

function jidFor(rawTo) {
  const to = String(rawTo ?? '').trim();
  if (!to) return null;
  return to.includes('@') ? to : `${to.replace(/\D/g, '')}@s.whatsapp.net`;
}

// Browsers record voice as webm/opus; WhatsApp phones only play voice notes
// as ogg/opus, so transcode before sending.
function toOggOpus(buffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1']);
    const chunks = [];
    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg saiu com código ${code}`)));
    ffmpeg.stdin.on('error', () => {});
    ffmpeg.stdin.end(buffer);
  });
}

async function readBody(request, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Arquivo grande demais.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
}

// { url, limited }: limited means the per-minute cap was hit and nothing was
// cached, so the caller should ask again later. The open conversation's own
// header (/presence) skips the cap.
async function profilePhoto(jid, { capped = true } = {}) {
  const cached = photoCache.get(jid);
  if (cached && Date.now() - cached.at < 6 * 60 * 60 * 1000) return { url: cached.url, limited: false };
  if (capped) {
    if (Date.now() - photoWindow.startedAt > 60_000) photoWindow = { startedAt: Date.now(), count: 0 };
    if (photoWindow.count >= PHOTO_LOOKUPS_PER_MINUTE) return { url: cached?.url ?? null, limited: true };
    photoWindow.count += 1;
  }
  const url = await sock.profilePictureUrl(jid, 'image').catch(() => null);
  photoCache.set(jid, { url, at: Date.now() });
  return { url, limited: false };
}

// Clears the linked-device session (keeps media and learned names) so the
// next start shows a fresh pairing QR.
async function resetSession() {
  // Detach first: the close handler would otherwise start() a second socket
  // on the credentials being deleted below.
  try { sock?.ev.removeAllListeners('connection.update'); sock?.end(new Error('Sessão reiniciada pelo Caju OS')); } catch {}
  for (const entry of await readdir('./auth')) {
    if (entry === 'media' || entry === 'names.json') continue;
    await rm(`./auth/${entry}`, { recursive: true, force: true });
  }
  currentQr = null;
  lastGroupSyncAt = 0;
  setConnectionState('connecting');
  await start();
}

// Minimal HTTP API for the Caju OS backend. Every route is guarded by the
// same shared secret as the webhook.
http.createServer(async (request, response) => {
  try {
    if (request.headers['x-bridge-secret'] !== BRIDGE_SECRET) return json(response, 403, { error: 'Segredo inválido.' });
    const url = new URL(request.url, 'http://bridge');
    if (!sock) return json(response, 503, { error: 'Bridge ainda não conectado ao WhatsApp.' });

    if (request.method === 'POST' && url.pathname === '/send') {
      const body = JSON.parse((await readBody(request, 64 * 1024)).toString('utf8') || '{}');
      const jid = jidFor(body?.to);
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!jid || !text) return json(response, 400, { error: 'to e text são obrigatórios.' });
      const sent = await sock.sendMessage(jid, { text });
      return json(response, 200, { wamid: sent.key.id });
    }

    if (request.method === 'POST' && url.pathname === '/send-media') {
      const jid = jidFor(url.searchParams.get('to'));
      if (!jid) return json(response, 400, { error: 'to é obrigatório.' });
      const mimetype = String(request.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
      const fileName = url.searchParams.get('fileName') || 'arquivo';
      const caption = url.searchParams.get('caption') || undefined;
      const voice = url.searchParams.get('voice') === '1';
      const buffer = await readBody(request, MAX_MEDIA_BYTES);
      if (!buffer.length) return json(response, 400, { error: 'Arquivo vazio.' });

      let message; let type; let storedBuffer = buffer; let storedMime = mimetype;
      if (voice) {
        storedBuffer = await toOggOpus(buffer);
        storedMime = 'audio/ogg; codecs=opus';
        message = { audio: storedBuffer, mimetype: storedMime, ptt: true }; type = 'audio';
      } else if (mimetype.startsWith('image/') && mimetype !== 'image/svg+xml') {
        message = { image: buffer, mimetype, caption }; type = 'image';
      } else if (mimetype.startsWith('video/')) {
        message = { video: buffer, mimetype, caption }; type = 'video';
      } else if (mimetype.startsWith('audio/')) {
        message = { audio: buffer, mimetype }; type = 'audio';
      } else {
        message = { document: buffer, mimetype, fileName, caption }; type = 'document';
      }
      const sent = await sock.sendMessage(jid, message);
      const mediaId = safeId(sent.key.id);
      await saveMedia(mediaId, storedBuffer, { mimetype: storedMime, fileName: type === 'document' ? fileName : null });
      return json(response, 200, { wamid: sent.key.id, mediaId, messageType: type });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
      const id = safeId(url.pathname.slice('/media/'.length));
      if (!id || !await mediaExists(id)) return json(response, 404, { error: 'Mídia não encontrada.' });
      const meta = JSON.parse(await readFile(`${MEDIA_DIR}/${id}.json`, 'utf8').catch(() => '{}'));
      const info = await stat(`${MEDIA_DIR}/${id}.bin`);
      response.writeHead(200, {
        'Content-Type': meta.mimetype || 'application/octet-stream',
        'Content-Length': info.size,
        ...(meta.fileName ? { 'X-File-Name': encodeURIComponent(meta.fileName) } : {}),
      });
      createReadStream(`${MEDIA_DIR}/${id}.bin`).pipe(response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/presence') {
      const jid = jidFor(url.searchParams.get('jid'));
      if (!jid) return json(response, 400, { error: 'jid é obrigatório.' });
      // WhatsApp only pushes a contact's presence after we subscribe to it,
      // and the subscription lapses, so renew it every few minutes.
      if (Date.now() - (presenceSubscribedAt.get(jid) ?? 0) > 4 * 60 * 1000) {
        presenceSubscribedAt.set(jid, Date.now());
        await sock.presenceSubscribe(jid).catch(() => {});
      }
      const current = presence.get(jid);
      let state = current?.state ?? null;
      if ((state === 'composing' || state === 'recording') && Date.now() - current.at > TYPING_TTL_MS) state = 'available';
      return json(response, 200, { state, photoUrl: (await profilePhoto(jid, { capped: false })).url });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return json(response, 200, connectionState);
    }

    // Pairing QR as an image, only while the bridge is waiting to be linked.
    if (request.method === 'GET' && url.pathname === '/qr') {
      const qr = connectionState.status === 'qr' && currentQr ? await QRCode.toDataURL(currentQr, { margin: 1, width: 320 }) : null;
      return json(response, 200, { ...connectionState, qr });
    }

    if (request.method === 'POST' && url.pathname === '/resync-contacts') {
      return json(response, 200, await resyncContacts());
    }

    // Which of these JIDs the bridge can already turn into a phone number.
    if (request.method === 'GET' && url.pathname === '/phones') {
      const wanted = (url.searchParams.get('jids') ?? '').split(',').map((jid) => jid.trim()).filter(Boolean).slice(0, 300);
      const known = wanted.map((jid) => [jid, phoneJidFor(jid)]);
      // Ask WhatsApp about a few unknown ones per call, so a big list doesn't
      // turn into a burst of queries.
      const pending = known.filter(([, phone]) => !phone).slice(0, 10);
      const resolved = new Map(await Promise.all(pending.map(async ([jid]) => [jid, await resolveLidPhone(jid)])));
      return json(response, 200, { phones: Object.fromEntries(known.map(([jid, phone]) => [jid, phone ?? resolved.get(jid) ?? null])) });
    }

    // Creates a group with the given participants (phone JIDs) and pushes it
    // to Caju OS right away, so it shows in the inbox with its FSAs linked.
    if (request.method === 'POST' && url.pathname === '/groups') {
      const body = JSON.parse((await readBody(request, 16 * 1024)).toString('utf8') || '{}');
      const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 100) : '';
      const participants = Array.isArray(body?.participants) ? [...new Set(body.participants.map(jidFor).filter(Boolean))] : [];
      if (!subject || !participants.length) return json(response, 400, { error: 'Nome do grupo e participantes são obrigatórios.' });
      const resolved = await Promise.all(participants.map(async (jid) => ({ jid, phone: phoneJidFor(jid) ?? await resolveLidPhone(jid) })));
      const unknown = resolved.filter((item) => !item.phone).map((item) => item.jid);
      if (unknown.length) return json(response, 400, { error: 'Não sei o telefone destes contatos; digite o número com DDD.', unknown });
      const group = await sock.groupCreate(subject, resolved.map((item) => item.phone))
        .catch((error) => { throw Object.assign(new Error(`O WhatsApp recusou criar o grupo (${error?.data ?? error?.message ?? 'erro'}).`), { status: 502, expose: true }); });
      groupCache.set(group.id, { subject: group.subject || subject, at: Date.now() });
      await forwardGroups([{ ...group, subject: group.subject || subject, creation: group.creation ?? Math.floor(Date.now() / 1000) }]);
      const added = new Set((group.participants ?? []).map((participant) => jidUser(participant.id)));
      return json(response, 200, { jid: group.id, subject: group.subject || subject, missing: participants.filter((jid) => !added.has(jidUser(jid))) });
    }

    // Start over with a new QR. Refused while connected so a click can't
    // unlink a working session.
    if (request.method === 'POST' && url.pathname === '/reset-session') {
      if (connectionState.status === 'open') return json(response, 409, { error: 'O WhatsApp está conectado. Desconecte o aparelho no celular antes de gerar um novo QR code.' });
      await resetSession();
      return json(response, 200, { ok: true });
    }

    // Profile photo only. Unlike /presence it doesn't subscribe to the JID's
    // presence, so looking up every group participant stays cheap.
    if (request.method === 'GET' && url.pathname === '/photo') {
      const jid = jidFor(url.searchParams.get('jid'));
      if (!jid) return json(response, 400, { error: 'jid é obrigatório.' });
      const photo = await profilePhoto(jid);
      return json(response, 200, { photoUrl: photo.url, limited: photo.limited });
    }

    if (request.method === 'POST' && url.pathname === '/typing') {
      const body = JSON.parse((await readBody(request, 4096)).toString('utf8') || '{}');
      const jid = jidFor(body?.to);
      const state = ['composing', 'recording', 'paused'].includes(body?.state) ? body.state : 'paused';
      if (!jid) return json(response, 400, { error: 'to é obrigatório.' });
      await sock.sendPresenceUpdate(state, jid).catch(() => {});
      return json(response, 200, { ok: true });
    }

    return json(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error('Falha na API do bridge:', error?.message ?? error);
    if (!response.headersSent) {
      const message = error?.status === 413 ? 'Arquivo grande demais.' : error?.expose ? error.message : 'Falha ao falar com o WhatsApp.';
      json(response, error?.status ?? 502, { error: message });
    }
  }
}).listen(PORT, () => console.log(`Bridge HTTP ouvindo na porta ${PORT}`));

start();
