import { runStartup } from './startup';
import { StartupRecovery } from './StartupRecovery';
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SplashScreen from 'expo-splash-screen';
import * as SecureStore from '@/src/security/secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { useTheme } from '@/src/theme/theme';
import { Button } from '@/src/ui';
import { Logo } from '@/src/ui/Logo';

const ENABLED_KEY = 'haksan_biometric_lock_enabled';

type BiometricLockState = {
  enabled: boolean;
  available: boolean;
  busy: boolean;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  unlock: () => Promise<boolean>;
};

const Context = createContext<BiometricLockState | null>(null);

async function deviceAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

async function authenticate(reason: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
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
  const { user, signOut, loading, scopeBoundary } = useAuth();
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const [startupFailed, setStartupFailed] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [enabled, setEnabledState] = useState(false);
  const [available, setAvailable] = useState(false);
  const [verifiedAccount, setVerifiedAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verifying = useRef(false);
  const prompted = useRef<string | null>(null);
  const account = user ? JSON.stringify([user.tenantId, user.id]) : null;
  const locked = Boolean(enabled && account && verifiedAccount !== account);

  useEffect(() => {
    let cancelled = false;
    setStartupFailed(false);
    setReady(false);
    void runStartup(async () => {
      const [stored, capable] = await Promise.all([
        SecureStore.getItemAsync(ENABLED_KEY),
        deviceAvailable().catch(() => false),
      ]);
      return { stored, capable };
    }).then(({ stored, capable }) => {
      if (cancelled) return;
      const active = stored === 'true';
      setEnabledState(active);
      setAvailable(capable);
      setReady(true);
    }).catch(() => { if (!cancelled) setStartupFailed(true); });
    return () => { cancelled = true; };
  }, [startupAttempt]);

  useEffect(() => {
    if (!account) {
      prompted.current = null;
      setVerifiedAccount(null);
    }
  }, [account]);

  const unlock = useCallback(async () => {
    if (!enabled || !account || verifiedAccount === account) return true;
    if (verifying.current) return false;
    verifying.current = true;
    setBusy(true);
    try {
      const success = await authenticate('Haksan girişini doğrulayın');
      if (success) setVerifiedAccount(account);
      return success;
    } catch {
      return false;
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }, [account, enabled, verifiedAccount]);

  useEffect(() => {
    if (!ready || loading || !locked || !account || prompted.current === account) return;
    prompted.current = account;
    void SplashScreen.hideAsync().catch(() => undefined).then(unlock);
  }, [account, loading, locked, ready, unlock]);

  const changeEnabled = useCallback(async (next: boolean) => {
    if (verifying.current) return false;
    verifying.current = true;
    setBusy(true);
    try {
      if (next) {
        const capable = await deviceAvailable();
        setAvailable(capable);
        if (!capable || !(await authenticate('Biyometrik kilidi etkinleştirin'))) return false;
        await SecureStore.setItemAsync(ENABLED_KEY, 'true');
        setVerifiedAccount(account);
        setEnabledState(true);
        return true;
      }
      if (enabled && !(await authenticate('Biyometrik kilidi kapatın'))) return false;
      await SecureStore.deleteItemAsync(ENABLED_KEY);
      setEnabledState(false);
      setVerifiedAccount(null);
      return true;
    } catch {
      return false;
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }, [account, enabled]);

  const value = useMemo<BiometricLockState>(
    () => ({ enabled, available, busy, setEnabled: changeEnabled, unlock }),
    [available, busy, changeEnabled, enabled, unlock]
  );

  if (startupFailed) return <StartupRecovery onRetry={() => setStartupAttempt(value => value + 1)} />;
  if (!ready) return null;

  return (
    <Context.Provider value={value}>
      {locked && user ? (
        <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
          <View className="flex-1 items-center justify-center gap-5 px-8">
            <Logo width={140} />
            <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-soft">
              <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
            </View>
            <View className="gap-2">
              <Text accessibilityRole="header" className="text-center font-display text-[24px] text-foreground">Kilitli</Text>
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
      ) : <Fragment key={scopeBoundary}>{children}</Fragment>}
    </Context.Provider>
  );
}

export function useBiometricLock(): BiometricLockState {
  const value = useContext(Context);
  if (!value) throw new Error('useBiometricLock, BiometricLockProvider dışında kullanılamaz');
  return value;
}
