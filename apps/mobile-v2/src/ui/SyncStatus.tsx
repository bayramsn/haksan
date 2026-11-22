import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { failedCount, subscribeQueue } from '@/src/offline/queue';

/**
 * Çevrimdışıyken ve kuyrukta bekleyen işlem varken görünür. Sessiz kuyruk
 * kullanıcıya "kaydettim" yalanı söyler; bu şerit onu görünür kılar.
 * Dokununca Ayarlar senkron bölümüne gider (mobil UX; iş web ile aynı kuyruk).
 */
export function SyncStatus() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => subscribeQueue((count) => {
    setPending(count);
    setFailed(failedCount());
  }), []);
  useEffect(
    () => NetInfo.addEventListener((s) => setOnline(Boolean(s.isConnected && s.isInternetReachable !== false))),
    []
  );

  if (online && pending === 0) return null;

  const tone = failed > 0 ? 'bg-destructive-soft' : online ? 'bg-info-soft' : 'bg-warning-soft';
  const text = failed > 0 ? 'text-destructive' : online ? 'text-info' : 'text-warning';
  const label = failed > 0
    ? `${failed} işlem çözümlenemedi — dokunarak senkronizasyonu açın`
    : !online
    ? pending > 0
      ? `Çevrimdışı — ${pending} güvenli işlem bağlantı bekliyor`
      : 'Çevrimdışı — çevrimiçi işlemler bağlantı gelene kadar kullanılamaz'
    : `${pending} işlem gönderiliyor…`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Ayarlar senkronizasyon bölümünü açar"
      onPress={() => router.push('/more/settings')}
      accessibilityLiveRegion="polite"
      className={`flex-row items-center gap-2 px-4 py-2 active:opacity-80 ${tone}`}
    >
      <View className={`h-1.5 w-1.5 rounded-full ${failed > 0 ? 'bg-destructive' : online ? 'bg-info' : 'bg-warning'}`} />
      <Text selectable className={`flex-1 text-xs font-inter-semibold ${text}`}>{label}</Text>
      <Text className={`text-xs font-inter-medium ${text}`}>Aç ›</Text>
    </Pressable>
  );
}
