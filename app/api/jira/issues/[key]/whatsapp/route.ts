import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';

const ISSUE_KEY = /^FSA-\d+$/;

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    await requireApiUser(request, ['gerencia', 'n1', 'analista']);
    const key = await issueKey(context);
    const row = await env.DB.prepare('SELECT whatsapp_url, updated_at FROM jira_issue_links WHERE issue_key = ?').bind(key).first<{ whatsapp_url: string; updated_at: string }>();
    return Response.json({ whatsappUrl: row?.whatsapp_url ?? null, updatedAt: row?.updated_at ?? null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireApiUser(request, ['gerencia', 'analista']);
    const key = await issueKey(context);
    const body = await request.json() as { whatsappUrl?: unknown };
    const whatsappUrl = normalizeWhatsappUrl(body.whatsappUrl);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO jira_issue_links (issue_key, whatsapp_url, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(issue_key) DO UPDATE SET whatsapp_url = excluded.whatsapp_url, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .bind(key, whatsappUrl, user.uid, updatedAt).run();
    return Response.json({ whatsappUrl, updatedAt });
  } catch (error) {
    return apiError(error);
  }
}

async function issueKey(context: { params: Promise<{ key: string }> }) {
  const key = (await context.params).key.toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new Response(JSON.stringify({ error: 'Chamado inválido.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  return key;
}

function normalizeWhatsappUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) throw new Response(JSON.stringify({ error: 'Informe um link válido do grupo.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'chat.whatsapp.com' || url.pathname.length < 2) throw new Error();
    return url.toString();
  } catch {
    throw new Response(JSON.stringify({ error: 'Use um link de grupo no formato https://chat.whatsapp.com/...' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
}

function apiError(error: unknown) {
  if (error instanceof Response) return error;
  console.error('Falha ao salvar link do WhatsApp', error);
  return Response.json({ error: 'Não foi possível salvar o link do grupo.' }, { status: 500 });
}
