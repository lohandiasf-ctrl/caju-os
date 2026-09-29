// caju-openwa-adapter: fala com o Caju OS exatamente como a ponte antiga
// (caju-os-web/whatsapp-bridge) falava, mas por dentro usa o OpenWA.
//
//   Caju OS  ──x-bridge-secret──▶  adapter  ──X-API-Key──▶  OpenWA (rede privada)
//   Caju OS  ◀──/bridge-webhook──  adapter  ◀──webhook HMAC──  OpenWA
//
// Por isso o Caju OS não muda: só apontam WHATSAPP_BRIDGE_URL/SECRET para cá.

import http from 'node:http';
import crypto from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import {
  bridgeGroups, bridgeMessage, bridgeMessageEvent, connectionStatus, contactPhoneOf, isGroup, itemsOf, jidFor, mediaOf, safeId, sendKind,
} from './mapping.js';

const env = (name, fallback) => process.env[name] ?? fallback;
const PORT = Number(env('PORT', '8080'));
const OPENWA_URL = env('OPENWA_URL', 'http://caju-openwa.internal:2785').replace(/\/$/, '');
const OPENWA_KEY = env('OPENWA_KEY');
const SESSION = env('SESSION_ID', 'caju');
const BRIDGE_SECRET = env('WHATSAPP_BRIDGE_SECRET');
const CAJU_WEBHOOK_URL = env('CAJU_WEBHOOK_URL');
const HOOK_SECRET = env('OPENWA_HOOK_SECRET');
const SELF_URL = env('SELF_URL', 'http://caju-openwa-adapter.internal:8080');
const DATA_DIR = env('DATA_DIR', '/data');
const MEDIA_DIR = `${DATA_DIR}/media`;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
if (!OPENWA_KEY || !BRIDGE_SECRET || !CAJU_WEBHOOK_URL || !HOOK_SECRET) {
  console.error('Faltam variáveis: OPENWA_KEY, WHATSAPP_BRIDGE_SECRET, CAJU_WEBHOOK_URL e OPENWA_HOOK_SECRET.');
  process.exit(1);
}
await mkdir(MEDIA_DIR, { recursive: true });

// ─── Chamadas ao OpenWA ────────────────────────────────
async function openwa(path, { method = 'GET', json, raw } = {}) {
  const response = await fetch(`${OPENWA_URL}/api/${path}`, {
    method,
    headers: { 'X-API-Key': OPENWA_KEY, ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (raw) return response;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(payload?.message ?? payload?.error ?? `OpenWA HTTP ${response.status}`), { status: response.status, expose: true });
  return payload?.data !== undefined && payload?.success !== undefined ? payload.data : payload;
}
// O OpenWA identifica a sessão por um UUID; o nome (SESSION_ID) só serve para achá-la.
let sessionId = null;
const session = (path = '') => `sessions/${sessionId}${path}`;

// ─── Estado ────────────────────────────────────────────
let state = { status: 'connecting', since: new Date().toISOString() };
const groupNames = new Map();
const presence = new Map();
const subscribedAt = new Map();
const photoCache = new Map();
let photoWindow = { startedAt: 0, count: 0 };
const PHOTOS_PER_MINUTE = 20;
let groupsSyncedAt = 0;

function setState(status) {
  if (status !== state.status) state = { status, since: new Date().toISOString() };
}

// ─── Caju OS ───────────────────────────────────────────
async function forward(payload) {
  try {
    const response = await fetch(CAJU_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) console.error('Caju OS recusou o envio:', response.status, (await response.text().catch(() => '')).slice(0, 200));
  } catch (error) { console.error('Falha ao enviar ao Caju OS:', error?.message ?? error); }
}

async function syncGroups() {
  if (!sessionId || Date.now() - groupsSyncedAt < 30_000) return;
  groupsSyncedAt = Date.now();
  try {
    const list = await openwa(session('/groups?limit=500'));
    const payload = bridgeGroups(list);
    for (const g of payload.groups) if (g.subject) groupNames.set(g.jid, g.subject);
    if (payload.groups.length) await forward(payload);
  } catch (error) { console.error('Não consegui listar os grupos:', error?.message ?? error); }
}

// ─── Mídia (guardada aqui, como a ponte antiga) ────────
async function saveMedia(id, buffer, meta) {
  await writeFile(`${MEDIA_DIR}/${id}.bin`, buffer);
  await writeFile(`${MEDIA_DIR}/${id}.json`, JSON.stringify(meta));
}

async function storeIncomingMedia(data, chat, wamid) {
  const media = mediaOf(data);
  if (!media) return null;
  const id = safeId(wamid);
  try {
    if (media.base64) {
      await saveMedia(id, Buffer.from(media.base64, 'base64'), { mimetype: media.mimetype, fileName: media.fileName });
      return id;
    }
    // Arquivo grande: o OpenWA não manda dentro do evento, baixa-se por aqui.
    const response = await openwa(`${session(`/messages/${encodeURIComponent(chat)}/${encodeURIComponent(wamid)}/media`)}`, { raw: true });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('json')) {
      const payload = await response.json().catch(() => null);
      const inner = payload?.data ?? payload;
      if (!inner?.data) return null;
      await saveMedia(id, Buffer.from(inner.data, 'base64'), { mimetype: inner.mimetype ?? media.mimetype, fileName: inner.filename ?? media.fileName });
    } else {
      await saveMedia(id, Buffer.from(await response.arrayBuffer()), { mimetype: type || media.mimetype, fileName: media.fileName });
    }
    return id;
  } catch (error) { console.error('Falha ao guardar a mídia:', error?.message ?? error); return null; }
}

// ─── Eventos do OpenWA ─────────────────────────────────
async function onOpenwaEvent(body) {
  const { event, data } = body ?? {};
  if (event === 'session.status') { setState(connectionStatus(data?.status)); if (data?.status === 'ready') void syncGroups(); return; }
  if (event === 'session.authenticated') { setState('open'); void syncGroups(); return; }
  if (event === 'session.qr') { setState('qr'); return; }
  if (event === 'session.disconnected') { setState('connecting'); return; }
  if (event === 'presence.update') {
    for (const p of data?.participants ?? []) presence.set(String(data.chatId), { state: p.state, at: Date.now() });
    return;
  }
  if (event === 'group.update' || event === 'group.join') { groupsSyncedAt = 0; void syncGroups(); return; }
  if (event === 'message.revoked' || event === 'message.edited') {
    const change = bridgeMessageEvent(event, data);
    if (change) await forward(change);
    return;
  }
  if (event !== 'message.received' && event !== 'message.sent') return;
  const chat = String(data?.chatId ?? (event === 'message.sent' ? data?.to : data?.from) ?? '');
  if (isGroup(chat) && !groupNames.has(chat)) await syncGroups();
  const message = bridgeMessage(event, data, { groupSubject: groupNames.get(chat) });
  if (!message) return;
  if (data.hasMedia || data.media) message.mediaId = await storeIncomingMedia(data, chat, message.wamid);
  await forward(message);
}

// ─── Ligação com o OpenWA na partida ───────────────────
async function bootstrap() {
  for (let attempt = 1; ; attempt++) {
    try {
      const found = itemsOf(await openwa('sessions')).find((item) => item?.name === SESSION);
      const created = found ?? await openwa('sessions', { method: 'POST', json: { name: SESSION } });
      sessionId = String(created?.id ?? created?.data?.id ?? '');
      if (!sessionId) throw new Error('O OpenWA não devolveu o id da sessão.');
      break;
    } catch (error) {
      console.error(`OpenWA ainda não respondeu (tentativa ${attempt}):`, error?.message ?? error);
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 2_000 * attempt)));
    }
  }
  // Webhook: registra uma vez (procura pelo endereço antes de criar).
  const hookUrl = `${SELF_URL}/openwa-webhook`;
  const hooks = itemsOf(await openwa(session('/webhooks')).catch(() => []));
  if (!hooks.some((h) => h?.url === hookUrl)) {
    await openwa(session('/webhooks'), { method: 'POST', json: {
      url: hookUrl, secret: HOOK_SECRET,
      events: ['message.received', 'message.sent', 'message.revoked', 'message.edited', 'session.status', 'session.qr', 'session.authenticated', 'session.disconnected', 'presence.update', 'group.update', 'group.join'],
    } });
  }
  const current = await openwa(session()).catch(() => null);
  setState(connectionStatus(current?.status));
  if (!['ready', 'qr_ready', 'initializing', 'authenticating'].includes(current?.status)) await openwa(session('/start'), { method: 'POST' }).catch((e) => console.error('start:', e?.message));
  console.log('Adapter pronto. Sessão:', SESSION, 'estado:', current?.status);
}

// ─── HTTP para o Caju OS ───────────────────────────────
const json = (response, status, payload) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
async function readBody(request, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Arquivo grande demais.'), { status: 413, expose: true });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const idOf = (sent) => String(sent?.messageId ?? sent?.id?._serialized ?? sent?.id ?? '');

async function profilePhoto(jid, { capped = true } = {}) {
  const cached = photoCache.get(jid);
  if (cached && Date.now() - cached.at < 6 * 3_600_000) return { url: cached.url, limited: false };
  if (capped) {
    if (Date.now() - photoWindow.startedAt > 60_000) photoWindow = { startedAt: Date.now(), count: 0 };
    if (photoWindow.count >= PHOTOS_PER_MINUTE) return { url: cached?.url ?? null, limited: true };
    photoWindow.count += 1;
  }
  const result = await openwa(session(`/contacts/${encodeURIComponent(jid)}/profile-picture`)).catch(() => null);
  const url = typeof result === 'string' ? result : (result?.url ?? result?.profilePictureUrl ?? result?.profilePicUrl ?? null);
  photoCache.set(jid, { url, at: Date.now() });
  return { url, limited: false };
}

function verifyHook(request, raw) {
  const header = String(request.headers['x-openwa-signature'] ?? '');
  const expected = `sha256=${crypto.createHmac('sha256', HOOK_SECRET).update(raw).digest('hex')}`;
  const a = Buffer.from(header); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://adapter');
    if (request.method === 'GET' && url.pathname === '/healthz') return json(response, 200, { ok: true });

    // Eventos do OpenWA (rede privada, assinados).
    if (request.method === 'POST' && url.pathname === '/openwa-webhook') {
      const raw = await readBody(request, 8 * 1024 * 1024);
      if (!verifyHook(request, raw)) return json(response, 403, { error: 'Assinatura inválida.' });
      json(response, 200, { ok: true });
      void onOpenwaEvent(JSON.parse(raw.toString('utf8') || '{}')).catch((error) => console.error('Evento falhou:', error?.message ?? error));
      return;
    }

    if (request.headers['x-bridge-secret'] !== BRIDGE_SECRET) return json(response, 403, { error: 'Segredo inválido.' });

    if (request.method === 'GET' && url.pathname === '/status') return json(response, 200, state);
    if (!sessionId) return json(response, 503, { error: 'O WhatsApp ainda está iniciando. Tente de novo em instantes.' });

    if (request.method === 'GET' && url.pathname === '/qr') {
      let qr = null;
      if (state.status === 'qr') {
        const result = await openwa(session('/qr')).catch(() => null);
        qr = result?.qrCode ?? result?.qr ?? null;
      }
      return json(response, 200, { ...state, qr });
    }

    if (request.method === 'POST' && url.pathname === '/send') {
      const body = JSON.parse((await readBody(request, 64 * 1024)).toString('utf8') || '{}');
      const to = jidFor(body?.to); const text = typeof body?.text === 'string' ? body.text.trim() : '';
      if (!to || !text) return json(response, 400, { error: 'to e text são obrigatórios.' });
      if (to.endsWith('@lid')) {
        const phone = await openwa(session(`/contacts/${encodeURIComponent(to)}/phone`)).catch(() => null);
        const digits = String(phone?.phone ?? phone ?? '').replace(/\D/g, '');
        if (!digits) return json(response, 422, { error: 'Não foi possível descobrir o número deste contato, e o WhatsApp só entrega para o número. A mensagem não foi enviada.' });
        return json(response, 200, { wamid: idOf(await openwa(session('/messages/send-text'), { method: 'POST', json: { chatId: `${digits}@c.us`, text } })) });
      }
      return json(response, 200, { wamid: idOf(await openwa(session('/messages/send-text'), { method: 'POST', json: { chatId: to, text } })) });
    }

    if (request.method === 'POST' && url.pathname === '/send-media') {
      const to = jidFor(url.searchParams.get('to'));
      if (!to) return json(response, 400, { error: 'to é obrigatório.' });
      const mimetype = String(request.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
      const fileName = url.searchParams.get('fileName') || 'arquivo';
      const caption = url.searchParams.get('caption') || undefined;
      const voice = url.searchParams.get('voice') === '1';
      const buffer = await readBody(request, MAX_MEDIA_BYTES);
      if (!buffer.length) return json(response, 400, { error: 'Arquivo vazio.' });
      const kind = sendKind(mimetype, voice);
      const sent = await openwa(session(`/messages/send-${kind}`), { method: 'POST', json: {
        chatId: to, base64: buffer.toString('base64'), mimetype, filename: fileName, ...(caption && kind !== 'audio' ? { caption } : {}), ...(kind === 'audio' && voice ? { ptt: true } : {}),
      } });
      const wamid = idOf(sent); const mediaId = safeId(wamid);
      await saveMedia(mediaId, buffer, { mimetype, fileName: kind === 'document' ? fileName : null });
      return json(response, 200, { wamid, mediaId, messageType: kind });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
      const id = safeId(url.pathname.slice('/media/'.length));
      const info = id && await stat(`${MEDIA_DIR}/${id}.bin`).catch(() => null);
      if (!info) return json(response, 404, { error: 'Mídia não encontrada.' });
      const meta = JSON.parse(await readFile(`${MEDIA_DIR}/${id}.json`, 'utf8').catch(() => '{}'));
      response.writeHead(200, { 'Content-Type': meta.mimetype || 'application/octet-stream', 'Content-Length': info.size, ...(meta.fileName ? { 'X-File-Name': encodeURIComponent(meta.fileName) } : {}) });
      createReadStream(`${MEDIA_DIR}/${id}.bin`).pipe(response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/presence') {
      const jid = jidFor(url.searchParams.get('jid'));
      if (!jid) return json(response, 400, { error: 'jid é obrigatório.' });
      if (Date.now() - (subscribedAt.get(jid) ?? 0) > 4 * 60_000) {
        subscribedAt.set(jid, Date.now());
        await openwa(session('/presence/subscribe'), { method: 'POST', json: { chatId: jid } }).catch(() => {});
      }
      const current = presence.get(jid);
      let presenceState = current?.state ?? null;
      if ((presenceState === 'composing' || presenceState === 'recording') && Date.now() - current.at > 10_000) presenceState = 'available';
      return json(response, 200, { state: presenceState, photoUrl: (await profilePhoto(jid, { capped: false })).url });
    }

    if (request.method === 'GET' && url.pathname === '/photo') {
      const jid = jidFor(url.searchParams.get('jid'));
      if (!jid) return json(response, 400, { error: 'jid é obrigatório.' });
      const photo = await profilePhoto(jid);
      return json(response, 200, { photoUrl: photo.url, limited: photo.limited });
    }

    if (request.method === 'GET' && url.pathname === '/contacts') {
      const term = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      const matches = (name, jid) => !term || `${name ?? ''} ${contactPhoneOf(jid)}`.toLowerCase().includes(term);
      const [people, groups] = await Promise.all([
        openwa(session('/contacts?limit=500')).then(itemsOf).catch(() => []),
        openwa(session('/groups?limit=500')).then(itemsOf).catch(() => []),
      ]);
      const contacts = [
        ...people.map((c) => ({ jid: String(c?.id?._serialized ?? c?.id ?? ''), name: c?.name ?? c?.pushName ?? c?.shortName ?? '', type: 'contact' })).filter((c) => c.jid && !isGroup(c.jid) && matches(c.name, c.jid)),
        ...groups.map((g) => ({ jid: String(g?.id?._serialized ?? g?.id ?? ''), name: g?.name ?? g?.subject ?? '', type: 'group' })).filter((g) => g.jid && g.name && matches(g.name, g.jid)),
      ].slice(0, 200);
      return json(response, 200, { contacts });
    }

    if (request.method === 'POST' && url.pathname === '/resync-contacts') { groupsSyncedAt = 0; void syncGroups(); return json(response, 200, { ok: true }); }

    if (request.method === 'GET' && url.pathname === '/phones') {
      const wanted = (url.searchParams.get('jids') ?? '').split(',').map((j) => j.trim()).filter(Boolean).slice(0, 300);
      const phones = {};
      for (const jid of wanted) {
        if (!jid.endsWith('@lid')) { phones[jid] = jid.endsWith('@c.us') || jid.endsWith('@s.whatsapp.net') ? `${contactPhoneOf(jid)}@s.whatsapp.net` : null; continue; }
        const result = wanted.indexOf(jid) < 10 ? await openwa(session(`/contacts/${encodeURIComponent(jid)}/phone`)).catch(() => null) : null;
        const digits = String(result?.phone ?? result ?? '').replace(/\D/g, '');
        phones[jid] = digits ? `${digits}@s.whatsapp.net` : null;
      }
      return json(response, 200, { phones });
    }

    if (request.method === 'POST' && url.pathname === '/groups') {
      const body = JSON.parse((await readBody(request, 16 * 1024)).toString('utf8') || '{}');
      const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 100) : '';
      const participants = Array.isArray(body?.participants) ? [...new Set(body.participants.map(jidFor).filter(Boolean))] : [];
      const photo = typeof body?.photo === 'string' && /^[a-z0-9-]{1,40}$/.test(body.photo) ? body.photo : null;
      if (!subject || !participants.length) return json(response, 400, { error: 'Nome do grupo e participantes são obrigatórios.' });
      const unknown = participants.filter((jid) => jid.endsWith('@lid'));
      if (unknown.length) return json(response, 400, { error: 'Não sei o telefone destes contatos; digite o número com DDD.', unknown });
      const group = await openwa(session('/groups'), { method: 'POST', json: { name: subject, participants } });
      const gid = String(group?.id?._serialized ?? group?.id ?? group?.groupId ?? '');
      let photoSet;
      if (photo && gid) {
        photoSet = await fetch(new URL(`/whatsapp-group-photos/${photo}.jpg`, CAJU_WEBHOOK_URL), { signal: AbortSignal.timeout(10_000) })
          .then(async (file) => { if (!file.ok) throw new Error(`HTTP ${file.status}`); return openwa(session(`/groups/${encodeURIComponent(gid)}/picture`), { method: 'PUT', json: { base64: Buffer.from(await file.arrayBuffer()).toString('base64'), mimetype: 'image/jpeg' } }); })
          .then(() => true, (error) => { console.error('Foto do grupo:', error?.message ?? error); return false; });
      }
      if (gid) { groupNames.set(gid, subject); groupsSyncedAt = 0; void syncGroups(); }
      return json(response, 200, { jid: gid, subject, missing: [], photoSet });
    }

    if (request.method === 'POST' && url.pathname === '/reset-session') {
      if (state.status === 'open') return json(response, 409, { error: 'O WhatsApp está conectado. Desconecte o aparelho no celular antes de gerar um novo QR code.' });
      await openwa(session('/logout'), { method: 'POST' }).catch(() => {});
      setState('connecting');
      await openwa(session('/start'), { method: 'POST' });
      return json(response, 200, { ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/typing') {
      const body = JSON.parse((await readBody(request, 4096)).toString('utf8') || '{}');
      const to = jidFor(body?.to);
      const typing = ['composing', 'recording', 'paused'].includes(body?.state) ? body.state : 'paused';
      if (!to) return json(response, 400, { error: 'to é obrigatório.' });
      await openwa(session('/chats/typing'), { method: 'POST', json: { chatId: to, state: typing } }).catch(() => {});
      return json(response, 200, { ok: true });
    }

    return json(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error('Falha no adapter:', error?.message ?? error);
    if (!response.headersSent) json(response, error?.status && error.status < 600 ? error.status : 502, { error: error?.expose ? error.message : 'Falha ao falar com o WhatsApp.' });
  }
}).listen(PORT, () => console.log(`Adapter ouvindo na porta ${PORT}`));

bootstrap().catch((error) => console.error('bootstrap falhou:', error?.message ?? error));
setInterval(async () => {
  if (!sessionId) return;
  const current = await openwa(session()).catch(() => null);
  if (current) setState(connectionStatus(current.status));
}, 30_000).unref();
