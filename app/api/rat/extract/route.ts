import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { isSafeUpload } from '@/lib/safe-data-url';

const MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

type Extraction = {
  identifiedProblem: string;
  testsPerformed: string;
  partToReplace: string;
  confidence: 'alta' | 'media' | 'baixa';
  info?: string;
};

const PROMPT = `Você transcreve RAT (Relatório de Atendimento Técnico) de suporte de TI em lojas de varejo.

O formulário é PREENCHIDO À MÃO pelo técnico em campo, fotografado com celular. Espere letra cursiva ou de forma, irregular, em português do Brasil, com foto torta, sombra e iluminação ruim. Os rótulos impressos do formulário ajudam a localizar cada campo; o que interessa é o texto MANUSCRITO escrito ao lado ou abaixo deles.

Extraia apenas estas três informações e responda SOMENTE com JSON válido, sem markdown:
{"identifiedProblem":"","testsPerformed":"","partToReplace":"","confidence":"alta|media|baixa"}

Regras:
- Transcreva o manuscrito o mais fielmente possível, corrigindo apenas o óbvio.
- Termos comuns no contexto: PDV, CPU, HD, SSD, fonte, impressora, pinpad, TEF, leitor, cabo de rede, memória, placa-mãe, no-break.
- Campo ilegível ou não preenchido: string vazia. Não chute.
- confidence "alta" só se a letra estiver claramente legível nos três campos;
  "media" se conseguiu ler parte; "baixa" se a escrita está difícil ou ausente.
- Nunca invente. Transcreva apenas o que está escrito.`;

// Extraction is a convenience: any failure returns empty fields with 200 so the
// technician is never blocked from filling the form by hand.
function empty(info: string): Extraction {
  return { identifiedProblem: '', testsPerformed: '', partToReplace: '', confidence: 'baixa', info };
}

function parseModel(raw: string): Extraction {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return empty('Resposta do modelo sem JSON.');
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    const confidence = parsed.confidence;
    return {
      identifiedProblem: text(parsed.identifiedProblem),
      testsPerformed: text(parsed.testsPerformed),
      partToReplace: text(parsed.partToReplace),
      confidence: confidence === 'alta' || confidence === 'media' ? confidence : 'baixa',
    };
  } catch {
    return empty('Não foi possível interpretar a resposta do modelo.');
  }
}

export async function POST(request: Request) {
  try {
    await requireApiUser(request);

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: 'Envie o arquivo da RAT no campo "file".' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: 'A RAT pode ter no máximo 10 MB.' }, { status: 413 });
    }
    // PDF would need rasterising, which has no cheap path in the Workers
    // runtime. Answered as "not extracted" rather than as an error.
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      return Response.json(empty('PDF ainda não é lido automaticamente. Envie uma foto da RAT.'));
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return Response.json(empty(`Formato não suportado (${file.type || 'desconhecido'}). Use PNG, JPG ou WebP.`));
    }
    if (!(await isSafeUpload(file, MAX_BYTES))) {
      return Response.json(empty('O conteúdo da imagem não corresponde ao formato informado. Envie uma foto PNG, JPG ou WebP válida.'));
    }
    if (!env.AI) return Response.json(empty('Leitura automática indisponível: binding AI ausente.'));

    const image = [...new Uint8Array(await file.arrayBuffer())];
    let result: unknown;
    try {
      result = await env.AI.run(MODEL, { prompt: PROMPT, image, max_tokens: 512, temperature: 0.1 });
    } catch (aiError) {
      // Surface the real reason: a generic message here cost a debugging round.
      const detail = aiError instanceof Error ? aiError.message : String(aiError);
      console.error('Workers AI recusou a leitura da RAT', aiError);
      return Response.json(empty(`IA recusou: ${detail.slice(0, 220)}`));
    }
    const raw = typeof result === 'string' ? result : String((result as { response?: unknown })?.response ?? '');
    if (!raw.trim()) return Response.json(empty('O modelo não retornou conteúdo.'));

    return Response.json(parseModel(raw), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao ler a RAT', error);
    return Response.json(empty('Falha na leitura automática. Preencha manualmente.'));
  }
}
