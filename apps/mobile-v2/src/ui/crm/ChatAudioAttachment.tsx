import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { requestContextKey } from '@/src/api/client';
import { ChatAudioSession } from '@/src/native/chat-audio';
import { chatAudioDuration } from '@/src/native/chat-audio-policy';
import { useTheme } from '@/src/theme/theme';

/** Authorized file ID only; no message-provided media URL or caller token enters the player. */
export function ChatAudioAttachment({ fileId, filename }: { fileId: string; filename: string }) {
  useAuth();
  const context = requestContextKey(), { colors } = useTheme();
  const [loading, setLoading] = useState(false), [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0), [duration, setDuration] = useState(0), [error, setError] = useState<string | null>(null);
  const session = useRef<ChatAudioSession | null>(null), mounted = useRef(true), busy = useRef(false);
  useEffect(() => {
    mounted.current = true; setLoading(false); setPlaying(false); setPosition(0); setDuration(0); setError(null);
    return () => { mounted.current = false; const current = session.current; session.current = null; void current?.dispose(); };
  }, [context, fileId]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!session.current) return;
      try {
        const status = session.current.status(); setPlaying(status.playing); setPosition(status.positionMillis); setDuration(status.durationMillis);
      } catch { void stop(); }
    }, 250);
    return () => clearInterval(timer);
  }, []);
  async function stop() {
    const current = session.current; session.current = null;
    await current?.dispose();
    if (mounted.current) { setLoading(false); setPlaying(false); setPosition(0); }
  }
  async function toggle() {
    if (busy.current) return;
    busy.current = true; setError(null);
    const current = session.current ?? new ChatAudioSession();
    const fresh = !session.current; session.current = current;
    if (fresh) current.onClosed(() => {
      if (session.current !== current) return;
      session.current = null;
      if (mounted.current) { setLoading(false); setPlaying(false); setPosition(0); }
    });
    try {
      if (fresh) { setLoading(true); await current.playAttachment(fileId); }
      else await current.togglePlayback();
    } catch (cause) {
      if (session.current === current) await stop();
      if (mounted.current && context === requestContextKey() && AppState.currentState === 'active') setError(cause instanceof Error ? cause.message : 'Sesli mesaj dinlenemedi.');
    } finally { busy.current = false; if (mounted.current && session.current === current) setLoading(false); }
  }
  return <View className="mt-1.5 gap-1">
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel={loading ? 'Sesli mesaj yükleniyor' : playing ? `${filename} duraklat` : `${filename} dinle`} accessibilityState={{disabled:loading,busy:loading}} disabled={loading} onPress={() => void toggle()} className="min-h-11 flex-1 flex-row items-center gap-2 rounded-control border border-border px-2 active:opacity-70">
        <Ionicons name={loading ? 'hourglass-outline' : playing ? 'pause-circle-outline' : 'play-circle-outline'} size={24} color={colors.primary} />
        <View className="flex-1">
          <Text className="font-inter-medium text-xs text-foreground" numberOfLines={1}>Sesli mesaj</Text>
          <Text className="font-inter text-[11px] text-muted-foreground">{loading ? 'Hazırlanıyor…' : `${chatAudioDuration(position)} / ${chatAudioDuration(duration)}`}</Text>
        </View>
      </Pressable>
      {(loading || session.current) ? <Pressable accessibilityRole="button" accessibilityLabel="Sesli mesajı durdur" onPress={() => void stop()} className="min-h-11 min-w-11 items-center justify-center rounded-control border border-border active:opacity-70"><Ionicons name="stop-outline" size={20} color={colors.mutedForeground} /></Pressable> : null}
    </View>
    {error ? <Text accessibilityRole="alert" className="font-inter text-xs text-destructive">{error}</Text> : null}
  </View>;
}
