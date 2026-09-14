import { env } from 'cloudflare:workers';

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
      statements.push(insertMessage(wamid, phoneNumberId, contactPhone || null, contactName, 'incoming', type, messageBody(type, content), string(content.id) || null, null, timestamp(item.timestamp), now));
    }
    for (const status of array(value.statuses)) {
      const item = object(status); const wamid = string(item.id); if (!wamid) continue;
      statements.push(insertMessage(`status:${wamid}:${string(item.status)}`, phoneNumberId, string(item.recipient_id) || null, null, 'status', 'status', null, null, string(item.status) || null, timestamp(item.timestamp), now));
    }
  }
  if (statements.length) await env.DB.batch(statements);
  return Response.json({ received: true });
}

function insertMessage(wamid: string, phoneNumberId: string, contactPhone: string | null, contactName: string | null, direction: 'incoming' | 'status', messageType: string, body: string | null, mediaId: string | null, deliveryStatus: string | null, occurredAt: string, createdAt: string) {
  return env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_messages (wamid, phone_number_id, contact_phone, contact_name, direction, message_type, body, media_id, delivery_status, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
