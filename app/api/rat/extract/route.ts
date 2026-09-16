import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { isSafeUpload } from '@/lib/safe-data-url';
import { emptyExtraction as empty, hasContent, parseExtraction, toBase64 } from '@/lib/rat-extraction';

// Vision models, best transcription first. Measured against a real RAT photo
// (handwriting in ballpoint, phone photo, uneven light):
// - mistral-small-3.1 transcribed all three fields word for word;
// - llama-4-scout got them right but shortened;
// - llama-3.2-11b-vision (what this route used first) answered in prose
//   bullets, ignoring the JSON instruction, and summarised instead of
//   transcribing — that is the "Resposta do modelo sem JSON." the inbox showed.
// It stays last: it is the cheapest and still better than nothing.
const MODELS = [
  { name: '@cf/mistralai/mistral-small-3.1-24b-instruct', input: 'messages' },
  { name: '@cf/meta/llama-4-scout-17b-16e-instruct', input: 'messages' },
  { name: '@cf/meta/llama-3.2-11b-vision-instruct', input: 'bytes' },
] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const PROMPT = `Você transcreve RAT (Relatório de Atendimento Técnico) de suporte de TI em lojas de varejo.

O formulário é PREENCHIDO À MÃO pelo técnico em campo, fotografado com celular. Espere letra cursiva ou de forma, irregular, em português do Brasil, com foto torta, sombra e iluminação ruim. Os rótulos impressos do formulário ajudam a localizar cada campo; o que interessa é o texto MANUSCRITO escrito ao lado ou abaixo deles.

Extraia apenas estas três informações e responda SOMENTE com JSON válido, sem markdown:
{"identifiedProblem":"","testsPerformed":"","partToReplace":"","confidence":"alta|media|baixa"}

Onde procurar cada campo:
- identifiedProblem: o manuscrito em "Defeito/Problema".
- testsPerformed: o manuscrito em "Diagnóstico/Testes realizados".
- partToReplace: só o nome da peça ou equipamento que será trocado (ex.: "Monitor", "Fonte", "Teclado", "Gaveta"), lido de "Solução" ou do motivo ao lado de "Problema resolvido?". String vazia se nada será trocado.

Regras:
- Transcreva o manuscrito o mais fielmente possível, corrigindo apenas o óbvio. Não resuma.
- Termos comuns no contexto: PDV, CPU, HD, SSD, fonte, impressora, pinpad, TEF, leitor, cabo de rede, memória, placa-mãe, no-break.
- Campo ilegível ou não preenchido: string vazia. Não chute.
- confidence "alta" só se a letra estiver claramente legível nos três campos;
  "media" se conseguiu ler parte; "baixa" se a escrita está difícil ou ausente.
- Nunca invente. Transcreva apenas o que está escrito.`;

type Runner = { run: (model: string, input: unknown) => Promise<unknown> };

// Extraction is a convenience: any failure returns empty fields with 200 so the
// technician is never blocked from filling the form by hand.
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

    const bytes = new Uint8Array(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${toBase64(bytes)}`;
    const ai = env.AI as unknown as Runner;
    let lastInfo = 'Nenhum modelo conseguiu ler a RAT.';

    for (const model of MODELS) {
      const input = model.input === 'messages'
        ? {
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            }],
            max_tokens: 768,
            temperature: 0.1,
          }
        : { prompt: PROMPT, image: [...bytes], max_tokens: 768, temperature: 0.1 };

      let result: unknown;
      try {
        result = await ai.run(model.name, input);
      } catch (aiError) {
        // Surface the real reason: a generic message here cost a debugging round.
        const detail = aiError instanceof Error ? aiError.message : String(aiError);
        console.error(`Workers AI recusou a leitura da RAT em ${model.name}`, aiError);
        lastInfo = `IA recusou: ${detail.slice(0, 220)}`;
        continue;
      }

      const raw = typeof result === 'string' ? result : (result as { response?: unknown })?.response;
      const extraction = parseExtraction(raw);
      if (extraction && hasContent(extraction)) {
        return Response.json(extraction, { headers: { 'Cache-Control': 'private, no-store' } });
      }
      // Keep what the model actually said: "sem JSON" alone hid the reason.
      const said = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
      lastInfo = extraction
        ? `${model.name.split('/').pop()} não achou os campos manuscritos.`
        : `Resposta fora do formato${said ? `: "${said}"` : ''}.`;
    }

    return Response.json(empty(lastInfo));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Falha ao ler a RAT', error);
    return Response.json(empty('Falha na leitura automática. Preencha manualmente.'));
  }
}
