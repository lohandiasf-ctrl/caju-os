import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { refreshSpareTracking } from '@/lib/server/spare-tracking';

// O Worker chama esta rota a cada dez minutos: consulta aos poucos os spares
// ativos com código de rastreio — inclusive os cadastrados antes da integração —
// e reconsulta os que ainda não foram entregues. O cron secret é obrigatório para
// a chamada automática; um gerente logado também pode disparar pela interface.
export async function POST(request: Request) {
  try {
    const cron = request.headers.get('x-cron-secret');
    const isScheduled = Boolean(env.CRON_SECRET && cron && cron === env.CRON_SECRET);
    if (!isScheduled) await requireApiUser(request, ['gerencia']);
    return Response.json(await refreshSpareTracking());
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao atualizar os rastreios de spares', error);
    return Response.json({ error: 'Não foi possível atualizar os rastreios.' }, { status: 500 });
  }
}
