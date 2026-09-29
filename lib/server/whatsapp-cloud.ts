import { env } from 'cloudflare:workers';

// Envio pela WhatsApp Cloud API oficial, pelo número da distribuição de
// chamados (WHATSAPP_PHONE_NUMBER_ID). Nunca registra token nem conteúdo.

const GRAPH = 'https://graph.facebook.com/v21.0';

export class CloudApiError extends Error {
  constructor(message: string, readonly code?: number) { super(message); }
}

function config() {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) throw new CloudApiError('WhatsApp oficial não configurado (token ou Phone Number ID).');
  return { token, phoneId };
}

async function send(body: Record<string, unknown>): Promise<string> {
  const { token, phoneId } = config();
  const response = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => null) as { messages?: { id: string }[]; error?: { message?: string; code?: number } } | null;
  const wamid = payload?.messages?.[0]?.id;
  if (!response.ok || !wamid) throw new CloudApiError(payload?.error?.message ?? `HTTP ${response.status}`, payload?.error?.code);
  return wamid;
}

/** Status e categoria dos modelos da conta da distribuição (WHATSAPP_BUSINESS_ACCOUNT_ID). */
export async function listTemplateStatuses(): Promise<{ name: string; status: string; category?: string }[]> {
  const { token } = config();
  const waba = (env as unknown as Record<string, string | undefined>).WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!waba) throw new CloudApiError('Falta WHATSAPP_BUSINESS_ACCOUNT_ID.');
  const response = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status,category&limit=200`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => null) as { data?: { name: string; status: string; category?: string }[]; error?: { message?: string } } | null;
  if (!response.ok) throw new CloudApiError(payload?.error?.message ?? `HTTP ${response.status}`);
  return payload?.data ?? [];
}

/** Mensagem de modelo aprovado (única forma de iniciar conversa). */
export const sendTemplateMessage = (payload: Record<string, unknown>) => send(payload);

/** Texto livre: só vale dentro da janela de 24 h aberta pelo contato (ex.: depois do clique no botão). */
export const sendTextMessage = (to: string, text: string) =>
  send({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } });
