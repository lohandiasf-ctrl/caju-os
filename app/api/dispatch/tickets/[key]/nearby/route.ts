import { nearbyTickets, offerVersionInUse } from '@/lib/server/dispatch';
import { versionHasValue } from '@/lib/dispatch';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Oferta manual pela tela do chamado: os chamados abertos da mesma cidade,
// para anexar na mesma oferta, e se o valor personalizado já pode ser usado
// (só com o modelo oferta_valor aprovado pela Meta).

const KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireApiUser(request, ['gerencia', 'coordenador', 'analista']);
    const key = decodeURIComponent((await params).key).toUpperCase();
    if (!KEY.test(key)) return Response.json({ error: 'Chamado inválido.' }, { status: 400 });
    const [nearby, version] = await Promise.all([nearbyTickets(key), offerVersionInUse()]);
    return Response.json({ ...nearby, valueAllowed: versionHasValue(version) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('dispatch nearby failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'Não foi possível buscar os chamados da cidade.' }, { status: 500 });
  }
}
