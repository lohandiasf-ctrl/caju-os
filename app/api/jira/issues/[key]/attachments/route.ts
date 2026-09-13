import { requireApiUser } from '@/lib/server/firebase-auth';
import { JiraError, uploadJiraAttachments } from '@/lib/server/jira';
import { isAllowedUploadMime, isSafeUpload } from '@/lib/safe-data-url';
import { logSecurityEvent } from '@/lib/server/security-log';

const allowedExtensions = /\.(?:png|jpe?g|webp|gif|heic|mp4|mov|webm|avi|pdf|docx?|xlsx?|csv|txt|zip|rar)$/i;
const ATTACHMENT_ROLES = ['gerencia', 'coordenador', 'n1', 'analista'] as const;

export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireApiUser(request, [...ATTACHMENT_ROLES]);
    const { key } = await context.params;
    const form = await request.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return Response.json({ error: 'Selecione ao menos um arquivo.' }, { status: 400 });
    if (files.length > 8) return Response.json({ error: 'Envie no máximo 8 arquivos por vez.' }, { status: 400 });
    if (files.some((file) => file.size > 25 * 1024 * 1024)) return Response.json({ error: 'Cada arquivo pode ter no máximo 25 MB.' }, { status: 400 });
    if (files.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) return Response.json({ error: 'O envio pode ter no máximo 50 MB.' }, { status: 400 });
    if (files.some((file) => !allowedExtensions.test(file.name))) return Response.json({ error: 'Formato não permitido. Use fotos, vídeos, PDF, Word, Excel, CSV, TXT ou pacotes ZIP/RAR.' }, { status: 400 });
    if (files.some((file) => !isAllowedUploadMime(file.type))) return Response.json({ error: 'Tipo de arquivo não permitido pelo navegador.' }, { status: 400 });
    if ((await Promise.all(files.map((file) => isSafeUpload(file, 25 * 1024 * 1024)))).some((safe) => !safe)) {
      logSecurityEvent({ request, user, action: 'attachment_upload_rejected', outcome: 'denied', details: { ticketKey: key, files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })) } });
      return Response.json({ error: 'Arquivo inválido ou incompatível com o tipo informado.' }, { status: 400 });
    }
    logSecurityEvent({ request, user, action: 'attachment_upload', outcome: 'allowed', details: { ticketKey: key, count: files.length, totalBytes: files.reduce((total, file) => total + file.size, 0) } });
    return Response.json(await uploadJiraAttachments(key, files, user.email), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao anexar evidências no Jira', error);
    return Response.json({ error: 'Não foi possível enviar os anexos ao Jira.' }, { status: 500 });
  }
}
