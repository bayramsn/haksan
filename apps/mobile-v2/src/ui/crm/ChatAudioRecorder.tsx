import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Button } from '@/src/ui';
import { useAuth } from '@/src/auth/AuthProvider';
import { requestContextKey } from '@/src/api/client';
import type { LocalUpload } from '@/src/native/files';
import { ChatAudioSession, type RecordedChatAudio } from '@/src/native/chat-audio';
import { CHAT_AUDIO_MAX_SECONDS, chatAudioDuration } from '@/src/native/chat-audio-policy';

type Phase = 'idle' | 'starting' | 'recording' | 'preview' | 'attaching';
/** onAttach uploads to the pending message only; the existing chat Send action remains explicit. */
export function ChatAudioRecorder({ disabled, onAttach, onBusyChange }: {
  disabled?: boolean;
  onAttach: (audio: LocalUpload) => Promise<void>;
  onBusyChange?: (active: boolean) => void;
}) {
  useAuth();
  const context = requestContextKey();
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<ChatAudioSession | null>(null);
  const recording = useRef<RecordedChatAudio | null>(null);
  const mounted = useRef(true), busy = useRef(false), busyCallback = useRef(onBusyChange), generation = useRef(0);
  busyCallback.current = onBusyChange;

  useEffect(() => {
    mounted.current = true; busy.current = false;
    setPhase('idle'); setElapsed(0); setPlaying(false); setError(null); recording.current = null;
    return () => { generation.current += 1; mounted.current = false; const current = session.current; session.current = null; void current?.dispose(); busyCallback.current?.(false); };
  }, [context]);
  useEffect(() => { busyCallback.current?.(phase !== 'idle'); }, [phase]);

  async function cancel() {
    const epoch = generation.current;
    const current = session.current;
    session.current = null; recording.current = null;
    await current?.dispose();
    if (mounted.current && epoch === generation.current && !session.current) { setPhase('idle'); setElapsed(0); setPlaying(false); }
  }
  async function finish() {
    const epoch = generation.current;
    const current = session.current;
    if (!current || busy.current) return;
    busy.current = true;
    try {
      const prepared = await current.finishRecording();
      if (mounted.current && session.current === current) {
        recording.current = prepared; setElapsed(prepared.durationMillis); setPhase('preview'); setPlaying(false);
      }
    } catch (cause) {
      await cancel();
      if (mounted.current && epoch === generation.current && AppState.currentState === 'active') setError(cause instanceof Error ? cause.message : 'Ses kaydı tamamlanamadı.');
    } finally { if (epoch === generation.current) busy.current = false; }
  }
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'preview') return;
    const timer = setInterval(() => {
      const current = session.current;
      if (!current) return;
      try {
        const status = current.status();
        if (phase === 'recording') {
          setElapsed(status.durationMillis);
          if (status.durationMillis >= CHAT_AUDIO_MAX_SECONDS * 1000 || (!status.recording && status.durationMillis > 0)) void finish();
        }
        setPlaying(status.playing);
      } catch {
        void cancel();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  async function start() {
    const epoch = generation.current;
    if (disabled || busy.current || session.current) return;
    busy.current = true; setError(null); setPhase('starting');
    const current = new ChatAudioSession(); session.current = current;
    current.onClosed(() => {
      if (session.current !== current) return;
      session.current = null; recording.current = null;
      if (mounted.current) { setPhase('idle'); setPlaying(false); setElapsed(0); busyCallback.current?.(false); }
    });
    try {
      await current.startRecording();
      if (mounted.current && session.current === current) setPhase('recording');
    } catch (cause) {
      if (session.current === current) await cancel();
      if (mounted.current && context === requestContextKey()) setError(cause instanceof Error ? cause.message : 'Mikrofona erişilemedi.');
    } finally { if (epoch === generation.current) busy.current = false; }
  }
  async function attach() {
    const epoch = generation.current;
    const prepared = recording.current, current = session.current;
    if (disabled || busy.current || !prepared || !current) return;
    busy.current = true; setPhase('attaching'); setError(null);
    try {
      current.status();
      await onAttach(prepared.upload);
      if (session.current === current) await cancel();
    } catch (cause) {
      if (mounted.current && session.current === current) { setPhase('preview'); setError(cause instanceof Error ? cause.message : 'Ses kaydı eklenemedi. Yeniden deneyin.'); }
    } finally { if (epoch === generation.current) busy.current = false; }
  }
  async function preview() {
    const epoch = generation.current;
    if (busy.current || !session.current) return;
    busy.current = true; setError(null);
    try { await session.current.togglePlayback(); }
    catch (cause) { if (mounted.current && epoch === generation.current) setError(cause instanceof Error ? cause.message : 'Ses kaydı dinlenemedi.'); }
    finally { if (epoch === generation.current) busy.current = false; }
  }

  return <View className="gap-2">
    {phase === 'idle' ? <Button label="Sesli mesaj kaydet" variant="ghost" trailingIcon="mic-outline" disabled={disabled} onPress={() => void start()} /> : <View className="gap-2 rounded-control border border-border bg-card p-3">
      <Text accessibilityLiveRegion="polite" className="font-inter-medium text-sm text-foreground">{phase === 'starting' ? 'Mikrofon hazırlanıyor…' : phase === 'recording' ? `Ses kaydı · ${chatAudioDuration(elapsed)} / 5:00` : `Ses kaydı · ${chatAudioDuration(elapsed)}`}</Text>
      <View className="flex-row flex-wrap gap-2">
        {phase === 'recording' ? <Button label="Kaydı durdur" variant="ghost" trailingIcon="stop-outline" onPress={() => void finish()} /> : null}
        {phase === 'preview' ? <>
          <Button label={playing ? 'Duraklat' : 'Dinle'} variant="ghost" trailingIcon={playing ? 'pause-outline' : 'play-outline'} onPress={() => void preview()} />
          <Button label="Sohbete ekle" trailingIcon="attach-outline" disabled={disabled} onPress={() => void attach()} />
        </> : null}
        <Button label={phase === 'preview' ? 'Kaydı sil' : 'İptal'} variant="ghost" trailingIcon="close-outline" disabled={phase === 'attaching'} onPress={() => void cancel()} />
      </View>
      {phase === 'preview' ? <Text className="font-inter text-xs text-muted-foreground">Önce dinleyin; hazır olduğunda mesaja ekleyin. Gönder düğmesiyle paylaşılır.</Text> : null}
      {phase === 'attaching' ? <Text className="font-inter text-xs text-muted-foreground">Ses kaydı mesaja ekleniyor…</Text> : null}
    </View>}
    {error ? <Text accessibilityRole="alert" className="font-inter text-xs text-destructive">{error}</Text> : null}
  </View>;
}
