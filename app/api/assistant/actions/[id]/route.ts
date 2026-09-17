import { cancelProposal, confirmProposal, loadProposal } from '@/lib/server/assistant-actions';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { JiraError } from '@/lib/server/jira';
import { enforceRateLimit } from '@/lib/server/rate-limit';

// Confirmar a ação proposta. O corpo não carrega o que será escrito: o
// servidor relê a proposta pelo id. Confirmar é a única porta de escrita.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    enforceRateLimit(request, 'assistant-confirm', { limit: 30, windowMs: 60_000 });
    const { id } = await context.params;
    const row = await loadProposal(id);
    if (!row) return Response.json({ error: 'Sugestão não encontrada.' }, { status: 404 });
    // Quem confirma é quem recebeu a sugestão. Sem isso, um id vazado viraria
    // escrita no Jira em nome de outra pessoa.
    if (row.proposedTo !== current.email) {
      return Response.json({ error: 'Esta sugestão foi feita para outra pessoa.' }, { status: 403 });
    }
    const result = await confirmProposal(id, current.email);
    return Response.json({ ok: true, description: result.description });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JiraError) return Response.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : 'Não foi possível aplicar a ação.';
    console.error('Confirmação da escrita assistida', error);
    return Response.json({ error: message }, { status: 409 });
  }
}

// Recusar a sugestão. Fica registrada como recusada — a auditoria precisa
// saber o que foi oferecido e não aceito.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    const { id } = await context.params;
    const row = await loadProposal(id);
    if (!row) return Response.json({ error: 'Sugestão não encontrada.' }, { status: 404 });
    if (row.proposedTo !== current.email) {
      return Response.json({ error: 'Esta sugestão foi feita para outra pessoa.' }, { status: 403 });
    }
    return Response.json({ ok: await cancelProposal(id, current.email) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Recusa da escrita assistida', error);
    return Response.json({ error: 'Não foi possível recusar a sugestão.' }, { status: 500 });
  }
}
