export const CHAT_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const CHAT_AUDIO_MAX_SECONDS = 300;
export const CHAT_AUDIO_MIN_MILLIS = 300;

export function chatAudioDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function validateVoiceRecording(input: { uri: string | null; bytes: number; durationMillis: number }): void {
  if (!input.uri || !/^file:\/\//.test(input.uri) || !/\.m4a(?:\?|$)/i.test(input.uri)) throw new Error('Ses kaydı okunamadı. Yeniden kaydedin.');
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > CHAT_AUDIO_MAX_BYTES) throw new Error('Ses kaydı boş veya 25 MB sınırını aşıyor.');
  if (!Number.isFinite(input.durationMillis) || input.durationMillis < CHAT_AUDIO_MIN_MILLIS) throw new Error('Ses kaydı çok kısa. Biraz daha uzun kaydedin.');
}

export function isChatAudioMime(mime: string | null | undefined): boolean {
  return ['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'video/webm'].includes((mime ?? '').split(';')[0]!.trim().toLowerCase());
}

/** URL comes from the authorized signed-download API, never from message markup. */
export function signedChatAudioUrl(value: string, apiBase: string, development = false): string {
  const base = new URL(apiBase.endsWith('/') ? apiBase : `${apiBase}/`);
  const url = /^https?:\/\//i.test(value) ? new URL(value) : new URL(value.startsWith('/') ? value : value.replace(/^\//, ''), value.startsWith('/') ? base.origin : base);
  const loopback = ['localhost', '127.0.0.1', '10.0.2.2', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && loopback))) throw new Error('Ses dosyasının güvenli indirme adresi geçersiz.');
  return url.toString();
}
