import '@/global.css';
// Zod hata mesajlarını Türkçeye çevirir; her formdan önce yüklenmeli.
import '@/src/lib/zodTr';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Paket kökünden import bütün font ağırlıklarını asset grafiğine ekliyor.
// Yalnız kullanılan alt yolları almak binary ve OTA boyutunu belirgin azaltır.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { queryClient } from '@/src/query/client';
import { AuthProvider, useAuth } from '@/src/auth/AuthProvider';
import { registerBackgroundSync, startConnectivitySync } from '@/src/offline/sync';
import { flushQueue, hydrateQueue, pendingCount } from '@/src/offline/queue';
import { hydrateStorage } from '@/src/offline/storage';
import { applyThemePreference, loadThemePreference } from '@/src/theme/preference';
import { usePush } from '@/src/push/usePush';
import { AppErrorBoundary } from '@/src/ui/AppErrorBoundary';
import { Toaster } from '@/src/ui/toast';
import { PendingTargetReplayer } from '@/src/navigation/PendingTargetReplayer';
import { useChatRealtimeLifecycle } from '@/src/realtime/chat';
import { wrapRoot } from '@/src/observability/sentry';
import { BiometricLockProvider } from '@/src/security/BiometricLockProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { loading, user } = useAuth();
  usePush(Boolean(user));
  useChatRealtimeLifecycle(Boolean(user));

  // Web ile aynı tipografi: gövde Inter, başlıklar Barlow Condensed.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
  // Font indirilemezse sistem fontuyla devam et; ekranı kilitleme.
  const ready = !loading && (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null; // splash açık kalır

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      {/* §2.3: karmaşık formlar alttan kayan tam ekran modal. */}
      <Stack.Screen name="modal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

function RootLayout() {
  // Depolama senkron okunuyor; diskten belleğe alınmadan hiçbir şey render edilmemeli
  // (API adresi, oturum önbelleği ve kuyruk buradan okunuyor).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void hydrateStorage()
      // Tema tercihi kv'den okunuyor; hydrate'ten önce uygulanamaz. Mutasyon
      // kuyruğu ise ayrı, şifreli SecureStore katmanından yüklenir.
      .then(async () => {
        applyThemePreference(loadThemePreference());
        await hydrateQueue();
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void registerBackgroundSync();
    const stop = startConnectivitySync();
    // Soğuk açılışta bekleyen işlem varsa hemen dene.
    if (pendingCount() > 0) void flushQueue();
    return stop;
  }, [hydrated]);

  if (!hydrated) return null; // splash açık kalır

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* CRM/finans/chat yanıtları PII içerir. Şifreli ve kullanıcı+tenant
            kapsamlı bir native cache gelene kadar disk persister kullanılmaz. */}
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <BiometricLockProvider>
                <BottomSheetModalProvider>
                  <StatusBar style="auto" />
                  <PendingTargetReplayer />
                  <Navigator />
                  {/* Başarı/bilgi bildirimleri Alert yerine buradan kayar. */}
                  <Toaster />
                </BottomSheetModalProvider>
              </BiometricLockProvider>
            </AuthProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
