import { Redirect } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { kv } from '@/src/offline/storage';
import { ONBOARDING_KEY } from './onboarding';

export default function Index() {
  const { user } = useAuth();
  if (user) return <Redirect href="/(tabs)" />;
  // Tanıtım yalnızca ilk açılışta; depolama hydrate edildikten sonra okunuyor
  // (RootLayout hydrate bitmeden hiçbir şey render etmiyor).
  if (!kv.getString(ONBOARDING_KEY)) return <Redirect href="/onboarding" />;
  return <Redirect href="/(auth)/login" />;
}
