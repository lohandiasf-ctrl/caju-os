import { resendOffer } from '@/lib/server/dispatch';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Botão "Reenviar" de cada oferta no painel da distribuição (gerência e
// coordenação): cancela a oferta que ainda não foi aceita e manda uma nova
// para os mesmos chamados, com prazo novo (lib/server/dispatch.ts).

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request, ['gerencia', 'coordenador']);
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Oferta inválida.' }, { status: 400 });
    const result = await resendOffer(id, user.email);
    if ('error' in result) return Response.json(result, { status: 409 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('dispatch resend failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'Não foi possível reenviar a oferta.' }, { status: 500 });
  }
}
