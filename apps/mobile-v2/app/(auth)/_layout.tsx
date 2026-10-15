import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';
import { FixedScheme } from '@/src/theme/theme';

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href="/(tabs)" />;
  return (
    <FixedScheme scheme="light">
      <Stack screenOptions={{ headerShown: false }} />
    </FixedScheme>
  );
}
