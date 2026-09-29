import { sendTestOffer } from '@/lib/server/dispatch';
import { requireApiUser } from '@/lib/server/firebase-auth';

// Botão "Enviar oferta de teste" do painel da distribuição (gerência): manda o
// template de verdade, com loja e chamado fictícios, só para os números de
// DISPATCH_ALLOWLIST. O aceite não vincula chamado nem mexe no Jira.

export async function POST(request: Request) {
  try {
    await requireApiUser(request, ['gerencia']);
    const result = await sendTestOffer();
    if ('error' in result) return Response.json(result, { status: 400 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('dispatch test failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'Não foi possível enviar a oferta de teste.' }, { status: 500 });
  }
}
