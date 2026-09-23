// Ditado por voz no assistente: o navegador grava (MediaRecorder), o Worker
// transcreve com Whisper no Workers AI e o texto volta para o campo — a
// pessoa revisa antes de enviar. Nada aqui decide ação nenhuma.

export const TRANSCRIBE_MODEL = '@cf/openai/whisper-large-v3-turbo';
/** Teto da gravação no navegador; passa disso, para sozinho. */
export const MAX_RECORDING_SECONDS = 60;
/** ~60 s de opus cabem folgados em 1,5 MB; o teto protege o Worker. */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

const ACCEPTED = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac'];

/** Tipo base, sem parâmetros de codec ("audio/webm;codecs=opus" → "audio/webm"). */
export function baseAudioType(contentType: string | null | undefined) {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

export function isAcceptedAudioType(contentType: string | null | undefined) {
  return ACCEPTED.includes(baseAudioType(contentType));
}

/** Ordem de preferência para o MediaRecorder de cada navegador. */
export const RECORDER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

/** Base64 sem `Buffer` (runtime de Workers), em blocos para não estourar a pilha. */
export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Whisper às vezes devolve espaços, quebras e reticências de silêncio. */
export function cleanTranscript(text: unknown) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').replace(/^[.…\s]+$/, '').trim();
}

export function formatRecordingTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
