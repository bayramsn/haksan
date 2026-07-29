import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/src/auth/AuthProvider';
import { FontProvider } from '@/src/theme/FontProvider';
import { colors } from '@/src/theme/tokens';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, authed } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    const inAuth = root === 'login' || root === 'forgot-password' || root === 'onboarding';
    if (!authed && !inAuth) router.replace('/login');
    else if (authed && inAuth) router.replace('/(tabs)');
  }, [loading, authed, segments, router]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FontProvider>
        <AuthProvider>
          <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="quick-create"
            options={{
              headerShown: false,
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="modules" options={{ headerShown: false }} />
          <Stack.Screen name="forms" options={{ headerShown: false }} />
          <Stack.Screen name="calendar-event" options={{ headerShown: false }} />
        </Stack>
        </AuthGate>
        </AuthProvider>
      </FontProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
});
