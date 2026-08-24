import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Button } from '@/src/ui';

const ENABLED_KEY = 'haksan_biometric_lock_enabled';
const BACKGROUND_LOCK_DELAY_MS = 30_000;

type BiometricLockState = {
  enabled: boolean;
  available: boolean;
  busy: boolean;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  unlock: () => Promise<boolean>;
};

const Context = createContext<BiometricLockState | null>(null);

async function deviceAvailable(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

async function authenticate(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    promptSubtitle: 'Haksan iş verilerinizi korur',
    cancelLabel: 'Vazgeç',
    fallbackLabel: 'Cihaz parolasını kullan',
    disableDeviceFallback: false,
  });
  return result.success;
}

export function BiometricLockProvider({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [available, setAvailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  // Etkinleştirme sırasında kullanıcı zaten doğrulandı; enabled state'ini
  // izleyen cold-start etkisinin aynı oturumda ikinci kez sormasını engeller.
  const skipNextEnableLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, capable] = await Promise.all([
        SecureStore.getItemAsync(ENABLED_KEY),
        deviceAvailable().catch(() => false),
      ]);
      if (cancelled) return;
      const active = stored === 'true';
      setEnabledState(active);
      setAvailable(capable);
      setLocked(active && Boolean(user));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLocked(false);
      return;
    }
    if (enabled) {
      if (skipNextEnableLock.current) {
        skipNextEnableLock.current = false;
        setLocked(false);
      } else {
        setLocked(true);
      }
    }
  }, [enabled, ready, user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const elapsed = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        backgroundedAt.current = null;
        if (enabled && user && elapsed >= BACKGROUND_LOCK_DELAY_MS) setLocked(true);
      } else if (next === 'background' || next === 'inactive') {
        backgroundedAt.current ??= Date.now();
      }
    });
    return () => subscription.remove();
  }, [enabled, user]);

  const unlock = useCallback(async () => {
    if (!enabled || !user) {
      setLocked(false);
      return true;
    }
    setBusy(true);
    try {
      const success = await authenticate('Haksan kilidini açın');
      if (success) setLocked(false);
      return success;
    } finally {
      setBusy(false);
    }
  }, [enabled, user]);

  const changeEnabled = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const capable = await deviceAvailable();
        setAvailable(capable);
        if (!capable || !(await authenticate('Biyometrik kilidi etkinleştirin'))) return false;
        await SecureStore.setItemAsync(ENABLED_KEY, 'true');
        skipNextEnableLock.current = true;
        setEnabledState(true);
        setLocked(false);
        return true;
      }
      if (enabled && !(await authenticate('Biyometrik kilidi kapatın'))) return false;
      await SecureStore.deleteItemAsync(ENABLED_KEY);
      setEnabledState(false);
      setLocked(false);
      return true;
    } finally {
      setBusy(false);
    }
  }, [enabled]);

  const value = useMemo<BiometricLockState>(
    () => ({ enabled, available, busy, setEnabled: changeEnabled, unlock }),
    [available, busy, changeEnabled, enabled, unlock]
  );

  if (!ready) return null;

  return (
    <Context.Provider value={value}>
      {locked && user ? (
        <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
          <View className="flex-1 items-center justify-center gap-5 px-8">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-primary-soft">
              <Ionicons name="lock-closed-outline" size={38} color={colors.primary} />
            </View>
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-center font-display text-[30px] text-foreground">Haksan Kilitli</Text>
              <Text className="text-center font-inter text-sm leading-5 text-muted-foreground">
                CRM ve finans verilerini görmek için Face ID, parmak izi veya cihaz parolanızla doğrulayın.
              </Text>
            </View>
            <Button label="Kilidi Aç" loading={busy} onPress={() => void unlock()} className="w-full" />
            <Button
              label="Çıkış Yap"
              variant="ghost"
              onPress={() => void signOut()}
              className="w-full"
            />
          </View>
        </SafeAreaView>
      ) : children}
    </Context.Provider>
  );
}

export function useBiometricLock(): BiometricLockState {
  const value = useContext(Context);
  if (!value) throw new Error('useBiometricLock, BiometricLockProvider dışında kullanılamaz');
  return value;
}
