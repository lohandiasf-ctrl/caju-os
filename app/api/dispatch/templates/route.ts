import { env } from 'cloudflare:workers';
import { DISPATCH_TEMPLATES, NOTICE_TEMPLATES } from '@/lib/dispatch';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Templates da distribuição versionados no código (lib/dispatch.ts). GET mostra
// o status de aprovação na Meta; POST envia para análise os que ainda não
// existem. Usa o token do usuário do sistema (WHATSAPP_ACCESS_TOKEN) e a conta
// do WhatsApp da distribuição (WHATSAPP_BUSINESS_ACCOUNT_ID).

const GRAPH = 'https://graph.facebook.com/v21.0';
// Oferta (técnicos) e avisos (gestores): todos passam pela mesma aprovação.
const ALL_TEMPLATES = [...DISPATCH_TEMPLATES, ...NOTICE_TEMPLATES];

function config() {
  const vars = env as unknown as Record<string, string | undefined>;
  const token = vars.WHATSAPP_ACCESS_TOKEN?.trim();
  const waba = vars.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  if (!token || !waba) {
    throw Response.json({ error: 'Falta configurar WHATSAPP_ACCESS_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID no Worker.' }, { status: 503 });
  }
  return { token, waba };
}

type MetaTemplate = { name: string; status: string; category?: string; language: string; rejected_reason?: string; id: string };

async function listOurs(token: string, waba: string) {
  const names = new Set<string>(ALL_TEMPLATES.map((t) => t.name));
  const response = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status,category,language,rejected_reason&limit=200`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => null) as { data?: MetaTemplate[]; error?: { message?: string } } | null;
  if (!response.ok) throw Response.json({ error: payload?.error?.message ?? 'A Meta não respondeu à consulta dos templates.' }, { status: 502 });
  return (payload?.data ?? []).filter((t) => names.has(t.name));
}

export async function GET(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'analista']);
    const { token, waba } = config();
    return Response.json({ templates: await listOurs(token, waba), expected: ALL_TEMPLATES.map((t) => t.name) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível consultar os templates.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'analista']);
    const { token, waba } = config();
    const existing = new Set((await listOurs(token, waba)).map((t) => t.name));
    const results: { name: string; status: string; error?: string }[] = [];
    for (const template of ALL_TEMPLATES) {
      if (existing.has(template.name)) { results.push({ name: template.name, status: 'já existe' }); continue; }
      const response = await fetch(`${GRAPH}/${waba}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      const payload = await response.json().catch(() => null) as { status?: string; error?: { message?: string; error_user_msg?: string } } | null;
      results.push(response.ok
        ? { name: template.name, status: payload?.status ?? 'PENDING' }
        : { name: template.name, status: 'erro', error: payload?.error?.error_user_msg ?? payload?.error?.message ?? `HTTP ${response.status}` });
    }
    return Response.json({ results });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: 'Não foi possível enviar os templates.' }, { status: 500 });
  }
}
