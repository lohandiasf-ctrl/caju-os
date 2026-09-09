import { requireApiUser } from '@/lib/server/firebase-auth';
import { JiraError, uploadJiraAttachments } from '@/lib/server/jira';

const allowedExtensions = /\.(?:png|jpe?g|webp|gif|heic|mp4|mov|webm|avi|pdf|docx?|xlsx?|csv|txt|zip|rar)$/i;

export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { key } = await context.params;
    const form = await request.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return Response.json({ error: 'Selecione ao menos um arquivo.' }, { status: 400 });
    if (files.length > 8) return Response.json({ error: 'Envie no máximo 8 arquivos por vez.' }, { status: 400 });
    if (files.some((file) => file.size > 25 * 1024 * 1024)) return Response.json({ error: 'Cada arquivo pode ter no máximo 25 MB.' }, { status: 400 });
    if (files.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) return Response.json({ error: 'O envio pode ter no máximo 50 MB.' }, { status: 400 });
    if (files.some((file) => !allowedExtensions.test(file.name))) return Response.json({ error: 'Formato não permitido. Use fotos, vídeos, PDF, Word, Excel, CSV, TXT ou pacotes ZIP/RAR.' }, { status: 400 });
    return Response.json(await uploadJiraAttachments(key, files, user.email), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    console.error('Falha ao anexar evidências no Jira', error);
    return Response.json({ error: 'Não foi possível enviar os anexos ao Jira.' }, { status: 500 });
  }
}
