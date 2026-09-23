import { env } from 'cloudflare:workers';
import { requireApiUser } from '@/lib/server/firebase-auth';
import { enforceRateLimit } from '@/lib/server/rate-limit';
import { bytesToBase64, cleanTranscript, isAcceptedAudioType, MAX_AUDIO_BYTES, TRANSCRIBE_MODEL } from '@/lib/voice-transcription';

type Runner = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };

// Transcreve o áudio ditado no campo do assistente (corpo = o arquivo de
// áudio, Content-Type do MediaRecorder). Só devolve texto: quem envia a
// pergunta continua sendo a pessoa, depois de revisar.
export async function POST(request: Request) {
  try {
    // Mesmo alcance do assistente geral.
    await requireApiUser(request, ['gerencia', 'coordenador', 'n1', 'analista']);
    enforceRateLimit(request, 'assistant-transcribe', { limit: 10, windowMs: 60_000 });

    const contentType = request.headers.get('content-type');
    if (!isAcceptedAudioType(contentType)) {
      return Response.json({ error: 'Formato de áudio não suportado.' }, { status: 415 });
    }
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_AUDIO_BYTES) {
      return Response.json({ error: 'Áudio longo demais. Grave até 1 minuto.' }, { status: 413 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_AUDIO_BYTES) {
      return Response.json({ error: 'Áudio longo demais. Grave até 1 minuto.' }, { status: 413 });
    }
    if (bytes.byteLength < 1024) {
      return Response.json({ error: 'Não deu para ouvir nada. Tente de novo.' }, { status: 400 });
    }

    const ai = (env as unknown as { AI?: Runner }).AI;
    if (!ai) {
      return Response.json({ error: 'A transcrição não está configurada neste ambiente.' }, { status: 503 });
    }
    const result = await ai.run(TRANSCRIBE_MODEL, {
      audio: bytesToBase64(bytes),
      task: 'transcribe',
      language: 'pt',
      vad_filter: true,
      // Vocabulário da operação ajuda o modelo com siglas e nomes próprios.
      initial_prompt: 'Chamados FSA, técnicos, agendamento, spare, Central N1, Jira.',
    }) as { text?: unknown };
    const text = cleanTranscript(result?.text);
    if (!text) {
      return Response.json({ error: 'Não entendi o áudio. Tente falar mais perto do microfone.' }, { status: 422 });
    }
    return Response.json({ text });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Transcrição do assistente', error);
    // Falha de conveniência: o campo de texto continua funcionando.
    return Response.json({ error: 'Não foi possível transcrever agora. Digite a pergunta.' }, { status: 502 });
  }
}
