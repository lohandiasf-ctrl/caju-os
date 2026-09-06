import { requireApiUser } from '@/lib/server/firebase-auth';
import { getJiraAttachmentContent, JiraError } from '@/lib/server/jira';

export async function GET(request: Request, context: { params: Promise<{ key: string; id: string }> }) {
  try {
    await requireApiUser(request);
    const { key, id } = await context.params;
    const attachment = await getJiraAttachmentContent(key, id);
    const disposition = new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
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
