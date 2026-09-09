import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';

// One-time gate. Workers AI refuses @cf/meta/llama-3.2-11b-vision-instruct with
// error 5016 until the account submits the literal prompt "agree", which accepts
// Meta's Llama 3.2 Community License:
// https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE
//
// Restricted to gerencia because it binds the account to a licence: it must be a
// deliberate act by someone entitled to accept terms, not a side effect.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['gerencia']);
    if (!env.AI) return Response.json({ error: 'Binding AI ausente.' }, { status: 500 });
    const result = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' });
    const raw = typeof result === 'string' ? result : String((result as { response?: unknown })?.response ?? '');
    return Response.json({
      aceito: true,
      aceitoPor: user.email,
      em: new Date().toISOString(),
      respostaDoModelo: raw.slice(0, 300),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: detail.slice(0, 300) }, { status: 502 });
  }
}
