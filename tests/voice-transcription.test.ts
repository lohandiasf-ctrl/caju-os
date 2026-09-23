import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToBase64, cleanTranscript, formatRecordingTime, isAcceptedAudioType } from '../lib/voice-transcription.ts';

test('áudio: tipos aceitos, base64 sem Buffer e texto limpo', () => {
  assert.equal(isAcceptedAudioType('audio/webm;codecs=opus'), true);
  assert.equal(isAcceptedAudioType('audio/mp4'), true);
  assert.equal(isAcceptedAudioType('video/webm'), false);
  assert.equal(isAcceptedAudioType(null), false);
  const bytes = new Uint8Array(70_000).map((_, index) => index % 256);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
  assert.equal(cleanTranscript('  quais  chamados\nestão atrasados? '), 'quais chamados estão atrasados?');
  assert.equal(cleanTranscript(' ... '), '');
  assert.equal(cleanTranscript(undefined), '');
  assert.equal(formatRecordingTime(65.4), '1:05');
});
