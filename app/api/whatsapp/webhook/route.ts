import { env } from 'cloudflare:workers';
import { handleOfferClick, recordDeliveryStatus, replyToTechnician } from '@/lib/server/dispatch';

type ObjectValue = Record<string, unknown>;

// Esta rota é deliberadamente pública: a autenticação dela é a assinatura
// HMAC da Meta, não Firebase. Não registre o corpo: ele pode conter dados de
// clientes e a Meta faz novas tentativas quando uma entrega não recebe 2xx.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!env.WHATSAPP_VERIFY_TOKEN) return Response.json({ error: 'Webhook do WhatsApp ainda não está configurado.' }, { status: 503 });
  if (
    params.get('hub.mode') !== 'subscribe' ||
    !constantTimeEqual(params.get('hub.verify_token') ?? '', env.WHATSAPP_VERIFY_TOKEN)
  ) return Response.json({ error: 'Token de verificação inválido.' }, { status: 403 });
  const challenge = params.get('hub.challenge');
  if (!challenge) return Response.json({ error: 'Desafio ausente.' }, { status: 400 });
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export async function POST(request: Request) {
  if (!env.META_APP_SECRET) return Response.json({ error: 'Webhook do WhatsApp ainda não está configurado.' }, { status: 503 });
  const raw = await request.text();
  if (!await hasValidSignature(raw, request.headers.get('x-hub-signature-256'), env.META_APP_SECRET)) {
    return Response.json({ error: 'Assinatura do webhook inválida.' }, { status: 403 });
  }

  let payload: ObjectValue;
  try { payload = JSON.parse(raw) as ObjectValue; } catch { return Response.json({ error: 'Carga do webhook inválida.' }, { status: 400 }); }
  if (payload.object !== 'whatsapp_business_account') return Response.json({ error: 'Objeto do webhook não suportado.' }, { status: 400 });

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  // Toques no botão das ofertas e status de entrega: tratados depois de gravar.
  const clicks: { payload: string; from: string; statement: number }[] = [];
  const deliveries: { wamid: string; status: string }[] = [];
  for (const entry of array(payload.entry)) for (const change of array(object(entry).changes)) {
    if (object(change).field !== 'messages') continue;
    const value = object(object(change).value);
    const metadata = object(value.metadata);
    const phoneNumberId = string(metadata.phone_number_id);
    if (!phoneNumberId) continue;
    const contacts = array(value.contacts);
    const contact = object(contacts[0]);
    const contactPhone = string(contact.wa_id);
    const contactName = string(object(contact.profile).name) || null;
    for (const message of array(value.messages)) {
      const item = object(message); const wamid = string(item.id); const type = string(item.type) || 'unknown';
      if (!wamid) continue;
      const content = object(item[type]);
      const occurredAt = timestamp(item.timestamp);
      statements.push(insertMessage(wamid, phoneNumberId, contactPhone || null, contactName, 'incoming', type, messageBody(type, content) ?? (type === 'button' ? string(content.payload) || null : null), string(content.id) || null, null, occurredAt, now));
      const payload = type === 'button' ? string(content.payload) : type === 'interactive' ? string(object(content.button_reply).id) : '';
      const from = string(item.from) || contactPhone;
      // O índice da gravação diz depois se a mensagem é nova ou reenvio da Meta.
      if (payload && from) clicks.push({ payload, from, statement: statements.length - 1 });
      if (contactPhone) statements.push(upsertConversation(contactPhone, contactName, occurredAt, now));
    }
    for (const status of array(value.statuses)) {
      const item = object(status); const wamid = string(item.id); if (!wamid) continue;
      deliveries.push({ wamid, status: string(item.status) });
      statements.push(insertMessage(`status:${wamid}:${string(item.status)}`, phoneNumberId, string(item.recipient_id) || null, null, 'status', 'status', null, null, string(item.status) || null, timestamp(item.timestamp), now));
    }
  }
  const saved = statements.length ? await env.DB.batch(statements) : [];
  // Distribuição de chamados: o clique em "Aceitar atendimento" decide quem
  // fica com a oferta; a resposta sai na hora pela janela de 24 h do clique.
  // Reenvio do mesmo webhook (wamid já gravado) não responde de novo ao técnico.
  for (const click of clicks.filter((c) => saved[c.statement]?.meta.changes === 1)) {
    const reply = await handleOfferClick(click.payload, click.from).catch((error) => {
      console.error('dispatch: clique falhou', error instanceof Error ? error.message : 'erro');
      return null;
    });
    if (reply) await replyToTechnician(click.from, reply);
  }
  for (const d of deliveries) await recordDeliveryStatus(d.wamid, d.status).catch(() => undefined);
  return Response.json({ received: true });
}

// Read state and the linked ticket are owned by whichever agent set them
// last; an incoming message only ever touches the name/last-message-time.
// O único número na API oficial é o da distribuição de chamados. As conversas
// dele ficam numa conta própria, fora das caixas Suporte/Caju (que são bridge).
// A chave da tabela é (account, contact_phone) desde a migration 0036.
const CLOUD_ACCOUNT = 'despacho';

function upsertConversation(contactPhone: string, contactName: string | null, lastMessageAt: string, now: string) {
  return env.DB.prepare(`
    INSERT INTO whatsapp_conversations (account, contact_phone, contact_name, last_message_at, created_at, updated_at)
    VALUES ('${CLOUD_ACCOUNT}', ?, ?, ?, ?, ?)
    ON CONFLICT(account, contact_phone) DO UPDATE SET
      contact_name = COALESCE(excluded.contact_name, whatsapp_conversations.contact_name),
      last_message_at = excluded.last_message_at,
      updated_at = excluded.updated_at
  `).bind(contactPhone, contactName, lastMessageAt, now, now);
}

function insertMessage(wamid: string, phoneNumberId: string, contactPhone: string | null, contactName: string | null, direction: 'incoming' | 'status', messageType: string, body: string | null, mediaId: string | null, deliveryStatus: string | null, occurredAt: string, createdAt: string) {
  return env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_messages (account, wamid, phone_number_id, contact_phone, contact_name, direction, message_type, body, media_id, delivery_status, occurred_at, created_at) VALUES ('${CLOUD_ACCOUNT}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(wamid, phoneNumberId, contactPhone, contactName, direction, messageType, body, mediaId, deliveryStatus, occurredAt, createdAt);
}

async function hasValidSignature(body: string, received: string | null, secret: string) {
  const match = received?.match(/^sha256=([a-f0-9]{64})$/i); if (!match) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(match[1].toLowerCase(), expected);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
function object(value: unknown): ObjectValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function timestamp(value: unknown) { const seconds = Number(value); return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date().toISOString(); }
function messageBody(type: string, content: ObjectValue) { return type === 'text' ? string(content.body) || null : type === 'button' ? string(content.text) || null : type === 'interactive' ? string(object(content.button_reply).title) || string(object(content.list_reply).title) || null : null; }
