import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { requestContextKey, RequestScopeChangedError } from '@/src/api/client';
import { apiBaseUrl } from '@/src/api/config';
import { files } from '@/src/api/endpoints';
import type { LocalUpload } from './files';
import { CHAT_AUDIO_MAX_BYTES, CHAT_AUDIO_MAX_SECONDS, isChatAudioMime, signedChatAudioUrl, validateVoiceRecording } from './chat-audio-policy';

type AudioSdk = typeof import('expo-audio');
type Recorder = InstanceType<AudioSdk['AudioModule']['AudioRecorder']>;
type Player = ReturnType<AudioSdk['createAudioPlayer']>;
export type ChatAudioStatus = { recording: boolean; playing: boolean; durationMillis: number; positionMillis: number; loaded: boolean };
export type RecordedChatAudio = { upload: LocalUpload; durationMillis: number };
let owner: { dispose: () => Promise<void> } | null = null;

async function audioSdk(): Promise<AudioSdk> {
  if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoAudio')) throw new Error('Sesli mesaj için güncel iOS veya Android uygulamasını kullanın.');
  return import('expo-audio');
}

/** Await before starting another microphone owner, such as a foreground WebRTC call. */
export async function stopChatAudio(): Promise<void> {
  const current = owner;
  owner = null;
  await current?.dispose();
}

function assertContext(context: string): void {
  if (context !== requestContextKey()) throw new RequestScopeChangedError();
  if (AppState.currentState !== 'active') throw new Error('Sesli mesaj yalnız uygulama açıkken kullanılabilir.');
}
function waitForForeground(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { subscription.remove(); reject(new Error('Uygulamaya dönüp ses kaydını yeniden başlatın.')); }, 5000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' || state === 'background') {
        clearTimeout(timeout); subscription.remove();
        if (state === 'active') resolve(); else reject(new Error('Ses kaydı iptal edildi.'));
      }
    });
  });
}

function removeFile(uri?: string | null) {
  if (!uri) return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* Already removed or inaccessible after native release. */ }
}

export class ChatAudioSession {
  private readonly context = requestContextKey();
  private sdk: AudioSdk | null = null;
  private recorder: Recorder | null = null;
  private player: Player | null = null;
  private recordingFile: string | null = null;
  private playbackFile: string | null = null;
  private disposed = false;
  private readonly closedListeners = new Set<() => void>();
  private finishing: Promise<RecordedChatAudio> | null = null;
  private disposePromise: Promise<void> | null = null;
  private downloadAbort: AbortController | null = null;
  private downloadTimer: ReturnType<typeof setTimeout> | null = null;
  private startPromise: Promise<void> | null = null;
  private attachmentPromise: Promise<void> | null = null;
  private readonly appSubscription = AppState.addEventListener('change', state => {
    if (state === 'background' || (state === 'inactive' && Boolean(this.recorder || this.player))) void this.dispose();
  });

  onClosed(listener: () => void): () => void {
    if (this.disposed) { listener(); return () => {}; }
    this.closedListeners.add(listener);
    return () => this.closedListeners.delete(listener);
  }

  private check() {
    if (this.disposed) throw new Error('Ses işlemi kapatıldı. Yeniden başlatın.');
    assertContext(this.context);
  }
  private async claim() {
    this.check();
    if (owner !== this) await stopChatAudio();
    this.check();
    owner = this;
    this.sdk = await audioSdk();
    this.check();
  }

  startRecording(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.start();
    return this.startPromise;
  }
  private async start(): Promise<void> {
    await this.claim();
    const sdk = this.sdk!;
    const permission = await sdk.requestRecordingPermissionsAsync();
    if (permission.granted && AppState.currentState === 'inactive') await waitForForeground();
    this.check();
    if (!permission.granted) throw new Error('Sesli mesaj kaydetmek için mikrofon izni verin. İzin kapalıysa cihaz ayarlarından değiştirebilirsiniz.');
    await sdk.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false });
    this.check();
    const preset = sdk.RecordingPresets.HIGH_QUALITY;
    const options = { extension: preset.extension, sampleRate: preset.sampleRate, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: false, ...(Platform.OS === 'ios' ? preset.ios : preset.android) };
    this.recorder = new sdk.AudioModule.AudioRecorder(options);
    await this.recorder.prepareToRecordAsync();
    this.check();
    this.recorder.record({ forDuration: CHAT_AUDIO_MAX_SECONDS });
  }

  status(): ChatAudioStatus {
    this.check();
    const status = this.recorder?.getStatus();
    return { recording: status?.isRecording ?? false, playing: this.player?.playing ?? false, durationMillis: status?.durationMillis ?? Math.round((this.player?.duration ?? 0) * 1000), positionMillis: Math.round((this.player?.currentTime ?? 0) * 1000), loaded: this.player?.isLoaded ?? Boolean(status) };
  }

  async finishRecording(): Promise<RecordedChatAudio> {
    if (this.finishing) return this.finishing;
    this.finishing = this.finish();
    return this.finishing;
  }
  private async finish(): Promise<RecordedChatAudio> {
    this.check();
    const recorder = this.recorder;
    if (!recorder) throw new Error('Önce ses kaydını başlatın.');
    const durationBefore = recorder.getStatus().durationMillis;
    if (recorder.isRecording) await recorder.stop();
    const durationMillis = Math.max(durationBefore, recorder.getStatus().durationMillis);
    this.recordingFile = recorder.uri;
    this.check();
    const source = this.recordingFile ? new File(this.recordingFile) : null;
    validateVoiceRecording({ uri: this.recordingFile, bytes: source?.size ?? 0, durationMillis });
    const filename = `sesli-mesaj-${Crypto.randomUUID()}.m4a`;
    const target = new File(Paths.cache, filename);
    source!.move(target);
    this.recordingFile = target.uri;
    recorder.release();
    this.recorder = null;
    await this.sdk!.setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, allowsBackgroundRecording: false });
    this.check();
    return { upload: { uri: target.uri, name: filename, mimeType: 'audio/mp4', extension: 'm4a', sizeBytes: target.size }, durationMillis };
  }

  async previewRecording(): Promise<void> {
    this.check();
    if (!this.recordingFile) throw new Error('Dinlemek için önce kaydı durdurun.');
    await this.playFile(this.recordingFile);
  }

  private async playFile(uri: string) {
    this.check();
    if (this.player) { this.player.pause(); this.player.remove(); }
    await this.sdk!.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false });
    this.check();
    this.player = this.sdk!.createAudioPlayer({ uri }, { updateInterval: 250, keepAudioSessionActive: false });
    this.player.play();
  }

  playAttachment(fileId: string): Promise<void> {
    if (!this.attachmentPromise) this.attachmentPromise = this.loadAttachment(fileId).finally(() => { if (this.downloadTimer) clearTimeout(this.downloadTimer); this.downloadTimer = null; });
    return this.attachmentPromise;
  }
  private async loadAttachment(fileId: string): Promise<void> {
    await this.claim();
    const signed = await files.signedDownload(fileId);
    this.check();
    if (!isChatAudioMime(signed.mimeType)) throw new Error('Bu ek desteklenen bir ses dosyası değil.');
    const url = signedChatAudioUrl(signed.downloadUrl, apiBaseUrl(), __DEV__);
    this.downloadAbort = new AbortController();
    this.downloadTimer = setTimeout(() => this.downloadAbort?.abort(), 30_000);
    const response = await expoFetch(url, { credentials: 'omit', redirect: 'error', signal: this.downloadAbort.signal });
    this.check();
    if (!response.ok || !response.body) throw new Error('Ses dosyası indirilemedi. Yeniden deneyin.');
    if (Number(response.headers.get('content-length') ?? 0) > CHAT_AUDIO_MAX_BYTES) throw new Error('Ses dosyası 25 MB sınırını aşıyor.');
    const extension = signed.mimeType.includes('mp4') || signed.mimeType.includes('m4a') ? 'm4a' : signed.mimeType.includes('mpeg') ? 'mp3' : signed.mimeType.includes('wav') ? 'wav' : signed.mimeType.includes('ogg') ? 'ogg' : 'webm';
    const target = new File(Paths.cache, `chat-audio-${Crypto.randomUUID()}.${extension}`);
    this.playbackFile = target.uri;
    target.create();
    const reader = response.body.getReader(), writer = target.writableStream().getWriter();
    let bytes = 0, completed = false;
    try {
      while (true) {
        this.check();
        const chunk = await reader.read();
        this.check();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > CHAT_AUDIO_MAX_BYTES) throw new Error('Ses dosyası 25 MB sınırını aşıyor.');
        await writer.write(chunk.value);
      }
      if (!bytes) throw new Error('Ses dosyası boş.');
      await writer.close(); completed = true;
    } finally {
      await reader.cancel().catch(() => undefined); reader.releaseLock();
      if (!completed) await writer.abort().catch(() => undefined);
      writer.releaseLock();
    }
    this.check();
    await this.playFile(target.uri);
  }

  async togglePlayback(): Promise<void> {
    this.check();
    if (!this.player) { await this.previewRecording(); return; }
    if (this.player.playing) this.player.pause();
    else {
      if (this.player.duration > 0 && this.player.currentTime >= this.player.duration - 0.1) await this.player.seekTo(0);
      this.check(); this.player.play();
    }
  }

  async dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    for (const listener of this.closedListeners) listener();
    this.closedListeners.clear();
    this.disposePromise = this.cleanup();
    return this.disposePromise;
  }
  private async cleanup() {
    this.appSubscription.remove();
    this.downloadAbort?.abort();
    if (this.downloadTimer) clearTimeout(this.downloadTimer);
    await this.startPromise?.catch(() => undefined);
    await this.finishing?.catch(() => undefined);
    await this.attachmentPromise?.catch(() => undefined);
    try { this.player?.pause(); this.player?.remove(); } catch { /* Native interruption may have released the player. */ }
    this.player = null;
    const recorder = this.recorder;
    this.recorder = null;
    try { if (recorder?.isRecording) await recorder.stop(); } catch { /* Cancel never publishes an incomplete recording. */ }
    const nativeUri = recorder?.uri;
    try { recorder?.release(); } catch { /* Native interruption. */ }
    removeFile(nativeUri); removeFile(this.recordingFile); removeFile(this.playbackFile);
    this.recordingFile = this.playbackFile = null;
    if (owner === this) {
      owner = null;
      await this.sdk?.setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: false, allowsBackgroundRecording: false }).catch(() => undefined);
    }
  }
}
