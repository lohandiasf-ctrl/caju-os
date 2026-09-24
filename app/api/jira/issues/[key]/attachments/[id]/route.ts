import { requireApiUser } from '@/lib/server/firebase-auth';
import { deleteJiraAttachment, getJiraAttachmentContent, getJiraIssue, JiraError } from '@/lib/server/jira';
import { logSecurityEvent } from '@/lib/server/security-log';

const ATTACHMENT_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

export async function GET(request: Request, context: { params: Promise<{ key: string; id: string }> }) {
  try {
    await requireApiUser(request, [...ATTACHMENT_ROLES]);
    const { key, id } = await context.params;
    const url = new URL(request.url);
    const thumbnail = url.searchParams.get('thumbnail') === '1';
    const attachment = await getJiraAttachmentContent(key, id, thumbnail);
    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    return new Response(attachment.body, { headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      ...(attachment.size ? { 'Content-Length': String(attachment.size) } : {}),
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Não foi possível abrir o anexo.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ key: string; id: string }> }) {
  try {
    const user = await requireApiUser(request, [...ATTACHMENT_ROLES]);
    const { key, id } = await context.params;
    await deleteJiraAttachment(id);
    logSecurityEvent({ request, user, action: 'attachment_delete', outcome: 'allowed', details: { ticketKey: key, attachmentId: id } });
    return Response.json(await getJiraIssue(key), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'Não foi possível remover o anexo.' }, { status: 500 });
  }
}
