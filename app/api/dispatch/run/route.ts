import { env } from 'cloudflare:workers';
import { runDispatch } from '@/lib/server/dispatch';

// Chamado pela rotina agendada (scripts/worker-entry.js, a cada 10 min).
// Com DISPATCH_MODE vazio ou "off" não faz nada; em "dry_run" grava as ofertas
// como simulação, sem mandar mensagem (lib/server/dispatch.ts).

export async function POST(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    return Response.json(await runDispatch());
  } catch (error) {
    console.error('dispatch run failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'A rodada de distribuição falhou.' }, { status: 500 });
  }
}
